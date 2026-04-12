const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./api/server');
const { Orchestrator } = require('./orchestrator/orchestrator');
const { registerTaskProcessor } = require('./jobs/taskProcessor');
const { registerEmailScanWorker, scheduleEmailScanCron } = require('./jobs/emailScan');
const { registerDealScanWorker, scheduleDealScanCron } = require('./jobs/dealScan');
const { insertLog } = require('./integrations/supabase');

const port = Number(process.env.PORT || 3000);

async function main() {
  await insertLog('info', 'Platform booting', { port });

  const orchestrator = new Orchestrator({ enableQueue: true });
  registerTaskProcessor(orchestrator, { concurrency: 5 });
  registerEmailScanWorker(orchestrator);
  registerDealScanWorker(orchestrator);

  await scheduleEmailScanCron().catch((e) => console.error('email scan cron', e));
  await scheduleDealScanCron().catch((e) => console.error('deal scan cron', e));

  const app = createApp(orchestrator);
  const server = app.listen(port, () => {
    console.log(`Listening on :${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`Shutting down (${signal})`);
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
