const path = require('path');
const { unlink, stat, copyFile } = require('fs').promises;
const Joi = require('joi');
const mediaModel = require('../models/mediaModel');
const mediaFolderModel = require('../models/mediaFolderModel');
const accountModel = require('../models/accountModel');
const brandAccountModel = require('../models/brandAccountModel');
const postModel = require('../models/postModel');
const mediaService = require('../services/media/mediaService');
const pinterestService = require('../services/platforms/pinterestService');
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
  accounts: Joi.alternatives().try(Joi.array().items(Joi.string().uuid()), Joi.string().uuid()).optional(),
  brandAccountIds: Joi.alternatives().try(Joi.array().items(Joi.string().uuid()), Joi.string().uuid()).optional(),
  whatsappChannel: Joi.string().valid('1').optional(),
  whatsappCaption: Joi.string().allow('').max(5000),
  whatsappLink: Joi.string().allow('').uri().optional(),
  youtubeTitle: Joi.string().allow('').max(100),
  tiktokTitle: Joi.string().allow('').max(2200),
  tiktokPrivacy: Joi.string().valid('PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY').default('PUBLIC_TO_EVERYONE'),
  pinterestBoardId: Joi.string().allow('').optional(),
  pinterestTitle: Joi.string().allow('').max(100),
  pinterestDescription: Joi.string().allow('').max(500),
  pinterestDestinationUrl: Joi.string().allow('').uri().optional()
});

async function newPost(req, res, next) {
  try {
    const [media, accounts, brandAccounts] = await Promise.all([
      mediaModel.listByUser(req.user.id, 200),
      accountModel.listByUser(req.user.id),
      brandAccountModel.listByUser(req.user.id)
    ]);
    const folders = await mediaFolderModel.ensureAndList(req.user.id, brandAccounts);
    const pinterestBoards = accounts
      .filter((a) => a.platform === 'pinterest')
      .flatMap((a) => (a.metadata_json?.boards || []).map((b) => ({ id: b.id, name: b.name })));

    let prefill = null;
    if (req.query.copyFrom) {
      const source = await postModel.findWithTargets(req.query.copyFrom);
      if (source && source.user_id === req.user.id) {
        const pp = source.platform_payloads || {};
        prefill = {
          caption: source.caption || '',
          mediaIds: source.mediaItems.map((m) => m.id),
          accountIds: source.targets.map((t) => t.connected_account_id).filter(Boolean),
          youtube: pp.youtube || {},
          tiktok: pp.tiktok || {},
          pinterest: pp.pinterest || {},
          whatsapp_channel: pp.whatsapp_channel || {},
          whatsappChannel: source.targets.some((t) => t.platform === 'whatsapp_channel'),
          watermark: !!pp.watermark
        };
      }
    }

    res.render('posts/new', { title: 'Create post', media, accounts, brandAccounts, pinterestBoards, folders, prefill });
  } catch (error) {
    next(error);
  }
}

async function uploadMedia(req, res, next) {
  const isXhr = req.headers['x-requested-with'] === 'XMLHttpRequest';
  try {
    const files = req.files;
    if (!files || !files.length) {
      if (isXhr) return res.status(400).json({ error: 'Please choose at least one image or video.' });
      throw new AppError('Please choose at least one image or video.', 400);
    }
    const folderId = req.body.folderId || null;
    const results = await Promise.all(files.map((f) => mediaService.createFromUpload(req.user.id, f, folderId)));
    const errors = results.flatMap((m) => m.validation_errors);
    const ok = results.length - results.filter((m) => m.validation_errors.length).length;
    if (isXhr) return res.json({ ok, errors });
    if (errors.length) req.flash('error', errors.join(' '));
    if (ok) req.flash('success', ok === 1 ? '1 file uploaded.' : `${ok} files uploaded.`);
    res.redirect('/posts/new');
  } catch (error) {
    if (isXhr) return res.status(error.statusCode || 500).json({ error: error.message || 'Upload failed.' });
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
    if (error) {
      req.flash('error', error.details.map((d) => d.message).join(', '));
      return res.redirect('/posts/new');
    }

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
    const includeWhatsAppChannel = value.whatsappChannel === '1';
    if (!allAccountIds.length && !includeWhatsAppChannel) {
      throw new AppError('Choose at least one brand account, platform connection, or WhatsApp Channel assisted destination.', 400);
    }

    const accounts = await accountModel.listByUser(req.user.id);
    const selected = accounts.filter((account) => allAccountIds.includes(account.id));
    if (!selected.length && !includeWhatsAppChannel) throw new AppError('Choose at least one connected account.', 400);
    const selectedWhatsApp = selected.find((account) => account.platform === 'whatsapp_channel');

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
        },
        whatsapp_channel: {
          caption: value.whatsappCaption || selectedWhatsApp?.metadata_json?.defaultCaption || value.caption,
          link: value.whatsappLink || selectedWhatsApp?.metadata_json?.channelUrl || ''
        }
      },
      targets: [
        ...selected.map((account) => ({ platform: account.platform, connectedAccountId: account.id })),
        ...(includeWhatsAppChannel ? [{ platform: 'whatsapp_channel', connectedAccountId: null }] : [])
      ]
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

