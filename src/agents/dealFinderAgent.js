const cheerio = require('cheerio');
const { BaseAgent } = require('./baseAgent');
const { complete } = require('../services/llmService');

const SYSTEM = `You detect shopping/deal opportunities from webpage text.

The user will provide:
- a URL
- extracted page text
- an optional shopping/deal query such as "best iPhone 16 deals"

Your job:
1. Focus on findings relevant to the query if a query is provided.
2. Return STRICT JSON only:
{ "deals": [ { "title": string, "why": string, "confidence": number } ] }
3. confidence must be 0-1.
4. If nothing notable is found, return:
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

  if (payload.payload && Array.isArray(payload.payload.urls) && payload.payload.urls.length) {
    return payload.payload.urls.filter(Boolean);
  }

  return parseUrlsFromEnv();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'multi-agent-platform/1.0 (+https://example.local)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }

  return res.text();
}

class DealFinderAgent extends BaseAgent {
  async run(payload = {}) {
    const query = normalizeQuery(payload);
    const urls = normalizeUrls(payload);

    if (!urls.length) {
      throw new Error('No URLs supplied and DEAL_SCAN_URLS is empty');
    }

    const findings = [];

    for (const url of urls) {
      const html = await this.withRetry(() => fetchHtml(url), { label: `fetch:${url}` });
      const $ = cheerio.load(html);
      $('script, style, noscript').remove();

      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 24000);

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
            temperature: 0.25,
            cacheTtlMs: 300_000,
          }),
        { label: 'gemini.dealDetect' },
      );

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { deals: [], note: 'non-json model output', raw };
      }

      findings.push({
        url,
        query,
        deals: Array.isArray(parsed.deals) ? parsed.deals : [],
      });
    }

    await this.log('info', 'Deal scan complete', {
      pages: findings.length,
      query,
    });

    return {
      agentType: 'deal_finder',
      query,
      findings,
    };
  }
}

module.exports = { DealFinderAgent };