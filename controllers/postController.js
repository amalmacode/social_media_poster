const path = require('path');
const { unlink, stat, copyFile } = require('fs').promises;
const Joi = require('joi');
const mediaModel = require('../models/mediaModel');
const accountModel = require('../models/accountModel');
const brandAccountModel = require('../models/brandAccountModel');
const postModel = require('../models/postModel');
const mediaService = require('../services/media/mediaService');
const { cropVideo, cropImage, probe, screenshot } = require('../services/media/mediaProcessor');
const { updateStatus: updateMediaStatus } = require('../models/mediaModel');
const { relativeUploadPath } = require('../services/storage/localStorageService');
const AppError = require('../utils/AppError');

const postSchema = Joi.object({
  mediaIds: Joi.alternatives().try(
    Joi.array().items(Joi.string().uuid()).min(1).max(10),
    Joi.string().uuid()
  ).required(),
  caption: Joi.string().allow('').max(5000),
  publishMode: Joi.string().valid('now', 'schedule').required(),
  scheduledFor: Joi.when('publishMode', { is: 'schedule', then: Joi.date().iso().greater('now').required(), otherwise: Joi.allow('', null) }),
  accounts: Joi.alternatives().try(Joi.array().items(Joi.string().uuid()), Joi.string().uuid()).required(),
  brandAccountIds: Joi.alternatives().try(Joi.array().items(Joi.string().uuid()), Joi.string().uuid()).optional(),
  youtubeTitle: Joi.string().allow('').max(100),
  tiktokTitle: Joi.string().allow('').max(2200),
  tiktokPrivacy: Joi.string().valid('PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY').default('PUBLIC_TO_EVERYONE'),
  pinterestBoardId: Joi.string().allow('').optional(),
  pinterestTitle: Joi.string().allow('').max(100),
  pinterestDescription: Joi.string().allow('').max(500),
  pinterestDestinationUrl: Joi.string().allow('').uri()
});

async function newPost(req, res, next) {
  try {
    const [media, accounts, brandAccounts] = await Promise.all([
      mediaModel.listByUser(req.user.id),
      accountModel.listByUser(req.user.id),
      brandAccountModel.listByUser(req.user.id)
    ]);
    const pinterestBoards = accounts
      .filter((a) => a.platform === 'pinterest')
      .flatMap((a) => (a.metadata_json?.boards || []).map((b) => ({ id: b.id, name: b.name })));
    res.render('posts/new', { title: 'Create post', media, accounts, brandAccounts, pinterestBoards });
  } catch (error) {
    next(error);
  }
}

async function uploadMedia(req, res, next) {
  try {
    const files = req.files;
    if (!files || !files.length) throw new AppError('Please choose at least one image or video.', 400);
    const results = await Promise.all(files.map((f) => mediaService.createFromUpload(req.user.id, f)));
    const errors = results.flatMap((m) => m.validation_errors);
    const ok = results.length - results.filter((m) => m.validation_errors.length).length;
    if (errors.length) req.flash('error', errors.join(' '));
    if (ok) req.flash('success', ok === 1 ? '1 file uploaded.' : `${ok} files uploaded.`);
    res.redirect('/posts/new');
  } catch (error) {
    next(error);
  }
}

