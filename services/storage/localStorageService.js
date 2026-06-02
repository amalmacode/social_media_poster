const path = require('path');
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

function relativeUploadPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

module.exports = { toPublicUrl, relativeUploadPath };
