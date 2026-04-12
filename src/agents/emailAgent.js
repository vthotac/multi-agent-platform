const { BaseAgent } = require('./baseAgent');
const { listRecentMessageIds, getMessageText } = require('../integrations/gmail');
const { complete } = require('../services/llmService');

const SYSTEM_SUMMARY = `You are an assistant that summarizes email for triage.
Return STRICT JSON with keys: summary (string), urgency (one of: low, medium, high, critical), rationale (string).
Urgency should reflect time-sensitivity and business impact, not emotional language.`;

class EmailAgent extends BaseAgent {
  async run(payload = {}) {
    const maxResults = Number(payload.maxResults ?? process.env.GMAIL_MAX_MESSAGES ?? 15);
    const query = typeof payload.query === 'string' ? payload.query : undefined;

    const ids = await this.withRetry(
      () => listRecentMessageIds({ maxResults, query }),
      { label: 'gmail.listRecentMessageIds' },
    );

    const items = [];
    for (const id of ids) {
      const msg = await this.withRetry(() => getMessageText(id), {
        label: `gmail.getMessageText:${id}`,
        retries: 2,
      });

      const user = `Subject: ${msg.subject}\nFrom: ${msg.from}\nSnippet: ${msg.snippet}\nBody:\n${msg.body}`;

      const raw = await this.withRetry(
        () =>
          complete({
            system: SYSTEM_SUMMARY,
            user,
            temperature: 0.2,
            cacheTtlMs: 120_000,
          }),
        { label: 'gemini.summarizeEmail' },
      );

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { summary: raw, urgency: 'medium', rationale: 'Model returned non-JSON' };
      }

      items.push({
        messageId: msg.id,
        subject: msg.subject,
        from: msg.from,
        summary: parsed.summary,
        urgency: parsed.urgency,
        rationale: parsed.rationale,
      });
    }

    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    items.sort((a, b) => (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9));

    await this.log('info', 'Email scan complete', { count: items.length });

    return {
      agentType: 'email',
      prioritized: items,
    };
  }
}

module.exports = { EmailAgent };
