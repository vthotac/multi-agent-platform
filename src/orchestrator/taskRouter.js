const { getAgentById } = require('../integrations/supabase');
const { buildAgent } = require('./agentRegistry');

async function resolveExecutableAgent(agentId) {
  const row = await getAgentById(agentId);
  if (!row) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }
  const agent = buildAgent(row);
  return { row, agent };
}

module.exports = {
  resolveExecutableAgent,
};
