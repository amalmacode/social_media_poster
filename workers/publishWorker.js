require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('../queues/redis');
const { publishPost } = require('../services/postPublisher');

const worker = new Worker('publish-posts', async (job) => publishPost(job.data.postId), {
  connection,
  concurrency: Number(process.env.PUBLISH_WORKER_CONCURRENCY || 2),
  limiter: { max: 20, duration: 60000 }
});

worker.on('completed', (job, result) => console.log('Publish job completed', job.id, result));
worker.on('failed', (job, error) => console.error('Publish job failed', job?.id, error.message));
