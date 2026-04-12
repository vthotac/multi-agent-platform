const { listAgents } = require('../integrations/supabase');

/**
 * Picks the next agent id for a type using in-memory round-robin.
 * Suitable when multiple registered agents share the same implementation.
 */
class LoadBalancer {
  constructor() {
    this.cursors = new Map();
  }

  async nextAgentIdForType(agentType) {
    const agents = await listAgents();
    const candidates = agents.filter((a) => a.agent_type === agentType).map((a) => a.id);
    if (!candidates.length) {
      const err = new Error(`No registered agents for type ${agentType}`);
      err.statusCode = 404;
      throw err;
    }
    const key = agentType;
    const idx = this.cursors.get(key) || 0;
    const pick = candidates[idx % candidates.length];
    this.cursors.set(key, idx + 1);
    return pick;
  }
}

module.exports = { LoadBalancer };
