const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./api/server');
const { Orchestrator } = require('./orchestrator/orchestrator');
const { registerTaskProcessor } = require('./jobs/taskProcessor');

const PORT = process.env.PORT || 3000;

function main() {
  const orchestrator = new Orchestrator({ enableQueue: true });

  // Re-enable only the task processor so queued tasks can run
  try {
    registerTaskProcessor(orchestrator, { concurrency: 5 });
    console.log('Task processor registered');
  } catch (e) {
    console.error('registerTaskProcessor failed:', e?.message || e);
  }

  const app = createApp(orchestrator);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Listening on :${PORT}`);
  });
}

main();