async function createPost(req, res, next) {
  try {
    const raw = req.body;
    const mediaIdsRaw = Array.isArray(raw.mediaIds) ? raw.mediaIds : [raw.mediaIds].filter(Boolean);
    const body = {
      ...raw,
      mediaIds: mediaIdsRaw,
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [raw.accounts].filter(Boolean),
      brandAccountIds: Array.isArray(raw.brandAccountIds) ? raw.brandAccountIds : [raw.brandAccountIds].filter(Boolean)
    };
    const { value, error } = postSchema.validate(body, { stripUnknown: true });
    if (error) throw new AppError(error.message, 400);

    const mediaIds = Array.isArray(value.mediaIds) ? value.mediaIds : [value.mediaIds];
    const mediaItems = await Promise.all(mediaIds.map((id) => mediaModel.findForUser(id, req.user.id)));
    if (mediaItems.some((m) => !m)) throw new AppError('One or more media items not found.', 404);

    // Resolve brand accounts → connected_account_ids, merge with individually selected accounts
    const brandIds = Array.isArray(value.brandAccountIds) ? value.brandAccountIds : [value.brandAccountIds].filter(Boolean);
    const [brandAccountIds, brandDetails] = await Promise.all([
      brandIds.length ? brandAccountModel.resolveToAccountIds(brandIds) : Promise.resolve([]),
      brandIds.length ? Promise.all(brandIds.map((id) => brandAccountModel.findWithMembers(id, req.user.id))) : Promise.resolve([])
    ]);
    const applyWatermark = req.body.applyWatermark === '1';
    const brandWithWatermark = applyWatermark ? brandDetails.find((b) => b?.watermark_path) : null;
    const watermarkCfg = brandWithWatermark ? {
      path: brandWithWatermark.watermark_path,
      opacity: parseFloat(brandWithWatermark.watermark_opacity) || 0.5,
      position: brandWithWatermark.watermark_position || 'center',
      size: parseInt(brandWithWatermark.watermark_size, 10) || 20
    } : null;
    const individualIds = Array.isArray(value.accounts) ? value.accounts : [value.accounts].filter(Boolean);
    const allAccountIds = [...new Set([...brandAccountIds, ...individualIds])];
    if (!allAccountIds.length) throw new AppError('Choose at least one brand account or platform connection.', 400);

    const accounts = await accountModel.listByUser(req.user.id);
    const selected = accounts.filter((account) => allAccountIds.includes(account.id));
    if (!selected.length) throw new AppError('Choose at least one connected account.', 400);

    const post = await postModel.create({
      userId: req.user.id,
      mediaIds,
      caption: value.caption,
      scheduledFor: value.publishMode === 'schedule' ? value.scheduledFor : null,
      platformPayloads: {
        ...(watermarkCfg && { watermark: watermarkCfg }),
        youtube: { title: value.youtubeTitle, description: value.caption },
        tiktok: { title: value.tiktokTitle || value.caption, privacyLevel: value.tiktokPrivacy },
        pinterest: {
          boardId: value.pinterestBoardId || null,
          title: value.pinterestTitle,
          description: value.pinterestDescription || value.caption,
          destinationUrl: value.pinterestDestinationUrl
        }
      },
      targets: selected.map((account) => ({ platform: account.platform, connectedAccountId: account.id }))
    });

    const { enqueuePost } = require('../queues/publishQueue');
    await enqueuePost(post, post.scheduled_for);
    req.flash('success', post.scheduled_for ? 'Post scheduled.' : 'Publishing started.');
    res.redirect('/history');
  } catch (error) {
    next(error);
  }
}

async function deletePost(req, res, next) {
  try {
    const post = await postModel.findWithTargets(req.params.id);
    if (!post || post.user_id !== req.user.id) throw new AppError('Post not found.', 404);

    // Remove the BullMQ job if it is still queued; silently skip if Redis is down or job is already gone.
    try {
      const { publishQueue, publishJobId } = require('../queues/publishQueue');
      const job = await publishQueue.getJob(publishJobId(post.id));
      if (job) await job.remove();
    } catch { /* ignore; DB deletion proceeds regardless */ }

    await postModel.remove(post.id, req.user.id);
    req.flash('success', 'Post removed.');
    res.redirect(req.get('Referer') || '/history');
  } catch (error) {
    next(error);
  }
}

async function deleteMedia(req, res, next) {
  try {
    const media = await mediaModel.findForUser(req.params.id, req.user.id);
    if (!media) throw new AppError('Media not found.', 404);
    if (await mediaModel.hasLinkedPosts(media.id)) {
      req.flash('error', 'This media is used by a post and cannot be removed.');
      return res.redirect('/posts/new');
    }
    await mediaModel.remove(media.id, req.user.id);
    const toDelete = new Set([media.file_path]);
    if (media.thumbnail_path) toDelete.add(media.thumbnail_path);
    for (const rel of toDelete) {
      try { await unlink(path.resolve(process.cwd(), rel)); } catch { /* ignore missing file */ }
    }
    req.flash('success', 'Media removed.');
    res.redirect('/posts/new');
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const posts = await postModel.listByUser(req.user.id, { limit: 50 });
    res.render('posts/history', { title: 'Publishing history', posts });
  } catch (error) {
    next(error);
  }
}

async function scheduled(req, res, next) {
  try {
    const posts = await postModel.listByUser(req.user.id, { limit: 50, status: 'pending' });
    res.render('posts/scheduled', { title: 'Scheduled posts', posts });
  } catch (error) {
    next(error);
  }
}

async function reschedulePost(req, res, next) {
  try {
    const { scheduledFor } = req.body;
    if (!scheduledFor) throw new AppError('Scheduled date is required.', 400);
    const newDate = new Date(scheduledFor);
    if (isNaN(newDate.getTime()) || newDate <= new Date()) {
      throw new AppError('Scheduled date must be in the future.', 400);
    }

    const post = await postModel.reschedule(req.params.id, req.user.id, newDate);
    if (!post) throw new AppError('Post not found or is not pending.', 404);

    // Replace the BullMQ job with updated delay
    try {
      const { publishQueue, publishJobId, enqueuePost } = require('../queues/publishQueue');
      const existing = await publishQueue.getJob(publishJobId(post.id));
      if (existing) await existing.remove();
      await enqueuePost(post, newDate);
    } catch { /* Redis unavailable — DB is updated, job will be picked up on worker restart */ }

    req.flash('success', `Post rescheduled to ${newDate.toLocaleString()}.`);
    res.redirect(req.get('Referer') || '/scheduled');
  } catch (error) {
    next(error);
  }
}

