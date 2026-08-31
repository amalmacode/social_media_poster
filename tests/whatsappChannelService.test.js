const assert = require('assert');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '12345678901234567890123456789012';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const whatsapp = require('../services/platforms/whatsappChannelService');
const { getPlatformService } = require('../services/platforms/platformRegistry');

async function testRegistry() {
  assert.strictEqual(getPlatformService('whatsapp_channel'), whatsapp);
}

async function testPreparationResult() {
  const result = await whatsapp.publish({
    post: {
      caption: 'General caption',
      platform_payloads: {
        whatsapp_channel: {
          caption: 'WhatsApp caption',
          link: 'https://example.com/product'
        }
      }
    },
    media: null,
    mediaItems: [{
      id: 'media-1',
      file_path: 'uploads/user/video.mp4',
      original_name: 'video.mp4',
      mime_type: 'video/mp4',
      thumbnail_path: 'uploads/user/thumb.jpg'
    }]
  });

  assert.strictEqual(result.platform, 'whatsapp_channel');
  assert.strictEqual(result.status, 'ready_to_publish');
  assert.strictEqual(result.remotePostId, null);
  assert.strictEqual(result.raw.requires_manual_confirmation, true);
  assert.strictEqual(result.raw.caption, 'WhatsApp caption');
  assert.strictEqual(result.raw.link, 'https://example.com/product');
  assert.strictEqual(result.raw.media.length, 1);
  assert.strictEqual(result.raw.media[0].file_path, 'uploads/user/video.mp4');
}

async function testCaptionFallback() {
  const result = await whatsapp.publish({
    post: {
      caption: 'Fallback caption',
      platform_payloads: {}
    },
    media: {
      id: 'media-2',
      file_path: 'uploads/user/image.png',
      original_name: 'image.png',
      mime_type: 'image/png'
    },
    mediaItems: []
  });

  assert.strictEqual(result.raw.caption, 'Fallback caption');
  assert.strictEqual(result.status, 'ready_to_publish');
}

async function testNoMediaFailsToPrepare() {
  await assert.rejects(
    () => whatsapp.publish({ post: { caption: '', platform_payloads: {} }, media: null, mediaItems: [] }),
    (error) => {
      assert.strictEqual(error.details.platform, 'whatsapp_channel');
      assert.strictEqual(error.details.status, 'failed_to_prepare');
      return true;
    }
  );
}

(async () => {
  await testRegistry();
  await testPreparationResult();
  await testCaptionFallback();
  await testNoMediaFailsToPrepare();
  console.log('WhatsApp Channel assisted publishing tests passed.');
})();
