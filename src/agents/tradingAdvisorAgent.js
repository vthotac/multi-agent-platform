const { BaseAgent } = require('./baseAgent');
const { complete } = require('../services/llmService');

const SYSTEM = `You are a market commentary assistant.
You are not a licensed financial advisor. Never promise returns.
Return STRICT JSON:
{
  "disclaimer": string,
  "symbols": [ { "symbol": string, "commentary": string, "risk": "low"|"medium"|"high" } ]
}`;

async function fetchYahooQuotes(symbols) {
  const uniq = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  if (!uniq.length) return {};
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    uniq.join(','),
  )}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'multi-agent-platform/1.0',
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Quote fetch failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  const quotes = json?.quoteResponse?.result || [];
  /** @type {Record<string, unknown>} */
  const bySymbol = {};
  for (const q of quotes) {
    if (q?.symbol) bySymbol[q.symbol] = q;
  }
  return bySymbol;
}

class TradingAdvisorAgent extends BaseAgent {
  async run(payload = {}) {
    const symbols = Array.isArray(payload.symbols) ? payload.symbols : [];
    if (!symbols.length) {
      throw new Error('payload.symbols must be a non-empty array');
    }

    const quotes = await this.withRetry(() => fetchYahooQuotes(symbols), {
      label: 'yahoo.quote',
    });

    const user = `Market snapshot (Yahoo finance public API, may be delayed):\n${JSON.stringify(
      quotes,
      null,
      2,
    )}\n\nUser question or focus: ${payload.question || 'Provide concise commentary per symbol.'}`;

    const raw = await this.withRetry(
      () =>
        complete({
          system: SYSTEM,
          user,
          temperature: 0.3,
        }),
      { label: 'gemini.tradingAdvisor' },
    );

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { disclaimer: 'Model returned non-JSON', symbols: [], raw };
    }

    await this.log('info', 'Trading advisor run complete', { symbols: symbols.length });

    return {
      agentType: 'trading_advisor',
      quotes,
      analysis: parsed,
    };
  }
}

module.exports = { TradingAdvisorAgent };
