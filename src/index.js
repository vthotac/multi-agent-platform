const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./api/server');
const { Orchestrator } = require('./orchestrator/orchestrator');
const { registerTaskProcessor } = require('./jobs/taskProcessor');
const { registerEmailScanWorker, scheduleEmailScanCron } = require('./jobs/emailScan');
const { registerDealScanWorker, scheduleDealScanCron } = require('./jobs/dealScan');
const { insertLog } = require('./integrations/supabase');

const PORT = process.env.PORT || 3000;

async function bootstrapBackground(orchestrator) {
  try {
    await insertLog('info', 'Platform booting', { port: PORT });
  } catch (e) {
    console.error('insertLog failed during startup:', e?.message || e);
  }

  try {
    registerTaskProcessor(orchestrator, { concurrency: 5 });
  } catch (e) {
    console.error('registerTaskProcessor failed:', e?.message || e);
  }

  try {
    registerEmailScanWorker(orchestrator);
  } catch (e) {
    console.error('registerEmailScanWorker failed:', e?.message || e);
  }

  try {
    registerDealScanWorker(orchestrator);
  } catch (e) {
    console.error('registerDealScanWorker failed:', e?.message || e);
  }

  try {
    await scheduleEmailScanCron();
  } catch (e) {
    console.error('scheduleEmailScanCron failed:', e?.message || e);
  }

  try {
    await scheduleDealScanCron();
  } catch (e) {
    console.error('scheduleDealScanCron failed:', e?.message || e);
  }
}

function main() {
  const orchestrator = new Orchestrator({ enableQueue: true });
  const app = createApp(orchestrator);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Listening on :${PORT}`);
    bootstrapBackground(orchestrator).catch((e) => {
      console.error('bootstrapBackground failed:', e?.message || e);
    });
  });

  const shutdown = async (signal) => {
    console.log(`Shutting down (${signal})`);
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
