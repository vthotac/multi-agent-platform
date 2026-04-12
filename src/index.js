const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./api/server');
const { Orchestrator } = require('./orchestrator/orchestrator');

const PORT = process.env.PORT || 3000;

function main() {
  const orchestrator = new Orchestrator({ enableQueue: true });
  const app = createApp(orchestrator);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Listening on :${PORT}`);
  });
}

main();
