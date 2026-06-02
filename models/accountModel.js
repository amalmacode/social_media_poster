const { query } = require('../config/db');
const { encrypt, decrypt } = require('../utils/encryption');

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    access_token: decrypt(row.access_token),
    refresh_token: decrypt(row.refresh_token)
  };
}

async function upsert(account) {
  const { rows } = await query(
    `INSERT INTO connected_accounts
      (user_id, platform, platform_user_id, username, access_token, refresh_token, expires_at, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, platform, platform_user_id)
     DO UPDATE SET username = EXCLUDED.username, access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at,
       metadata_json = EXCLUDED.metadata_json
     RETURNING *`,
    [
      account.userId,
      account.platform,
      account.platformUserId,
      account.username,
      encrypt(account.accessToken),
      encrypt(account.refreshToken),
      account.expiresAt || null,
      account.metadata || {}
    ]
  );
  return hydrate(rows[0]);
}

async function listByUser(userId) {
  const { rows } = await query(
    'SELECT * FROM connected_accounts WHERE user_id = $1 ORDER BY platform, created_at DESC',
    [userId]
  );
  return rows.map(hydrate);
}

async function findForUser(id, userId) {
  const { rows } = await query('SELECT * FROM connected_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
  return hydrate(rows[0]);
}

async function updateTokens(id, { accessToken, refreshToken, expiresAt, metadata }) {
  const { rows } = await query(
    `UPDATE connected_accounts
     SET access_token = COALESCE($2, access_token),
       refresh_token = COALESCE($3, refresh_token),
       expires_at = $4,
       metadata_json = COALESCE($5, metadata_json)
     WHERE id = $1 RETURNING *`,
    [id, encrypt(accessToken), encrypt(refreshToken), expiresAt || null, metadata || null]
  );
  return hydrate(rows[0]);
}

async function remove(id, userId) {
  await query('DELETE FROM connected_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
}

module.exports = { upsert, listByUser, findForUser, updateTokens, remove };
