const express = require('express');
const { listAgents, createAgentRow } = require('../../integrations/supabase');
const { isSupportedAgentType } = require('../../config/agents.config');
const tasksRouter = require('./tasks');
const resultsRouter = require('./results');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const agents = await listAgents();
    res.json({ agents });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, agent_type: agentType, metadata } = req.body || {};
    if (!name || !agentType) {
      const err = new Error('name and agent_type are required');
      err.statusCode = 400;
      throw err;
    }
    if (!isSupportedAgentType(agentType)) {
      const err = new Error(`Unsupported agent_type. Allowed: email, deal_finder, trading_advisor`);
      err.statusCode = 400;
      throw err;
    }
    const row = await createAgentRow({
      name,
      agent_type: agentType,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
    res.status(201).json({ agent: row });
  } catch (e) {
    next(e);
  }
});

router.use('/:id/tasks', tasksRouter);
router.use('/:id/results', resultsRouter);

module.exports = router;
