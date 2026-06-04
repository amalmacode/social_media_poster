const path = require('path');
const BasePlatformService = require('./basePlatformService');
const { env } = require('../../config/env');
const { toSignedPublicUrl } = require('../storage/localStorageService');

class FacebookService extends BasePlatformService {
  constructor() {
    super('facebook');
    this.graphBase = `https://graph.facebook.com/${env.meta.graphVersion}`;
  }

  async publish({ account, post, media, mediaItems }) {
    const items = (mediaItems && mediaItems.length) ? mediaItems : [media];
    if (items.length === 1) return this.publishSingle(account, post, items[0]);
    return this.publishMultiPhoto(account, post, items);
  }

  async publishSingle(account, post, media) {
    const mediaUrl = this.requirePublicUrl(media);
    const pageId = account.platform_user_id;

    if (media.mime_type.startsWith('video/')) {
      const res = await this.client.post(`${this.graphBase}/${pageId}/videos`, null, {
        params: { access_token: account.access_token, file_url: mediaUrl, description: post.caption || '' }
      });
      return { platform: 'facebook', remotePostId: res.data.id, raw: res.data };
    }

    const res = await this.client.post(`${this.graphBase}/${pageId}/photos`, null, {
      params: { access_token: account.access_token, url: mediaUrl, caption: post.caption || '' }
    });
    return { platform: 'facebook', remotePostId: res.data.id, raw: res.data };
  }

  async publishMultiPhoto(account, post, mediaItems) {
    const pageId = account.platform_user_id;
    const images = mediaItems.filter((m) => !m.mime_type.startsWith('video/'));

    // If no images in the set, fall back to publishing the first item as a single post
    if (images.length === 0) return this.publishSingle(account, post, mediaItems[0]);

    // Stage each image as unpublished to get a photo ID, then attach all to one feed post
    const photoIds = await Promise.all(
      images.map(async (item) => {
        const res = await this.client.post(`${this.graphBase}/${pageId}/photos`, null, {
          params: { access_token: account.access_token, url: this.requirePublicUrl(item), published: false }
        });
        return res.data.id;
      })
    );

    const feedRes = await this.client.post(`${this.graphBase}/${pageId}/feed`, null, {
      params: {
        access_token: account.access_token,
        message: post.caption || '',
        attached_media: JSON.stringify(photoIds.map((id) => ({ media_fbid: id })))
      }
    });
    return { platform: 'facebook', remotePostId: feedRes.data.id, raw: { photoIds, feed: feedRes.data } };
  }

  requirePublicUrl(media) {
    const url = toSignedPublicUrl(media.file_path);
    if (!url) this.permanent('Facebook publishing requires APP_URL or PUBLIC_MEDIA_BASE_URL to be set.');
    return url;
  }
}

module.exports = new FacebookService();
