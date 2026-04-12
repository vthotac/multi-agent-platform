const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const agents = require('./routes/agents');
const { requireApiKey } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { pingRedis, setRedisHealthy } = require('../services/queueService');
const { getSupabaseAdmin } = require('../config/database');
const { listLogs } = require('../integrations/supabase');

/**
 * @param {import('../orchestrator/orchestrator').Orchestrator} orchestrator
 */
function createApp(orchestrator) {
  const app = express();
  app.locals.orchestrator = orchestrator;

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, _res, next) => {
    req.id = crypto.randomUUID();
    next();
  });

  app.get('/api/health', async (_req, res) => {
    let supabaseOk = false;
    try {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { error } = await sb.from('registered_agents').select('id').limit(1);
        supabaseOk = !error;
      }
    } catch {
      supabaseOk = false;
    }

    let redisOk = false;
    try {
      redisOk = await pingRedis();
    } catch {
      redisOk = false;
    }
    setRedisHealthy(redisOk);

    const ok = supabaseOk && redisOk;
    res.status(ok ? 200 : 503).json({
      ok,
      supabase: supabaseOk,
      redis: redisOk,
      ts: new Date().toISOString(),
    });
  });

  app.get('/api/logs', requireApiKey, async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const logs = await listLogs(limit);
      res.json({ logs });
    } catch (e) {
      next(e);
    }
  });

  app.use('/api/agents', requireApiKey, agents);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
