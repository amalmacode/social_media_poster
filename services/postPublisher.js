const path = require('path');
const { unlink } = require('fs').promises;
const postModel = require('../models/postModel');
const accountModel = require('../models/accountModel');
const { getPlatformService } = require('./platforms/platformRegistry');
const { applyWatermark } = require('./media/mediaProcessor');
const { query } = require('../config/db');

async function publishPost(postId) {
  const post = await postModel.findWithTargets(postId);
  if (!post) throw new Error(`Post ${postId} not found`);
  await postModel.updatePostStatus(postId, 'processing');

  // Apply watermark to all media items once, before the platform loop
  const watermarkCfg = post.platform_payloads?.watermark;
  const tempFiles = [];
  let publishMedia = post.media;
  let publishItems = post.mediaItems;

  if (watermarkCfg?.path) {
    const wmAbs = path.resolve(process.cwd(), watermarkCfg.path);
    console.log(`[Watermark] Applying watermark to post ${postId} | file: ${watermarkCfg.path} | opacity: ${watermarkCfg.opacity} | position: ${watermarkCfg.position}`);
    const seen = new Map();

    async function withWatermark(m) {
      if (!m) return null;
      if (seen.has(m.id)) return seen.get(m.id);
      const inputAbs = path.resolve(process.cwd(), m.file_path);
      try {
        const tmpAbs = await applyWatermark(inputAbs, wmAbs, watermarkCfg.opacity, watermarkCfg.position, watermarkCfg.size);
        tempFiles.push(tmpAbs);
        console.log(`[Watermark] Created watermarked copy: ${path.basename(tmpAbs)}`);
        const result = { ...m, file_path: path.relative(process.cwd(), tmpAbs).replace(/\\/g, '/') };
        seen.set(m.id, result);
        return result;
      } catch (err) {
        console.error(`[Watermark] FAILED for ${m.file_path}: ${err.message} — publishing original`);
        seen.set(m.id, m);
        return m;
      }
    }

    publishItems = await Promise.all((post.mediaItems || []).map(withWatermark));
    publishMedia = post.media ? (seen.get(post.media.id) || await withWatermark(post.media)) : null;
    console.log(`[Watermark] Done — ${tempFiles.length} temp file(s) created`);
  } else {
    console.log(`[Watermark] No watermark config on post ${postId} — publishing originals`);
  }

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
      const result = await service.publish({ account, post, media: publishMedia, mediaItems: publishItems, target });
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

  // Clean up temp watermarked files (best-effort — don't let cleanup errors mask publish errors)
  await Promise.all(tempFiles.map((f) => unlink(f).catch(() => {})));

  // Throw after persisting status so BullMQ retries only when there are retryable failures
  if (hasRetryable) throw new Error(`Retryable failures on post ${postId}`);
  return { postId, status, success: totalSuccess, failed };
}

module.exports = { publishPost };
