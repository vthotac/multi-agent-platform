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

    const payload = req.body && typeof req.body.payload === 'object' ? req.body.payload : {};
    const orchestrator = req.app.locals.orchestrator;
    const out = await orchestrator.enqueueAgentTask(agentId, payload);
    res.status(202).json(out);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
