const cheerio = require('cheerio');
const { BaseAgent } = require('./baseAgent');
const { complete } = require('../services/llmService');

const SYSTEM = `You extract shopping deals from webpage text.

The user will provide:
- a URL
- extracted page text
- a shopping/deal query such as "best iPhone 16 deals"

Your job:
1. Focus only on findings relevant to the query.
2. Prefer exact product/query matches over generic Apple or phone references.
3. Return STRICT JSON only in this format:
{
  "deals": [
    {
      "title": string,
      "store": string,
      "url": string,
      "price": string,
      "why": string,
      "confidence": number
    }
  ]
}
4. confidence must be 0-1.
5. If a field is unknown, use an empty string.
6. If nothing relevant is found, return:
{ "deals": [] }`;

function parseUrlsFromEnv() {
  const raw = process.env.DEAL_SCAN_URLS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeQuery(payload = {}) {
  if (typeof payload.query === 'string' && payload.query.trim()) {
    return payload.query.trim();
  }

  if (typeof payload.input === 'string' && payload.input.trim()) {
    return payload.input.trim();
  }

  return '';
}

function normalizeUrls(payload = {}) {
  if (Array.isArray(payload.urls) && payload.urls.length) {
    return payload.urls.filter(Boolean);
  }

  if (
    payload.payload &&
    Array.isArray(payload.payload.urls) &&
    payload.payload.urls.length
  ) {
    return payload.payload.urls.filter(Boolean);
  }

  return [];
}

function encodeQuery(query) {
  return encodeURIComponent(query.trim());
}

function buildQueryDrivenUrls(query) {
  if (!query) return [];

  const q = encodeQuery(query);

  return [
    `https://slickdeals.net/newsearch.php?q=${q}`,
    `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,
    `https://www.amazon.com/s?k=${q}`,
  ];
}

function dedupeUrls(urls) {
  return [...new Set(urls.filter(Boolean))];
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; multi-agent-platform/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }

  return res.text();
}

function extractPageText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 24000);
}

function inferStoreFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('slickdeals')) return 'Slickdeals';
    if (host.includes('bestbuy')) return 'Best Buy';
    if (host.includes('amazon')) return 'Amazon';
    if (host.includes('camelcamelcamel')) return 'CamelCamelCamel';
    return host;
  } catch {
    return '';
  }
}

function normalizeDeals(url, deals) {
  if (!Array.isArray(deals)) return [];

  const store = inferStoreFromUrl(url);

  return deals
    .filter((deal) => deal && typeof deal === 'object')
    .map((deal) => ({
      title: typeof deal.title === 'string' ? deal.title.trim() : '',
      store:
        typeof deal.store === 'string' && deal.store.trim()
          ? deal.store.trim()
          : store,
      url: typeof deal.url === 'string' ? deal.url.trim() : url,
      price: typeof deal.price === 'string' ? deal.price.trim() : '',
      why: typeof deal.why === 'string' ? deal.why.trim() : '',
      confidence:
        typeof deal.confidence === 'number'
          ? Math.max(0, Math.min(1, deal.confidence))
          : 0,
    }))
    .filter((deal) => deal.title);
}

class DealFinderAgent extends BaseAgent {
  async run(payload = {}) {
    const query = normalizeQuery(payload);

    const explicitUrls = normalizeUrls(payload);
    const defaultUrls = parseUrlsFromEnv();
    const queryDrivenUrls = buildQueryDrivenUrls(query);

    const urls = dedupeUrls([
      ...explicitUrls,
      ...queryDrivenUrls,
      ...defaultUrls,
    ]);

    if (!urls.length) {
      throw new Error('No URLs supplied and DEAL_SCAN_URLS is empty');
    }

    const findings = [];
    const failures = [];
    const allDeals = [];

    for (const url of urls) {
      try {
        const html = await this.withRetry(() => fetchHtml(url), {
          label: `fetch:${url}`,
        });

        const text = extractPageText(html);

        const user = [
          `QUERY: ${query || '(none provided)'}`,
          `URL: ${url}`,
          `TEXT:`,
          text,
        ].join('\n');

        const raw = await this.withRetry(
          () =>
            complete({
              system: SYSTEM,
              user,
              temperature: 0.2,
              cacheTtlMs: 300_000,
            }),
          { label: 'gemini.dealDetect' }
        );

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { deals: [], note: 'non-json model output', raw };
        }

        const deals = normalizeDeals(url, parsed.deals);
        allDeals.push(...deals);

        findings.push({
          url,
          query,
          deals,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ url, message });

        await this.log('warn', 'Deal scan source failed', {
          url,
          query,
          message,
        });
      }
    }

    if (!findings.length) {
      throw new Error(
        `All deal scan sources failed: ${failures
          .map((f) => `${f.url} -> ${f.message}`)
          .join(' | ')}`
      );
    }

    const rankedDeals = allDeals
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    await this.log('info', 'Deal scan complete', {
      pages: findings.length,
      query,
      failedSources: failures.length,
      totalDeals: rankedDeals.length,
    });

    return {
      agentType: 'deal_finder',
      query,
      deals: rankedDeals,
      findings,
      failures,
    };
  }
}

module.exports = { DealFinderAgent };