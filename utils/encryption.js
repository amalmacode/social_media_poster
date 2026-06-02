const crypto = require('crypto');
const { env } = require('../config/env');

function getKey() {
  if (!env.tokenEncryptionKey) {
    if (env.isProduction) throw new Error('TOKEN_ENCRYPTION_KEY is required in production');
    return crypto.createHash('sha256').update(env.sessionSecret).digest();
  }
  const decoded = Buffer.from(env.tokenEncryptionKey, 'base64');
  return decoded.length === 32 ? decoded : crypto.createHash('sha256').update(env.tokenEncryptionKey).digest();
}

function encrypt(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  const bytes = Buffer.from(payload, 'base64');
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const encrypted = bytes.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
