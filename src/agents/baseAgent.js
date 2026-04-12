const { insertLog } = require('../integrations/supabase');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class BaseAgent {
  /**
   * @param {{ id: string, type: string, name?: string }} ctx
   */
  constructor(ctx) {
    this.id = ctx.id;
    this.type = ctx.type;
    this.name = ctx.name || ctx.type;
  }

  async log(level, message, meta = {}) {
    await insertLog(level, message, { agentId: this.id, agentType: this.type, ...meta });
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @param {{ retries?: number, baseDelayMs?: number, label?: string }} opts
   * @returns {Promise<T>}
   */
  async withRetry(fn, opts = {}) {
    const retries = typeof opts.retries === 'number' ? opts.retries : 3;
    const baseDelayMs = typeof opts.baseDelayMs === 'number' ? opts.baseDelayMs : 400;
    const label = opts.label || 'operation';
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        await this.log('warn', `${label} failed`, { attempt, message: msg });
        if (attempt >= retries) break;
        const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 120);
        await sleep(delay);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /**
   * @param {Record<string, unknown>} _payload
   * @returns {Promise<unknown>}
   */
  async run(_payload) {
    throw new Error('run() must be implemented by subclass');
  }
}

module.exports = { BaseAgent };
