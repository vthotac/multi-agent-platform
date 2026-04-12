const cheerio = require('cheerio');
const { BaseAgent } = require('./baseAgent');
const { complete } = require('../services/llmService');

const SYSTEM = `You detect shopping/deal opportunities from webpage text.
Return STRICT JSON: { "deals": [ { "title": string, "why": string, "confidence": number } ] }
confidence is 0-1. If nothing notable, return deals: [].`;

function parseUrlsFromEnv() {
  const raw = process.env.DEAL_SCAN_URLS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
    const urls = Array.isArray(payload.urls) && payload.urls.length ? payload.urls : parseUrlsFromEnv();
    if (!urls.length) {
      throw new Error('No URLs supplied in payload.urls and DEAL_SCAN_URLS is empty');
    }

    const findings = [];

    for (const url of urls) {
      const html = await this.withRetry(() => fetchHtml(url), { label: `fetch:${url}` });
      const $ = cheerio.load(html);
      $('script, style, noscript').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 24000);

      const user = `URL: ${url}\nTEXT:\n${text}`;
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

      findings.push({ url, deals: parsed.deals || [] });
    }

    await this.log('info', 'Deal scan complete', { pages: findings.length });

    return {
      agentType: 'deal_finder',
      findings,
    };
  }
}

module.exports = { DealFinderAgent };
