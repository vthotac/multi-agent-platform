const crypto = require('crypto');

/**
 * Simple in-process TTL cache suitable for single-instance deployments.
 * For horizontal scale, point this at Redis in a follow-up iteration.
 */
class CacheService {
  constructor() {
    this.store = new Map();
  }

  static hashKey(parts) {
    const h = crypto.createHash('sha256');
    h.update(JSON.stringify(parts));
    return h.digest('hex');
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = 60_000) {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
  }
}

const singleton = new CacheService();

module.exports = {
  CacheService,
  cacheService: singleton,
};
