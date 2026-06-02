const IORedis = require('ioredis');
const { env } = require('../config/env');

function createRedisConnection() {
  const conn = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy(times) {
      // Never give up — connection heals itself when Redis comes back
      return Math.min(times * 300, 5000);
    }
  });

  conn.on('error', (error) => {
    if (error.code === 'ECONNREFUSED') {
      console.warn(`Redis not reachable at ${env.redisUrl}. Start Redis before publishing or running workers.`);
      return;
    }
    console.error('Redis connection error', error.message);
  });

  return conn;
}

// Long-lived connection kept by the worker process
const connection = createRedisConnection();

module.exports = { connection, createRedisConnection };
