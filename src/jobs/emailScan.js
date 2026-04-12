const { getEmailScanQueue } = require('../services/queueService');
const { listAgents, createTaskRow } = require('../integrations/supabase');

/**
 * @param {import('../orchestrator/orchestrator').Orchestrator} orchestrator
 */
function registerEmailScanWorker(orchestrator) {
  const queue = getEmailScanQueue();
  queue.process('email-scan', 2, async (job) => {
    let agentId = job.data.agentId;
    if (!agentId) {
      const agents = await listAgents();
      const email = agents.find((a) => a.agent_type === 'email');
      if (!email) {
        return { skipped: true, reason: 'no_email_agent_registered' };
      }
      agentId = email.id;
    }
    const payload = job.data.payload && typeof job.data.payload === 'object' ? job.data.payload : { source: 'email_scan' };
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

async function scheduleEmailScanCron() {
  const cron = (process.env.EMAIL_SCAN_CRON || '').trim();
  if (!cron) return null;
  const queue = getEmailScanQueue();
  await queue.add('email-scan', {}, { repeat: { cron }, jobId: 'email-scan-repeat' });
  return cron;
}

module.exports = { registerEmailScanWorker, scheduleEmailScanCron };
