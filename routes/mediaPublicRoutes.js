const express = require('express');
const path = require('path');
const { verifySignedToken } = require('../services/storage/localStorageService');

const router = express.Router();

// Serves a media file via a signed time-limited token — no session auth required.
// Used so Instagram/Facebook/Pinterest/TikTok can fetch media from our server.
router.get('/pub/:token', (req, res) => {
  const relativePath = verifySignedToken(req.params.token);
  if (!relativePath) return res.status(410).end();
  const absolute = path.resolve(process.cwd(), relativePath);
  return res.sendFile(absolute, (err) => {
    if (err) res.status(404).end();
  });
});

module.exports = router;
