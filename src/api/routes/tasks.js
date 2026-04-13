const express = require('express');
const { getAgentById } = require('../../integrations/supabase');

const router = express.Router({ mergeParams: true });

router.post('/', async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const row = await getAgentById(agentId);
    if (!row) {
      const err = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const basePayload =
      body.payload && typeof body.payload === 'object' ? body.payload : {};

    const payload = {
      ...basePayload,
    };

    if (typeof body.input === 'string' && body.input.trim()) {
      payload.input = body.input.trim();
    }

    if (typeof body.query === 'string' && body.query.trim()) {
      payload.query = body.query.trim();
    }

    const orchestrator = req.app.locals.orchestrator;
    const out = await orchestrator.enqueueAgentTask(agentId, payload);
    res.status(202).json(out);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
