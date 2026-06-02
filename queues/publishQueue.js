const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redis');
const AppError = require('../utils/AppError');

const JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 30000 },
  removeOnComplete: 500,
  removeOnFail: 1000
};

// Lazily created — not instantiated at module load so a cold start without Redis
// doesn't immediately trigger connection attempts or burn through retries.
let _conn = null;
let _queue = null;

function publishJobId(postId) {
  return `post-${postId}`;
}

function getQueue() {
  // Recreate both the connection and the Queue if this is the first call or the
  // previous connection permanently closed (should not happen with unlimited retries,
  // but kept as a safety net).
  if (!_conn || _conn.status === 'end') {
    _conn = createRedisConnection();
    _queue = new Queue('publish-posts', { connection: _conn, defaultJobOptions: JOB_OPTIONS });
  }
  return { queue: _queue, conn: _conn };
}

async function enqueuePost(post, scheduledFor) {
  const delay = scheduledFor ? Math.max(0, new Date(scheduledFor).getTime() - Date.now()) : 0;
  const { queue, conn } = getQueue();
  try {
    // With lazyConnect:true the connection stays in 'wait' until explicitly started.
    // BullMQ duplicates the connection internally, but we also connect ours so that
    // getQueue()'s status check stays accurate on subsequent calls.
    if (conn.status === 'wait') await conn.connect();
    return await queue.add('publish-post', { postId: post.id }, { delay, jobId: publishJobId(post.id) });
  } catch (error) {
    console.error('enqueuePost failed | conn status:', conn.status, '| error:', error.message);
    if (error.message?.includes('Custom Id cannot contain')) {
      throw new AppError(`Queue job id is invalid: ${error.message}`, 500, { cause: error.message });
    }
    throw new AppError('Queue is unavailable. Start Redis to publish or schedule posts.', 503, { cause: error.message });
  }
}

// Getter so postController always receives the current Queue instance
// even after a connection recreation.
module.exports = {
  get publishQueue() { return getQueue().queue; },
  publishJobId,
  enqueuePost
};
