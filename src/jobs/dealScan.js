const { getDealScanQueue } = require('../services/queueService');
const { listAgents, createTaskRow } = require('../integrations/supabase');

/**
 * @param {import('../orchestrator/orchestrator').Orchestrator} orchestrator
 */
function registerDealScanWorker(orchestrator) {
  const queue = getDealScanQueue();
  queue.process('deal-scan', 2, async (job) => {
    let agentId = job.data.agentId;
    if (!agentId) {
      const agents = await listAgents();
      const deal = agents.find((a) => a.agent_type === 'deal_finder');
      if (!deal) {
        return { skipped: true, reason: 'no_deal_finder_registered' };
      }
      agentId = deal.id;
    }
    const payload = job.data.payload && typeof job.data.payload === 'object' ? job.data.payload : { source: 'deal_scan' };
    const task = await createTaskRow({
      agent_id: agentId,
      payload,
      status: 'queued',
    });
    return orchestrator.executeAgentTask({
      supabaseTaskId: task.id,
      agentId,
      payload,
    });
  });
  return queue;
}

async function scheduleDealScanCron() {
  const cron = (process.env.DEAL_SCAN_CRON || '').trim();
  if (!cron) return null;
  const queue = getDealScanQueue();
  await queue.add('deal-scan', {}, { repeat: { cron }, jobId: 'deal-scan-repeat' });
  return cron;
}

module.exports = { registerDealScanWorker, scheduleDealScanCron };
