const { generateText } = require('../integrations/gemini');
const { cacheService, CacheService } = require('./cacheService');

/**
 * Gemini-backed LLM with optional caching for idempotent prompts.
 * @param {{ system?: string, user: string, temperature?: number, cacheTtlMs?: number }} input
 */
async function complete(input) {
  const ttl = typeof input.cacheTtlMs === 'number' ? input.cacheTtlMs : 0;
  if (ttl > 0) {
    const key = CacheService.hashKey({
      system: input.system || '',
      user: input.user,
      temperature: input.temperature ?? null,
    });
    const hit = cacheService.get(`llm:${key}`);
    if (hit) return hit;
    const out = await generateText(input);
    cacheService.set(`llm:${key}`, out, ttl);
    return out;
  }
  return generateText(input);
}

module.exports = { complete };
