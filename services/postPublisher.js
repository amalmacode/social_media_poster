const postModel = require('../models/postModel');
const accountModel = require('../models/accountModel');
const { getPlatformService } = require('./platforms/platformRegistry');
const { query } = require('../config/db');

async function publishPost(postId) {
  const post = await postModel.findWithTargets(postId);
  if (!post) throw new Error(`Post ${postId} not found`);
  await postModel.updatePostStatus(postId, 'processing');

  let success = 0;
  let failed = 0;
  let hasRetryable = false;

  // Skip targets that already succeeded in a previous BullMQ retry attempt
  const pendingTargets = post.targets.filter((t) => t.status !== 'success');

  for (const target of pendingTargets) {
    await postModel.updateTargetStatus(target.id, { status: 'processing' });
    try {
      const account = await accountModel.findForUser(target.connected_account_id, post.user_id);
      const service = getPlatformService(target.platform);
      const result = await service.publish({ account, post, media: post.media, mediaItems: post.mediaItems, target });
      await postModel.updateTargetStatus(target.id, {
        status: 'success',
        remotePostId: result.remotePostId,
        apiResponse: result.raw
      });
      success += 1;
    } catch (error) {
      const normalized = error.response ? getPlatformService(target.platform).normalizeError(error) : {
        retryable: Boolean(error.details?.retryable),
        message: error.message,
        response: error.details || null
      };
      console.error('Platform publish failed', JSON.stringify({
        postId,
        targetId: target.id,
        platform: target.platform,
        connectedAccountId: target.connected_account_id,
        retryable: normalized.retryable,
        message: normalized.message,
        response: normalized.response
      }, null, 2));
      await postModel.updateTargetStatus(target.id, {
        status: 'failed',
        errorMessage: normalized.message,
        apiResponse: normalized.response,
        failedPayload: { postId, targetId: target.id },
        incrementRetry: normalized.retryable
      });
      await query(
        `INSERT INTO api_error_logs (user_id, platform, post_platform_id, request_payload, response_payload, error_message, retryable)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [post.user_id, target.platform, target.id, { postId, targetId: target.id }, normalized.response, normalized.message, normalized.retryable]
      );
      failed += 1;
      if (normalized.retryable) hasRetryable = true;
    }
  }

  // Count targets that succeeded in earlier retry rounds
  const prevSuccess = post.targets.length - pendingTargets.length;
  const totalSuccess = success + prevSuccess;
  const status = failed === 0 ? 'success' : totalSuccess > 0 ? 'partial_success' : 'failed';
  await postModel.updatePostStatus(postId, status);

  // Throw after persisting status so BullMQ retries only when there are retryable failures
  if (hasRetryable) throw new Error(`Retryable failures on post ${postId}`);
  return { postId, status, success: totalSuccess, failed };
}

module.exports = { publishPost };
