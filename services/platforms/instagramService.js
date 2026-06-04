const path = require('path');
const BasePlatformService = require('./basePlatformService');
const accountModel = require('../../models/accountModel');
const { env } = require('../../config/env');
const { toSignedPublicUrl } = require('../storage/localStorageService');

function isPublicMediaUrl(mediaUrl) {
  try {
    const url = new URL(mediaUrl);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(host);
  } catch {
    return false;
  }
}

class InstagramService extends BasePlatformService {
  constructor() {
    super('instagram');
    this.graphBase = `https://graph.facebook.com/${env.meta.graphVersion}`;
  }

  async exchangeCode({ code, redirectUri }) {
    const shortToken = await this.client.get(`${this.graphBase}/oauth/access_token`, {
      params: {
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        redirect_uri: redirectUri,
        code
      }
    });
    const longToken = await this.client.get(`${this.graphBase}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        fb_exchange_token: shortToken.data.access_token
      }
    });
    return longToken.data;
  }

  async exchangeInstagramLoginCode({ code, redirectUri }) {
    const params = new URLSearchParams();
    params.set('client_id', env.meta.appId);
    params.set('client_secret', env.meta.appSecret);
    params.set('grant_type', 'authorization_code');
    params.set('redirect_uri', redirectUri);
    params.set('code', code);

    const response = await this.client.post('https://api.instagram.com/oauth/access_token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  }

  async getInstagramLoginProfile(accessToken) {
    try {
      const response = await this.client.get('https://graph.instagram.com/me', {
        params: {
          access_token: accessToken,
          fields: 'user_id,username,account_type,name,profile_picture_url'
        }
      });
      console.log('Instagram Login profile response', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      const normalized = this.normalizeError(error);
      console.warn('Unable to read Instagram Login profile', JSON.stringify(normalized, null, 2));
      return null;
    }
  }

  async getTokenDiagnostics(accessToken) {
    const [me, permissions, debugToken] = await Promise.all([
      this.client.get(`${this.graphBase}/me`, {
        params: { access_token: accessToken, fields: 'id,name' }
      }).then((response) => response.data).catch((error) => ({ error: this.normalizeError(error) })),
      this.client.get(`${this.graphBase}/me/permissions`, {
        params: { access_token: accessToken }
      }).then((response) => response.data).catch((error) => ({ error: this.normalizeError(error) })),
      this.client.get(`${this.graphBase}/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: `${env.meta.appId}|${env.meta.appSecret}`
        }
      }).then((response) => response.data).catch((error) => ({ error: this.normalizeError(error) }))
    ]);

    const granted = Array.isArray(permissions.data)
      ? permissions.data.filter((permission) => permission.status === 'granted').map((permission) => permission.permission)
      : [];
    const requiredForPageLookup = [
      'pages_show_list',
      'pages_read_engagement',
      'business_management'
    ];
    const futurePublishingScopes = [
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish'
    ];

    return {
      me,
      permissions,
      debugToken,
      tokenType: debugToken.data?.type || null,
      expiresAt: debugToken.data?.expires_at ? new Date(debugToken.data.expires_at * 1000).toISOString() : null,
      userId: debugToken.data?.user_id || me.id || null,
      grantedScopes: granted,
      missingScopes: requiredForPageLookup.filter((scope) => !granted.includes(scope)),
      missingFuturePublishingScopes: futurePublishingScopes.filter((scope) => !granted.includes(scope))
    };
  }

  logTokenDiagnostics(diagnostics) {
    console.log('Meta OAuth token diagnostics', JSON.stringify({
      tokenType: diagnostics.tokenType,
      expiresAt: diagnostics.expiresAt,
      userId: diagnostics.userId,
      grantedScopes: diagnostics.grantedScopes,
      missingScopes: diagnostics.missingScopes,
      missingFuturePublishingScopes: diagnostics.missingFuturePublishingScopes,
      me: diagnostics.me,
      permissions: diagnostics.permissions,
      debugToken: diagnostics.debugToken
    }, null, 2));
  }

  async getPages(accessToken) {
    const response = await this.client.get(`${this.graphBase}/me/accounts`, {
      params: { access_token: accessToken, fields: 'id,name,access_token' }
    });
    const pages = response.data.data || [];
    console.log('Meta /me/accounts raw response', JSON.stringify(response.data, null, 2));
    for (const page of pages) {
      console.log('Meta Page from /me/accounts', JSON.stringify({
        id: page.id,
        name: page.name,
        hasPageAccessToken: Boolean(page.access_token),
        pageAccessToken: page.access_token || null
      }, null, 2));
    }
    return { raw: response.data, pages };
  }

  async lookupInstagramForPage(page) {
    try {
      const response = await this.client.get(`${this.graphBase}/${page.id}`, {
        params: {
          access_token: page.access_token,
          fields: 'instagram_business_account{id,username,name},connected_instagram_account{id,username,name},name'
        }
      });
      console.log(`Instagram lookup response for page ${page.id}`, JSON.stringify(response.data, null, 2));
      return {
        page_id: page.id,
        page_name: page.name,
        has_instagram: Boolean(response.data.instagram_business_account || response.data.connected_instagram_account),
        instagram_business_account: response.data.instagram_business_account || null,
        connected_instagram_account: response.data.connected_instagram_account || null,
        raw_response: response.data,
        error: null
      };
    } catch (error) {
      const normalized = this.normalizeError(error);
      console.error(`Instagram lookup error for page ${page.id}`, JSON.stringify(normalized, null, 2));
      return {
        page_id: page.id,
        page_name: page.name,
        has_instagram: false,
        instagram_business_account: null,
        connected_instagram_account: null,
        raw_response: null,
        error: normalized
      };
    }
  }

  async diagnosePages(accessToken) {
    const { raw, pages } = await this.getPages(accessToken);
    const lookups = [];
    for (const page of pages) {
      lookups.push(await this.lookupInstagramForPage(page));
    }
    return { pagesRawResponse: raw, pages: lookups };
  }

  async getProfessionalAccounts(accessToken) {
    const diagnostics = await this.diagnosePages(accessToken);
    return diagnostics.pages
      .filter((page) => page.instagram_business_account)
      .map((page) => {
        const sourcePage = (diagnostics.pagesRawResponse.data || []).find((item) => item.id === page.page_id);
        return {
          platformUserId: page.instagram_business_account.id,
          username: page.instagram_business_account.username || page.page_name,
          accessToken: sourcePage?.access_token,
          metadata: {
            pageId: page.page_id,
            pageName: page.page_name,
            instagramLookupRawResponse: page.raw_response
          }
        };
      });
  }

  async getBusinesses(accessToken) {
    try {
      const response = await this.client.get(`${this.graphBase}/me/businesses`, {
        params: { access_token: accessToken, fields: 'id,name' }
      });
      return response.data.data || [];
    } catch (error) {
      const normalized = this.normalizeError(error);
      console.warn('Unable to read Meta businesses during OAuth callback', normalized.message);
      return [];
    }
  }

  async refreshToken(account) {
    if (!account.expires_at || new Date(account.expires_at).getTime() - Date.now() > 1000 * 60 * 60 * 24 * 7) {
      return account;
    }
    // Page-linked tokens (Facebook Page flow) are long-lived page tokens that cannot
    // be refreshed with ig_refresh_token — only Instagram Login tokens support that grant
    if (account.metadata_json?.authFlow !== 'instagram_login') return account;
    const response = await this.client.get('https://graph.instagram.com/refresh_access_token', {
      params: { grant_type: 'ig_refresh_token', access_token: account.access_token }
    });
    return accountModel.updateTokens(account.id, {
      accessToken: response.data.access_token,
      expiresAt: new Date(Date.now() + response.data.expires_in * 1000)
    });
  }

  async validateContent({ media, caption }) {
    const errors = [];
    if (caption && caption.length > 2200) errors.push('Instagram captions must be 2,200 characters or fewer.');
    if (!['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime'].includes(media.mime_type)) {
      errors.push('Instagram supports JPEG, PNG, GIF images and MP4/MOV videos.');
    }
    if (media.mime_type.startsWith('video/') && media.duration && media.duration > 90) {
      errors.push('Instagram Reels should be 90 seconds or fewer.');
    }
    return { ok: errors.length === 0, errors };
  }

  async publish({ account, post, media, mediaItems }) {
    const freshAccount = await this.refreshToken(account);
    const items = (mediaItems && mediaItems.length) ? mediaItems : [media];
    console.log(`Instagram publish: ${items.length} item(s) — ${items.length > 1 ? 'carousel' : 'single'}`);
    if (items.length === 1) return this.publishSingle(freshAccount, post, items[0]);
    return this.publishCarousel(freshAccount, post, items);
  }

  async publishSingle(account, post, media) {
    const mediaUrl = this.requirePublicUrl(media);
    const validation = await this.validateContent({ media, caption: post.caption });
    if (!validation.ok) this.permanent(validation.errors.join(' '));

    const isVideo = media.mime_type.startsWith('video/');
    const containerParams = { access_token: account.access_token, caption: post.caption };
    if (isVideo) {
      containerParams.media_type = 'REELS';
      containerParams.video_url = mediaUrl;
    } else {
      containerParams.image_url = mediaUrl;
    }

    const container = await this.client.post(`${this.graphBase}/${account.platform_user_id}/media`, null, { params: containerParams });
    await this.waitForContainer(account, container.data.id);
    const published = await this.client.post(`${this.graphBase}/${account.platform_user_id}/media_publish`, null, {
      params: { access_token: account.access_token, creation_id: container.data.id }
    });
    return { platform: 'instagram', remotePostId: published.data.id, raw: { container: container.data, published: published.data } };
  }

  async publishCarousel(account, post, mediaItems) {
    if (mediaItems.length > 10) this.permanent('Instagram carousels support up to 10 items.');

    // Create and wait for each child container sequentially (API requirement)
    const childIds = [];
    for (const item of mediaItems) {
      const mediaUrl = this.requirePublicUrl(item);
      const validation = await this.validateContent({ media: item, caption: '' });
      if (!validation.ok) this.permanent(validation.errors.join(' '));

      const isVideo = item.mime_type.startsWith('video/');
      const params = { access_token: account.access_token, is_carousel_item: true };
      if (isVideo) {
        params.media_type = 'VIDEO';
        params.video_url = mediaUrl;
      } else {
        params.image_url = mediaUrl;
      }

      const container = await this.client.post(`${this.graphBase}/${account.platform_user_id}/media`, null, { params });
      await this.waitForContainer(account, container.data.id);
      childIds.push(container.data.id);
      console.log(`Instagram carousel child ${childIds.length}/${mediaItems.length} ready: ${container.data.id}`);
    }

    // Meta Graph API requires children as a comma-separated value: children=id1,id2,id3
    // URLSearchParams encodes commas as %2C and repeated params (children=id1&children=id2)
    // only picks up the first value server-side. We append children raw after the encoded params.
    const carouselBase = `${this.graphBase}/${account.platform_user_id}/media`;
    const sp = new URLSearchParams({ access_token: account.access_token, media_type: 'CAROUSEL', caption: post.caption || '' });
    const carouselUrl = `${carouselBase}?${sp.toString()}&children=${childIds.join(',')}`;

    // Even after FINISHED, Instagram needs extra time before child IDs are usable
    console.log('Instagram carousel: waiting 10 s for children to stabilize...');
    await new Promise((r) => setTimeout(r, 10000));

    // Retry carousel container creation — code 9007 "Media ID not available" fires
    // transiently even when all children report FINISHED (subcodes vary: 2207027, 2207053, …)
    let carousel;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`Instagram carousel container request (attempt ${attempt}): ${childIds.length} children`);
        carousel = await this.client.post(carouselUrl, null);
        break;
      } catch (err) {
        const code = err.response?.data?.error?.code;
        if (code === 9007 && attempt < 5) {
          const wait = attempt * 10000;
          console.warn(`Instagram carousel: Media ID not available (attempt ${attempt}), retrying in ${wait / 1000}s...`);
          await new Promise((r) => setTimeout(r, wait));
        } else {
          throw err;
        }
      }
    }

    const published = await this.client.post(`${this.graphBase}/${account.platform_user_id}/media_publish`, null, {
      params: { access_token: account.access_token, creation_id: carousel.data.id }
    });
    console.log(`Instagram carousel published: ${published.data.id}`);
    return { platform: 'instagram', remotePostId: published.data.id, raw: { children: childIds, carousel: carousel.data, published: published.data } };
  }

  requirePublicUrl(media) {
    const mediaUrl = toSignedPublicUrl(media.file_path);
    if (!mediaUrl) this.permanent('Instagram requires APP_URL or PUBLIC_MEDIA_BASE_URL to be set.');
    return mediaUrl;
  }

  async waitForContainer(account, creationId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = await this.client.get(`${this.graphBase}/${creationId}`, {
        params: { access_token: account.access_token, fields: 'status_code,status' }
      });
      if (status.data.status_code === 'FINISHED') return status.data;
      if (['ERROR', 'EXPIRED'].includes(status.data.status_code)) {
        this.permanent(`Instagram media processing failed: ${status.data.status || status.data.status_code}`, { apiResponse: status.data });
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(30000, 2000 + attempt * 1500)));
    }
    throw new Error('Instagram media processing timed out.');
  }
}

module.exports = new InstagramService();
