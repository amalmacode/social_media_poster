const fs = require('fs');
const path = require('path');
const BasePlatformService = require('./basePlatformService');
const accountModel = require('../../models/accountModel');
const { env } = require('../../config/env');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

class YouTubeService extends BasePlatformService {
  constructor() {
    super('youtube');
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  async exchangeCode({ code, redirectUri }) {
    const body = new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });
    const res = await this.client.post(GOOGLE_TOKEN_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data;
  }

  // Google access tokens expire in 3600 s; refresh when within 10 minutes of expiry
  async refreshToken(account) {
    if (!account.refresh_token) return account;
    if (account.expires_at && new Date(account.expires_at).getTime() - Date.now() > 600_000) return account;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret
    });
    const res = await this.client.post(GOOGLE_TOKEN_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return accountModel.updateTokens(account.id, {
      accessToken: res.data.access_token,
      expiresAt: new Date(Date.now() + (res.data.expires_in || 3600) * 1000)
    });
  }

  async getChannel(accessToken) {
    const res = await this.client.get(`${YT_API}/channels`, {
      params: { part: 'snippet', mine: true },
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data.items?.[0] || null;
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  async publish({ account, post, media, mediaItems }) {
    const freshAccount = await this.refreshToken(account);
    const items = (mediaItems && mediaItems.length) ? mediaItems : [media];
    const videos = items.filter((m) => m.mime_type.startsWith('video/'));

    if (!videos.length) {
      this.permanent('YouTube only accepts video uploads. Select a video file to publish to YouTube.');
    }

    const payload = post.platform_payloads?.youtube || {};
    const title = (payload.title || post.caption || '').slice(0, 100).trim() || 'Untitled';
    const description = payload.description || post.caption || '';

    return this.uploadVideo(freshAccount, videos[0], title, description);
  }

  async uploadVideo(account, media, title, description) {
    const filePath = path.resolve(process.cwd(), media.file_path);
    const fileSize = fs.statSync(filePath).size;

    // Step 1 — initiate resumable upload session
    const initRes = await this.client.post(
      `${YT_UPLOAD}?uploadType=resumable&part=snippet,status`,
      {
        snippet: { title, description, categoryId: '22' },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': media.mime_type,
          'X-Upload-Content-Length': fileSize
        }
      }
    );

    const uploadUri = initRes.headers.location;
    if (!uploadUri) this.permanent('YouTube did not return a resumable upload URI.');

    // Step 2 — stream the file; no timeout so large files can complete
    const uploadRes = await this.client.put(uploadUri, fs.createReadStream(filePath), {
      headers: { 'Content-Type': media.mime_type, 'Content-Length': fileSize },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0
    });

    return { platform: 'youtube', remotePostId: uploadRes.data.id, raw: uploadRes.data };
  }
}

module.exports = new YouTubeService();
