const express = require('express');
const { getAgentById, listResultsForAgent } = require('../../integrations/supabase');

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  try {
    const agentId = req.params.id;
    const row = await getAgentById(agentId);
    if (!row) {
      const err = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const results = await listResultsForAgent(agentId, limit);
    res.json({ agentId, results });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
