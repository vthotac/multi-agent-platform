const { getSupabaseAdmin } = require('../config/database');

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return client;
}

async function insertLog(level, message, meta = {}) {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { error } = await client.from('platform_logs').insert({
    level,
    message,
    meta,
  });
  if (error) {
    console.error('[supabase] insertLog failed', error.message);
  }
  return error ? null : true;
}

async function listLogs(limit = 100) {
  const client = requireClient();
  const { data, error } = await client
    .from('platform_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500));
  if (error) throw error;
  return data || [];
}

async function listAgents() {
  const client = requireClient();
  const { data, error } = await client
    .from('registered_agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createAgentRow({ name, agent_type, metadata }) {
  const client = requireClient();
  const { data, error } = await client
    .from('registered_agents')
    .insert({ name, agent_type, metadata: metadata || {} })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function getAgentById(id) {
  const client = requireClient();
  const { data, error } = await client.from('registered_agents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function createTaskRow({ agent_id, payload, bull_job_id, status }) {
  const client = requireClient();
  const { data, error } = await client
    .from('agent_tasks')
    .insert({
      agent_id,
      payload: payload || {},
      bull_job_id: bull_job_id || null,
      status: status || 'queued',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function updateTaskRow(id, patch) {
  const client = requireClient();
  const { data, error } = await client
    .from('agent_tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function createResultRow({ agent_id, task_id, summary, data, error: errText }) {
  const client = requireClient();
  const rowPayload = {
    agent_id,
    task_id,
    summary,
    data: data || {},
    error: errText || null,
  };
  const { data: row, error } = await client
    .from('agent_results')
    .upsert(rowPayload, { onConflict: 'task_id' })
    .select('*')
    .single();
  if (error) throw error;
  return row;
}

async function listResultsForAgent(agentId, limit = 50) {
  const client = requireClient();
  const { data, error } = await client
    .from('agent_results')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
  if (error) throw error;
  return data || [];
}

module.exports = {
  insertLog,
  listLogs,
  listAgents,
  createAgentRow,
  getAgentById,
  createTaskRow,
  updateTaskRow,
  createResultRow,
  listResultsForAgent,
};
