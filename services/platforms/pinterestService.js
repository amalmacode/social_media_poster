const fs = require('fs');
const path = require('path');
const BasePlatformService = require('./basePlatformService');
const accountModel = require('../../models/accountModel');
const { env } = require('../../config/env');
const { toPublicUrl } = require('../storage/localStorageService');

const API = 'https://api.pinterest.com/v5';
const SCOPES = 'boards:read,pins:write,user_accounts:read';

class PinterestService extends BasePlatformService {
  constructor() {
    super('pinterest');
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  async exchangeCode({ code, redirectUri }) {
    const creds = Buffer.from(`${env.pinterest.clientId}:${env.pinterest.clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const res = await this.client.post(`${API}/oauth/token`, body.toString(), {
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data;
  }

  async refreshToken(account) {
    if (!account.refresh_token) return account;
    if (!account.expires_at || new Date(account.expires_at).getTime() - Date.now() > 1000 * 60 * 60 * 24 * 7) return account;
    const creds = Buffer.from(`${env.pinterest.clientId}:${env.pinterest.clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: account.refresh_token, scope: SCOPES });
    const res = await this.client.post(`${API}/oauth/token`, body.toString(), {
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return accountModel.updateTokens(account.id, {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token || account.refresh_token,
      expiresAt: res.data.expires_in ? new Date(Date.now() + res.data.expires_in * 1000) : null
    });
  }

  async getProfile(accessToken) {
    const res = await this.client.get(`${API}/user_account`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data;
  }

  async getBoards(accessToken) {
    const res = await this.client.get(`${API}/boards`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { page_size: 100 }
    });
    return res.data.items || [];
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  async publish({ account, post, media, mediaItems }) {
    const freshAccount = await this.refreshToken(account);
    const items = (mediaItems && mediaItems.length) ? mediaItems : [media];
    const payload = post.platform_payloads?.pinterest || {};

    if (!payload.boardId) this.permanent('Select a Pinterest board before publishing.');

    const images = items.filter((m) => !m.mime_type.startsWith('video/'));
    const videos = items.filter((m) => m.mime_type.startsWith('video/'));

    // Carousel: 2+ images → multiple_image_urls (max 5)
    if (images.length >= 2) return this.createCarouselPin(freshAccount, post, images, payload);

    // Single video
    if (videos.length && !images.length) return this.createVideoPin(freshAccount, post, videos[0], payload);

    // Single image (or first image from a mixed set)
    return this.createImagePin(freshAccount, post, images[0] || items[0], payload);
  }

  async createImagePin(account, post, media, payload) {
    const url = this.requirePublicUrl(media);
    const body = {
      board_id: payload.boardId,
      title: payload.title || '',
      description: payload.description || post.caption || '',
      ...(payload.destinationUrl && { link: payload.destinationUrl }),
      media_source: { source_type: 'image_url', url }
    };
    const res = await this.client.post(`${API}/pins`, body, {
      headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' }
    });
    return { platform: 'pinterest', remotePostId: res.data.id, raw: res.data };
  }

  async createCarouselPin(account, post, images, payload) {
    const carouselItems = images.slice(0, 5).map((img) => ({
      title: payload.title || '',
      description: payload.description || post.caption || '',
      ...(payload.destinationUrl && { link: payload.destinationUrl }),
      url: this.requirePublicUrl(img)
    }));
    const body = {
      board_id: payload.boardId,
      title: payload.title || '',
      description: payload.description || post.caption || '',
      media_source: { source_type: 'multiple_image_urls', items: carouselItems }
    };
    const res = await this.client.post(`${API}/pins`, body, {
      headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' }
    });
    return { platform: 'pinterest', remotePostId: res.data.id, raw: res.data };
  }

  async createVideoPin(account, post, media, payload) {
    // Step 1 — register upload slot
    const reg = await this.client.post(`${API}/media`, { media_type: 'video' }, {
      headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' }
    });
    const { media_id, upload_url, upload_parameters } = reg.data;

    // Step 2 — upload to S3 using native FormData + Blob (Node 18+)
    const form = new FormData();
    Object.entries(upload_parameters || {}).forEach(([k, v]) => form.append(k, v));
    const fileBuffer = fs.readFileSync(path.resolve(process.cwd(), media.file_path));
    form.append('file', new Blob([fileBuffer]), path.basename(media.file_path));
    await fetch(upload_url, { method: 'POST', body: form });

    // Step 3 — poll until processing finishes
    for (let i = 0; i < 30; i++) {
      const status = await this.client.get(`${API}/media/${media_id}`, {
        headers: { Authorization: `Bearer ${account.access_token}` }
      });
      if (status.data.status === 'succeeded') break;
      if (status.data.status === 'failed') this.permanent('Pinterest video processing failed.', { apiResponse: status.data });
      await new Promise((r) => setTimeout(r, Math.min(15000, 3000 + i * 1000)));
    }

    // Step 4 — create the pin
    const coverUrl = media.thumbnail_path ? toPublicUrl(path.resolve(process.cwd(), media.thumbnail_path)) : undefined;
    const body = {
      board_id: payload.boardId,
      title: payload.title || '',
      description: payload.description || post.caption || '',
      ...(payload.destinationUrl && { link: payload.destinationUrl }),
      media_source: {
        source_type: 'video_id',
        media_id,
        ...(coverUrl && { cover_image_url: coverUrl })
      }
    };
    const res = await this.client.post(`${API}/pins`, body, {
      headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' }
    });
    return { platform: 'pinterest', remotePostId: res.data.id, raw: res.data };
  }

  requirePublicUrl(media) {
    const url = toPublicUrl(path.resolve(process.cwd(), media.file_path));
    if (!url) this.permanent('Pinterest publishing requires PUBLIC_MEDIA_BASE_URL to be set.');
    return url;
  }
}

module.exports = new PinterestService();
