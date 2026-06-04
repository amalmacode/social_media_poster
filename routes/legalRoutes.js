const express = require('express');
const crypto = require('crypto');
const { query } = require('../config/db');
const { env } = require('../config/env');

const router = express.Router();

router.get('/privacy', (req, res) => {
  res.render('legal/privacy', { title: 'Privacy Policy', layout: 'layouts/main' });
});

router.get('/terms', (req, res) => {
  res.render('legal/terms', { title: 'Terms of Service', layout: 'layouts/main' });
});

router.get('/data-deletion', (req, res) => {
  res.render('legal/dataDeletion', { title: 'Data Deletion', layout: 'layouts/main' });
});

router.get('/data-deletion/status', (req, res) => {
  res.render('legal/dataDeletionStatus', {
    title: 'Data Deletion Status',
    code: req.query.code || '',
    layout: 'layouts/main'
  });
});

// Meta/Facebook signed data deletion callback — no CSRF, no auth
router.post('/data-deletion/callback', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const signedRequest = req.body.signed_request;
    if (!signedRequest) return res.status(400).json({ error: 'missing signed_request' });

    const appSecret = env.meta?.appSecret;
    if (!appSecret) return res.status(500).json({ error: 'app secret not configured' });

    // Parse and verify Meta signed request
    const [encodedSig, payload] = signedRequest.split('.');
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const expectedSig = crypto.createHmac('sha256', appSecret).update(payload).digest();
    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      return res.status(400).json({ error: 'invalid signature' });
    }

    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    const platformUserId = String(data.user_id || '');

    if (platformUserId) {
      // Remove all connected Facebook/Instagram accounts with this platform user ID
      await query(
        `DELETE FROM connected_accounts WHERE platform IN ('facebook','instagram') AND platform_user_id = $1`,
        [platformUserId]
      );
    }

    const code = crypto.randomBytes(8).toString('hex');
    return res.json({
      url: `${env.appUrl}/data-deletion/status?code=${code}`,
      confirmation_code: code
    });
  } catch (err) {
    console.error('[data-deletion/callback]', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
