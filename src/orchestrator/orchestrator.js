const {
  createTaskRow,
  updateTaskRow,
  createResultRow,
  insertLog,
} = require('../integrations/supabase');
const { getSupabaseAdmin } = require('../config/database');
const { resolveExecutableAgent } = require('./taskRouter');
const { getTaskQueue } = require('../services/queueService');
const { notify } = require('../services/notificationService');

class Orchestrator {
  /**
   * @param {{ enableQueue?: boolean }} opts
   */
  constructor(opts = {}) {
    this.enableQueue = opts.enableQueue !== false;
  }

  async enqueueAgentTask(agentId, payload = {}) {
    if (!this.enableQueue) {
      throw new Error('Queue is disabled');
    }
    const task = await createTaskRow({
      agent_id: agentId,
      payload,
      status: 'queued',
    });

    const queue = getTaskQueue();
    const job = await queue.add(
      'run-agent-task',
      {
        supabaseTaskId: task.id,
        agentId,
        payload,
      },
      { jobId: task.id },
    );

    await updateTaskRow(task.id, { bull_job_id: String(job.id), status: 'queued' });

    await insertLog('info', 'Task enqueued', {
      agentId,
      taskId: task.id,
      bullJobId: job.id,
    });

    return { taskId: task.id, bullJobId: job.id };
  }

  /**
   * Executes work for a Bull job or direct invocation.
   * @param {{ supabaseTaskId: string, agentId: string, payload?: Record<string, unknown> }} data
   */
  async executeAgentTask(data) {
    const { supabaseTaskId, agentId, payload = {} } = data;
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data: existing } = await sb
        .from('agent_tasks')
        .select('status, result')
        .eq('id', supabaseTaskId)
        .maybeSingle();
      if (existing?.status === 'succeeded' && existing.result != null) {
        return existing.result;
      }
    }

    const { agent } = await resolveExecutableAgent(agentId);

    await updateTaskRow(supabaseTaskId, { status: 'running' });
    await insertLog('info', 'Task running', { agentId, taskId: supabaseTaskId });

    try {
      const output = await agent.run(payload);
      await updateTaskRow(supabaseTaskId, { status: 'succeeded', result: output, error: null });
      const summary =
        typeof output === 'object' && output && 'agentType' in output
          ? String(output.agentType)
          : 'ok';
      await createResultRow({
        agent_id: agentId,
        task_id: supabaseTaskId,
        summary,
        data: output,
        error: null,
      });
      await notify('task.succeeded', { agentId, taskId: supabaseTaskId }).catch(() => {});
      return output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateTaskRow(supabaseTaskId, { status: 'failed', error: message, result: null });
      await createResultRow({
        agent_id: agentId,
        task_id: supabaseTaskId,
        summary: 'failed',
        data: {},
        error: message,
      });
      await insertLog('error', 'Task failed', { agentId, taskId: supabaseTaskId, message });
      await notify('task.failed', { agentId, taskId: supabaseTaskId, message }).catch(() => {});
      throw err;
    }
  }

  /**
   * Direct execution without Bull (useful for tests or synchronous mode).
   */
  async runInline(agentId, payload = {}) {
    const task = await createTaskRow({
      agent_id: agentId,
      payload,
      status: 'queued',
      bull_job_id: null,
    });
    return this.executeAgentTask({ supabaseTaskId: task.id, agentId, payload });
  }
}

module.exports = { Orchestrator };
