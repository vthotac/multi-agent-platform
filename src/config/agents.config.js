/**
 * Declarative agent types the platform knows how to instantiate.
 * Runtime instances are stored in Supabase (`registered_agents`).
 */
const AGENT_TYPES = {
  email: {
    id: 'email',
    displayName: 'Email agent',
    description: 'Gmail ingestion, Gemini summarization, urgency ranking',
    defaultQueue: 'agent-tasks',
  },
  deal_finder: {
    id: 'deal_finder',
    displayName: 'Deal finder',
    description: 'Web fetch + HTML extract + Gemini opportunity detection',
    defaultQueue: 'agent-tasks',
  },
  trading_advisor: {
    id: 'trading_advisor',
    displayName: 'Trading advisor',
    description: 'Quote snapshot + Gemini commentary (not financial advice)',
    defaultQueue: 'agent-tasks',
  },
};

const SUPPORTED_AGENT_TYPES = Object.keys(AGENT_TYPES);

function isSupportedAgentType(type) {
  return SUPPORTED_AGENT_TYPES.includes(type);
}

module.exports = {
  AGENT_TYPES,
  SUPPORTED_AGENT_TYPES,
  isSupportedAgentType,
};
