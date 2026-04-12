const { EmailAgent } = require('../agents/emailAgent');
const { DealFinderAgent } = require('../agents/dealFinderAgent');
const { TradingAdvisorAgent } = require('../agents/tradingAdvisorAgent');
const { isSupportedAgentType } = require('../config/agents.config');

const factories = {
  email: (row) =>
    new EmailAgent({
      id: row.id,
      type: row.agent_type,
      name: row.name,
    }),
  deal_finder: (row) =>
    new DealFinderAgent({
      id: row.id,
      type: row.agent_type,
      name: row.name,
    }),
  trading_advisor: (row) =>
    new TradingAdvisorAgent({
      id: row.id,
      type: row.agent_type,
      name: row.name,
    }),
};

function buildAgent(row) {
  if (!row || !row.agent_type) {
    throw new Error('Invalid agent row');
  }
  if (!isSupportedAgentType(row.agent_type)) {
    throw new Error(`Unsupported agent_type: ${row.agent_type}`);
  }
  const factory = factories[row.agent_type];
  if (!factory) {
    throw new Error(`No factory for agent_type: ${row.agent_type}`);
  }
  return factory(row);
}

module.exports = {
  buildAgent,
  factories,
};
