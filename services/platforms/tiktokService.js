const fs = require('fs');
const path = require('path');
const BasePlatformService = require('./basePlatformService');
const accountModel = require('../../models/accountModel');
const { env } = require('../../config/env');
const { toSignedPublicUrl } = require('../storage/localStorageService');

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API = 'https://open.tiktokapis.com/v2';

// TikTok allows chunk_size up to 64 MB.
// Using a single chunk for files ≤ 64 MB avoids chunk-count validation errors
// (TikTok strictly validates total_chunk_count == ceil(video_size / chunk_size)).
// Files > 64 MB are split into 64 MB chunks to stay within the API maximum.
const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB

class TikTokService extends BasePlatformService {
  constructor() {
    super('tiktok');
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  async exchangeCode({ code, redirectUri, codeVerifier }) {
    const body = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      client_secret: env.tiktok.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      ...(codeVerifier && { code_verifier: codeVerifier })
    });
    const res = await this.client.post(TOKEN_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data;
  }

  // TikTok access tokens expire in 24 h; refresh when < 30 min left
  async refreshToken(account) {
    if (!account.refresh_token) return account;
    if (account.expires_at && new Date(account.expires_at).getTime() - Date.now() > 30 * 60 * 1000) return account;
    const body = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      client_secret: env.tiktok.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token
    });
    const res = await this.client.post(TOKEN_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return accountModel.updateTokens(account.id, {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token || account.refresh_token,
      expiresAt: res.data.expires_in ? new Date(Date.now() + res.data.expires_in * 1000) : null
    });
  }

  async getUserInfo(accessToken) {
    const res = await this.client.get(`${API}/user/info/`, {
      params: { fields: 'open_id,display_name,avatar_url' },
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data.data?.user || null;
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  async publish({ account, post, media, mediaItems }) {
    const freshAccount = await this.refreshToken(account);
    const items = (mediaItems && mediaItems.length) ? mediaItems : [media];
    const payload = post.platform_payloads?.tiktok || {};
    const title = (payload.title || post.caption || '').slice(0, 2200).trim() || 'Untitled';
    const privacyLevel = payload.privacyLevel || 'PUBLIC_TO_EVERYONE';

    const videos = items.filter((m) => m.mime_type.startsWith('video/'));
    const images = items.filter((m) => !m.mime_type.startsWith('video/'));

    if (videos.length) return this.publishVideo(freshAccount, videos[0], title, privacyLevel);
    return this.publishPhoto(freshAccount, images, title, privacyLevel);
  }

  async publishVideo(account, media, title, privacyLevel) {
    const filePath = path.resolve(process.cwd(), media.file_path);
    const fileSize = fs.statSync(filePath).size;
    const chunkSize = fileSize <= MAX_CHUNK_SIZE ? fileSize : MAX_CHUNK_SIZE;
    const totalChunks = Math.ceil(fileSize / chunkSize);

    let initRes;
    try {
      initRes = await this.client.post(`${API}/post/publish/video/init/`, {
        post_info: { title, privacy_level: privacyLevel, disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'FILE_UPLOAD', video_size: fileSize, chunk_size: chunkSize, total_chunk_count: totalChunks }
      }, {
        headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' }
      });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'unaudited_client_can_only_post_to_private_accounts' && privacyLevel !== 'SELF_ONLY') {
        console.warn('[TikTok] App not yet approved — retrying init as SELF_ONLY (sandbox fallback).');
        return this.publishVideo(account, media, title, 'SELF_ONLY');
      }
      throw err;
    }

    const { publish_id, upload_url } = initRes.data.data;

    const fd = fs.openSync(filePath, 'r');
    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize) - 1;
        const size = end - start + 1;
        const buffer = Buffer.alloc(size);
        fs.readSync(fd, buffer, 0, size, start);
        await this.client.put(upload_url, buffer, {
          headers: {
            'Content-Type': media.mime_type,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': size
          },
          maxBodyLength: Infinity,
          timeout: 0
        });
      }
    } finally {
      fs.closeSync(fd);
    }

    return this.pollStatus(account, publish_id);
  }

  async publishPhoto(account, images, title, privacyLevel) {
    if (!images.length) this.permanent('No images found for TikTok photo post.');
    const photoImages = images.slice(0, 35).map((img) => {
      const url = toSignedPublicUrl(img.file_path);
      if (!url) this.permanent('TikTok photo posting requires APP_URL or PUBLIC_MEDIA_BASE_URL to be set.');
      return url;
    });

    let res;
    try {
      res = await this.client.post(`${API}/post/publish/content/init/`, {
        post_info: { title, privacy_level: privacyLevel, disable_comment: false, auto_add_music: true, photo_cover_index: 0 },
        source_info: { source: 'PULL_FROM_URL', photo_images: photoImages, photo_cover_index: 0, media_type: 'PHOTO' }
      }, {
        headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' }
      });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'unaudited_client_can_only_post_to_private_accounts' && privacyLevel !== 'SELF_ONLY') {
        console.warn('[TikTok] App not yet approved — retrying photo init as SELF_ONLY (sandbox fallback).');
        return this.publishPhoto(account, images, title, 'SELF_ONLY');
      }
      throw err;
    }

    return this.pollStatus(account, res.data.data.publish_id);
  }

  async pollStatus(account, publishId) {
    const processing = new Set(['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX']);
    for (let i = 0; i < 40; i++) {
      const res = await this.client.post(`${API}/post/publish/status/fetch/`, { publish_id: publishId }, {
        headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' }
      });
      const status = res.data.data?.status;
      if (status === 'PUBLISH_COMPLETE') return { platform: 'tiktok', remotePostId: publishId, raw: res.data };
      if (status === 'FAILED' || status === 'SPAM') this.permanent(`TikTok publish failed: ${status}`, { apiResponse: res.data });
      if (!processing.has(status)) this.permanent(`TikTok unexpected publish status: ${status}`, { apiResponse: res.data });
      await new Promise((r) => setTimeout(r, Math.min(15000, 3000 + i * 1000)));
    }
    this.permanent('TikTok publish timed out waiting for completion.');
  }
}

module.exports = new TikTokService();