async function cropMedia(req, res, next) {
  try {
    const media = await mediaModel.findForUser(req.params.id, req.user.id);
    if (!media) throw new AppError('Media not found.', 404);
    if (!media.mime_type?.startsWith('video/')) throw new AppError('Only videos can be cropped.', 400);
    if (!media.width || !media.height) throw new AppError('Video dimensions unknown — re-upload the file.', 400);

    const pctX = parseFloat(req.body.x);
    const pctY = parseFloat(req.body.y);
    const pctW = parseFloat(req.body.w);
    const pctH = parseFloat(req.body.h);
    if ([pctX, pctY, pctW, pctH].some((v) => isNaN(v) || v < 0 || v > 100)) {
      throw new AppError('Invalid crop coordinates.', 400);
    }

    const toEven = (n) => Math.floor(n / 2) * 2;
    const pixX = Math.round(pctX / 100 * media.width);
    const pixY = Math.round(pctY / 100 * media.height);
    const pixW = toEven(Math.round(pctW / 100 * media.width));
    const pixH = toEven(Math.round(pctH / 100 * media.height));
    if (pixW < 2 || pixH < 2) throw new AppError('Crop area too small.', 400);

    // Respond immediately — FFmpeg runs in background to avoid Cloudflare 504
    await updateMediaStatus(media.id, req.user.id, 'processing');
    req.flash('success', 'Cropping video — it will be ready in a few seconds, refresh to confirm.');
    res.redirect('/posts/new');

    const inputPath = path.resolve(process.cwd(), media.file_path);
    const thumbDir = path.dirname(inputPath);
    setImmediate(async () => {
      try {
        await cropVideo(inputPath, pixX, pixY, pixW, pixH);
        if (media.thumbnail_path) {
          try { await unlink(path.resolve(process.cwd(), media.thumbnail_path)); } catch { /* ignore */ }
        }
        const newThumbAbsolute = await screenshot(inputPath, thumbDir);
        const fileStat = await stat(inputPath);
        await mediaModel.update(media.id, req.user.id, {
          width: pixW, height: pixH,
          thumbnailPath: relativeUploadPath(newThumbAbsolute),
          sizeBytes: fileStat.size
        });
      } catch (err) {
        console.error(`[CropVideo] Failed for media ${media.id}:`, err.message);
        await updateMediaStatus(media.id, req.user.id, 'failed').catch(() => {});
      }
    });
  } catch (error) {
    next(error);
  }
}

async function cropImageMedia(req, res, next) {
  try {
    const media = await mediaModel.findForUser(req.params.id, req.user.id);
    if (!media) throw new AppError('Media not found.', 404);
    if (!media.mime_type?.startsWith('image/')) throw new AppError('Only images can be cropped here.', 400);

    // Resolve dimensions — use stored values or probe the file for older uploads
    let { width, height } = media;
    if (!width || !height) {
      const inputPath = path.resolve(process.cwd(), media.file_path);
      try {
        const meta = await probe(inputPath);
        const stream = meta.streams.find((s) => s.codec_type === 'video');
        if (stream) { width = stream.width || null; height = stream.height || null; }
      } catch { /* ignore */ }
    }
    if (!width || !height) throw new AppError('Image dimensions unknown — re-upload the file.', 400);

    const pctX = parseFloat(req.body.x);
    const pctY = parseFloat(req.body.y);
    const pctW = parseFloat(req.body.w);
    const pctH = parseFloat(req.body.h);
    if ([pctX, pctY, pctW, pctH].some((v) => isNaN(v) || v < 0 || v > 100)) {
      throw new AppError('Invalid crop coordinates.', 400);
    }

    const toEven = (n) => Math.floor(n / 2) * 2;
    const pixX = Math.round(pctX / 100 * width);
    const pixY = Math.round(pctY / 100 * height);
    const pixW = toEven(Math.round(pctW / 100 * width));
    const pixH = toEven(Math.round(pctH / 100 * height));
    if (pixW < 2 || pixH < 2) throw new AppError('Crop area too small.', 400);

    // Respond immediately — run FFmpeg in background
    await updateMediaStatus(media.id, req.user.id, 'processing');
    req.flash('success', 'Cropping image — refresh in a moment to see the result.');
    res.redirect('/posts/new');

    const inputPath = path.resolve(process.cwd(), media.file_path);
    setImmediate(async () => {
      try {
        await cropImage(inputPath, pixX, pixY, pixW, pixH);
        const fileStat = await stat(inputPath);
        await mediaModel.update(media.id, req.user.id, {
          width: pixW, height: pixH,
          thumbnailPath: media.thumbnail_path,
          sizeBytes: fileStat.size
        });
      } catch (err) {
        console.error(`[CropImage] Failed for media ${media.id}:`, err.message);
        await updateMediaStatus(media.id, req.user.id, 'failed').catch(() => {});
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { newPost, uploadMedia, deleteMedia, createPost, deletePost, history, scheduled, reschedulePost, cropMedia, cropImageMedia };
