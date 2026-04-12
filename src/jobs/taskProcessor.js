const { getTaskQueue } = require('../services/queueService');

/**
 * @param {import('../orchestrator/orchestrator').Orchestrator} orchestrator
 * @param {{ concurrency?: number }} opts
 */
function registerTaskProcessor(orchestrator, opts = {}) {
  const queue = getTaskQueue();
  const concurrency = typeof opts.concurrency === 'number' ? opts.concurrency : 5;

  queue.process('run-agent-task', concurrency, async (job) => {
    const { supabaseTaskId, agentId, payload } = job.data;
    return orchestrator.executeAgentTask({
      supabaseTaskId,
      agentId,
      payload: payload || {},
    });
  });

  return queue;
}

module.exports = { registerTaskProcessor };
