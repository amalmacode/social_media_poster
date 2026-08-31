const BasePlatformService = require('./basePlatformService');
const { DEFAULT_WHATSAPP_CHANNEL_CAPTION } = require('../../utils/whatsappDefaults');

class WhatsAppChannelService extends BasePlatformService {
  constructor() {
    super('whatsapp_channel');
  }

  async publish({ account, post, media, mediaItems }) {
    const items = (mediaItems && mediaItems.length) ? mediaItems : [media].filter(Boolean);
    if (!items.length) {
      this.permanent('WhatsApp Channel preparation failed: no media was attached.', {
        retryable: false,
        status: 'failed_to_prepare'
      });
    }

    const payload = post.platform_payloads?.whatsapp_channel || {};
    const caption = (payload.caption || account?.metadata_json?.defaultCaption || post.caption || DEFAULT_WHATSAPP_CHANNEL_CAPTION).trim();
    const channelUrl = (account?.metadata_json?.channelUrl || '').trim();
    const link = (payload.link || '').trim();
    const preparedAt = new Date().toISOString();

    return {
      platform: 'whatsapp_channel',
      status: 'ready_to_publish',
      remotePostId: null,
      raw: {
        requires_manual_confirmation: true,
        prepared_at: preparedAt,
        channel_name: account?.username || null,
        channel_url: channelUrl || null,
        caption,
        link,
        media: items.map((item) => ({
          id: item.id,
          file_path: item.file_path,
          original_name: item.original_name,
          mime_type: item.mime_type,
          thumbnail_path: item.thumbnail_path || null
        })),
        instructions: 'Copy the caption, download or share the media, then select your WhatsApp Channel and confirm the update inside WhatsApp.'
      }
    };
  }
}

module.exports = new WhatsAppChannelService();