async function deletePinterestPin(req, res, next) {
  try {
    const target = await postModel.findTargetForUser(req.params.targetId, req.user.id);
    if (!target || target.platform !== 'pinterest') throw new AppError('Pinterest publish target not found.', 404);
    if (!target.remote_post_id) throw new AppError('This Pinterest target has no remote Pin id.', 400);
    if (target.api_response?.remote_deleted) {
      req.flash('success', 'This Pin was already marked as deleted.');
      return res.redirect(req.get('Referer') || '/history');
    }

    const account = await accountModel.findForUser(target.connected_account_id, req.user.id);
    if (!account) throw new AppError('Connected Pinterest account not found.', 404);
    await pinterestService.deletePin(account, target.remote_post_id);

    await postModel.markRemoteDeleted(target.id, {
      remote_deleted: true,
      remote_deleted_at: new Date().toISOString(),
      remote_deleted_by: req.user.id
    });
    req.flash('success', 'Pinterest Pin deleted.');
    res.redirect(req.get('Referer') || '/history');
  } catch (error) {
    next(error);
  }
}

async function markWhatsAppOpened(req, res, next) {
  try {
    const target = await postModel.findTargetForUser(req.params.targetId, req.user.id);
    if (!target || target.platform !== 'whatsapp_channel') throw new AppError('WhatsApp Channel target not found.', 404);
    if (!['ready_to_publish', 'opened_in_whatsapp'].includes(target.status)) {
      throw new AppError('This WhatsApp Channel post is not ready for manual publishing.', 400);
    }

    const apiResponse = {
      ...(target.api_response || {}),
      opened_in_whatsapp_at: new Date().toISOString()
    };
    await postModel.updateTargetStatus(target.id, {
      status: 'opened_in_whatsapp',
      apiResponse
    });
    await postModel.refreshPostRollupStatus(target.post_id);
    res.json({ ok: true });
  } catch (error) {
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to update WhatsApp status.' });
    }
    next(error);
  }
}

async function markWhatsAppPublished(req, res, next) {
  try {
    const target = await postModel.findTargetForUser(req.params.targetId, req.user.id);
    if (!target || target.platform !== 'whatsapp_channel') throw new AppError('WhatsApp Channel target not found.', 404);
    if (!['ready_to_publish', 'opened_in_whatsapp', 'published_manually'].includes(target.status)) {
      throw new AppError('This WhatsApp Channel post is not ready for manual confirmation.', 400);
    }

    const apiResponse = {
      ...(target.api_response || {}),
      published_manually_at: new Date().toISOString(),
      published_manually_by: req.user.id
    };
    await postModel.updateTargetStatus(target.id, {
      status: 'published_manually',
      apiResponse
    });
    await postModel.refreshPostRollupStatus(target.post_id);
    req.flash('success', 'WhatsApp Channel marked as manually published.');
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
    const { brand, account, from, to } = req.query;
    const filters = { limit: 50 };
    if (brand) filters.brandId = brand;
    if (account) filters.accountId = account;
    if (from) filters.dateFrom = new Date(from);
    if (to) {
      const d = new Date(to);
      d.setDate(d.getDate() + 1);
      filters.dateTo = d;
    }

    const [posts, accounts, brands] = await Promise.all([
      postModel.listByUser(req.user.id, filters),
      accountModel.listByUser(req.user.id),
      brandAccountModel.listByUser(req.user.id)
    ]);
    res.render('posts/history', {
      title: 'Publishing history', posts, accounts, brands,
      filters: { brand: brand || '', account: account || '', from: from || '', to: to || '' }
    });
  } catch (error) {
    next(error);
  }
}

