const path = require('path');
const crypto = require('crypto');
const { env } = require('../../config/env');

function toPublicUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const uploadRoot = env.uploadRoot.replace(/\\/g, '/');
  const relative = normalized.startsWith(uploadRoot)
    ? normalized.slice(uploadRoot.length).replace(/^\/+/, '')
    : normalized.replace(/^uploads\/?/, '');
  if (!env.publicMediaBaseUrl) return null;
  return `${env.publicMediaBaseUrl.replace(/\/$/, '')}/uploads/${relative}`;
}

// Generates a signed public URL valid for 2 hours — used when platforms
// (Instagram, Facebook, etc.) need to fetch media from our server.
function toSignedPublicUrl(relativePath) {
  const base = (env.publicMediaBaseUrl || env.appUrl).replace(/\/$/, '');
  if (!base) return null;
  const expiry = Math.floor(Date.now() / 1000) + 7200;
  const secret = process.env.SESSION_SECRET || 'dev';
  const sig = crypto.createHmac('sha256', secret)
    .update(`${relativePath}:${expiry}`)
    .digest('hex')
    .substring(0, 32);
  const token = Buffer.from(JSON.stringify({ p: relativePath, e: expiry, s: sig }))
    .toString('base64url');
  return `${base}/pub/${token}`;
}

function verifySignedToken(token) {
  try {
    const data = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { p: relativePath, e: expiry, s: sig } = data;
    if (!relativePath || !expiry || !sig) return null;
    if (expiry < Math.floor(Date.now() / 1000)) return null;
    const secret = process.env.SESSION_SECRET || 'dev';
    const expected = crypto.createHmac('sha256', secret)
      .update(`${relativePath}:${expiry}`)
      .digest('hex')
      .substring(0, 32);
    if (sig !== expected) return null;
    return relativePath;
  } catch { return null; }
}

function relativeUploadPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

module.exports = { toPublicUrl, toSignedPublicUrl, verifySignedToken, relativeUploadPath };
