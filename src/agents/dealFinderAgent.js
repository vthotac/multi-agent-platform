const cheerio = require('cheerio');
const { BaseAgent } = require('./baseAgent');
const { complete } = require('../services/llmService');

const SYSTEM = `You rank shopping deal candidates for a user query.

You will receive:
- a shopping query
- a source URL
- a list of extracted candidate items from that page

Your job:
1. Keep only candidates relevant to the query.
2. Prefer exact product/query matches over generic references.
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

function absoluteUrl(base, href) {
  if (!href || typeof href !== 'string') return '';
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function looksLikePrice(text) {
  return /\$\s?\d[\d,]*(\.\d{2})?/.test(text);
}

function extractPrice(text) {
  const match = String(text || '').match(/\$\s?\d[\d,]*(\.\d{2})?/);
  return match ? match[0].replace(/\s+/g, '') : '';
}

function queryTokens(query) {
  return cleanText(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length > 1);
}

function candidateScore(query, text) {
  const qTokens = queryTokens(query);
  const hay = cleanText(text).toLowerCase();
  if (!qTokens.length) return 0;

  let score = 0;
  for (const t of qTokens) {
    if (hay.includes(t)) score += 1;
  }

  if (hay.includes('iphone')) score += 2;
  if (hay.includes('deal')) score += 1;
  if (hay.includes('sale')) score += 1;
  if (hay.includes('discount')) score += 1;
  if (hay.includes('unlocked')) score += 1;
  if (looksLikePrice(hay)) score += 1;

  return score;
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

function extractCandidatesFromHtml(pageUrl, html, query) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const candidates = [];
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    const url = absoluteUrl(pageUrl, href);
    if (!url) return;

    const title = cleanText($a.text());
    const parentText = cleanText($a.parent().text()).slice(0, 400);
    const containerText = cleanText($a.closest('article, li, div').text()).slice(0, 500);

    const combined = cleanText(`${title} ${parentText} ${containerText}`);
    if (!combined || combined.length < 8) return;

    const score = candidateScore(query, combined);
    if (score < 2) return;

    const price = extractPrice(combined);
    const key = `${url}::${title}`;
    if (seen.has(key)) return;
    seen.add(key);

    candidates.push({
      title,
      url,
      price,
      snippet: combined.slice(0, 500),
      sourceUrl: pageUrl,
      score,
      store: inferStoreFromUrl(url || pageUrl),
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

function normalizeDeals(sourceUrl, deals) {
  const fallbackStore = inferStoreFromUrl(sourceUrl);

  if (!Array.isArray(deals)) return [];

  return deals
    .filter((deal) => deal && typeof deal === 'object')
    .map((deal) => ({
      title: cleanText(deal.title),
      store: cleanText(deal.store) || fallbackStore,
      url: cleanText(deal.url) || sourceUrl,
      price: cleanText(deal.price),
      why: cleanText(deal.why),
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

        const candidates = extractCandidatesFromHtml(url, html, query);

        if (!candidates.length) {
          findings.push({
            url,
            query,
            candidates: 0,
            deals: [],
          });
          continue;
        }

        const user = JSON.stringify(
          {
            query,
            sourceUrl: url,
            candidates,
          },
          null,
          2
        );

        const raw = await this.withRetry(
          () =>
            complete({
              system: SYSTEM,
              user,
              temperature: 0.15,
              cacheTtlMs: 300_000,
            }),
          { label: 'gemini.dealDetect' }
        );

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { deals: [] };
        }

        const deals = normalizeDeals(url, parsed.deals);
        allDeals.push(...deals);

        findings.push({
          url,
          query,
          candidates: candidates.length,
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