async function scheduled(req, res, next) {
  try {
    const { brand, account, from, to } = req.query;
    const filters = { limit: 50, status: 'pending' };
    if (brand) filters.brandId = brand;
    if (account) filters.accountId = account;
    if (from) filters.dateFrom = new Date(from);
    if (to) {
      const d = new Date(to);
      d.setDate(d.getDate() + 1);
      filters.dateTo = d;
    }

    const [posts, accounts, brands] = await Promise.all([
      postModel.listByUser(req.user.id, filters),
      accountModel.listByUser(req.user.id),
      brandAccountModel.listByUser(req.user.id)
    ]);
    res.render('posts/scheduled', {
      title: 'Scheduled posts', posts, accounts, brands,
      filters: { brand: brand || '', account: account || '', from: from || '', to: to || '' }
    });
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

async function createFolder(req, res, next) {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Folder name is required.' });
    if (name.toUpperCase() === 'DIVERS') return res.status(400).json({ error: '"DIVERS" is a reserved name.' });
    const folder = await mediaFolderModel.createCustom(req.user.id, name);
    res.json({ folder: { ...folder, media_count: 0 } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists.' });
    next(err);
  }
}

async function deleteFolder(req, res, next) {
  try {
    const deleted = await mediaFolderModel.removeCustom(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Folder not found or cannot be deleted.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function moveMediaToFolder(req, res, next) {
  try {
    const folderId = req.body.folderId || null;
    if (folderId) {
      const folder = await mediaFolderModel.findForUser(folderId, req.user.id);
      if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    }
    const item = await mediaModel.moveToFolder(req.params.id, req.user.id, folderId);
    if (!item) return res.status(404).json({ error: 'Media not found.' });
    res.json({ ok: true, folderId: item.folder_id });
  } catch (err) {
    next(err);
  }
}

async function editPost(req, res, next) {
  try {
    const post = await postModel.findWithTargets(req.params.id);
    if (!post || post.user_id !== req.user.id) return res.status(404).render('errors/404');
    if (post.status !== 'pending' && post.status !== 'failed') {
      req.flash('error', 'Only pending or failed posts can be edited.');
      return res.redirect('/history');
    }
    const platforms = [...new Set(post.targets.map((t) => t.platform))];
    let pinterestBoards = [];
    if (platforms.includes('pinterest')) {
      const accounts = await accountModel.listByUser(req.user.id);
      const pa = accounts.find((a) => a.platform === 'pinterest');
      pinterestBoards = pa?.metadata_json?.boards || [];
    }
    res.render('posts/edit', { title: 'Edit post', post, platforms, pinterestBoards });
  } catch (err) { next(err); }
}

async function updatePost(req, res, next) {
  try {
    const { caption, scheduledFor } = req.body;
    const payload = req.body;
    const platformPayloads = {
      ...(payload.youtubeTitle !== undefined || payload.youtubeDescription !== undefined ? {
        youtube: { title: payload.youtubeTitle || '', description: payload.youtubeDescription || '' }
      } : {}),
      ...(payload.tiktokTitle !== undefined || payload.tiktokPrivacy !== undefined ? {
        tiktok: { title: payload.tiktokTitle || '', privacy: payload.tiktokPrivacy || 'PUBLIC_TO_EVERYONE' }
      } : {}),
      ...(payload.pinterestBoardId !== undefined || payload.pinterestTitle !== undefined ? {
        pinterest: {
          boardId: payload.pinterestBoardId || '',
          title: payload.pinterestTitle || '',
          description: payload.pinterestDescription || '',
          destinationUrl: payload.pinterestDestinationUrl || ''
        }
      } : {}),
      ...(payload.whatsappCaption !== undefined || payload.whatsappLink !== undefined ? {
        whatsapp_channel: {
          caption: payload.whatsappCaption || caption || '',
          link: payload.whatsappLink || ''
        }
      } : {})
    };
    const wasFailed = (await postModel.findWithTargets(req.params.id))?.status === 'failed';
    const updated = await postModel.update(req.params.id, req.user.id, {
      caption: caption || '',
      scheduledFor: scheduledFor || null,
      platformPayloads
    });
    if (!updated) {
      req.flash('error', 'Post not found or cannot be edited.');
      return res.redirect('/history');
    }

    try {
      const { publishQueue, publishJobId, enqueuePost } = require('../queues/publishQueue');
      if (wasFailed) {
        await postModel.resetFailedTargets(updated.id);
        await enqueuePost(updated, updated.scheduled_for);
        req.flash('success', updated.scheduled_for ? 'Post rescheduled.' : 'Re-publishing started.');
      } else {
        const existing = await publishQueue.getJob(publishJobId(updated.id));
        if (existing) await existing.remove();
        await enqueuePost(updated, updated.scheduled_for);
        req.flash('success', 'Post updated.');
      }
    } catch { /* Redis unavailable — DB is updated */ }
    res.redirect(wasFailed ? '/history' : '/scheduled');
  } catch (err) { next(err); }
}

module.exports = { newPost, uploadMedia, deleteMedia, createPost, deletePost, deletePinterestPin, markWhatsAppOpened, markWhatsAppPublished, history, scheduled, reschedulePost, cropMedia, cropImageMedia, createFolder, deleteFolder, moveMediaToFolder, editPost, updatePost };
