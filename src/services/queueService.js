const Queue = require('bull');
const IORedis = require('ioredis');

const QUEUE_NAME = 'agent-tasks';
const EMAIL_SCAN_QUEUE = 'email-scan';
const DEAL_SCAN_QUEUE = 'deal-scan';

let redisHealthy = false;

function requireRedisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }
  return url;
}

const defaultJobOptions = {
  removeOnComplete: 500,
  removeOnFail: 1000,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
};

let taskQueue;
let emailScanQueue;
let dealScanQueue;

function getTaskQueue() {
  if (!taskQueue) {
    taskQueue = new Queue(QUEUE_NAME, requireRedisUrl(), { defaultJobOptions });
  }
  return taskQueue;
}

function getEmailScanQueue() {
  if (!emailScanQueue) {
    emailScanQueue = new Queue(EMAIL_SCAN_QUEUE, requireRedisUrl(), { defaultJobOptions });
  }
  return emailScanQueue;
}

function getDealScanQueue() {
  if (!dealScanQueue) {
    dealScanQueue = new Queue(DEAL_SCAN_QUEUE, requireRedisUrl(), { defaultJobOptions });
  }
  return dealScanQueue;
}

async function pingRedis() {
  const redis = new IORedis(requireRedisUrl(), {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: false,
  });
  try {
    const pong = await redis.ping();
    redisHealthy = pong === 'PONG';
    return redisHealthy;
  } finally {
    redis.disconnect();
  }
}

function setRedisHealthy(v) {
  redisHealthy = Boolean(v);
}

function isRedisHealthy() {
  return redisHealthy;
}

module.exports = {
  QUEUE_NAME,
  EMAIL_SCAN_QUEUE,
  DEAL_SCAN_QUEUE,
  getTaskQueue,
  getEmailScanQueue,
  getDealScanQueue,
  pingRedis,
  isRedisHealthy,
  setRedisHealthy,
};
