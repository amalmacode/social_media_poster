const { pool, query } = require('../config/db');

const MEMBERS_AGG = `
  COALESCE(
    json_agg(
      json_build_object(
        'connected_account_id', ca.id,
        'platform', ca.platform,
        'username', ca.username,
        'platform_user_id', ca.platform_user_id
      ) ORDER BY ca.platform
    ) FILTER (WHERE ca.id IS NOT NULL),
    '[]'::json
  ) AS members
`;

async function listByUser(userId) {
  const { rows } = await query(
    `SELECT ba.id, ba.name, ba.watermark_path, ba.watermark_opacity, ba.watermark_position, ba.created_at, ${MEMBERS_AGG}
     FROM brand_accounts ba
     LEFT JOIN brand_account_members bam ON bam.brand_account_id = ba.id
     LEFT JOIN connected_accounts ca ON ca.id = bam.connected_account_id
     WHERE ba.user_id = $1
     GROUP BY ba.id
     ORDER BY ba.created_at DESC`,
    [userId]
  );
  return rows;
}

async function findWithMembers(id, userId) {
  const { rows } = await query(
    `SELECT ba.id, ba.name, ba.user_id, ba.watermark_path, ba.watermark_opacity, ba.watermark_position, ba.created_at, ${MEMBERS_AGG}
     FROM brand_accounts ba
     LEFT JOIN brand_account_members bam ON bam.brand_account_id = ba.id
     LEFT JOIN connected_accounts ca ON ca.id = bam.connected_account_id
     WHERE ba.id = $1 AND ba.user_id = $2
     GROUP BY ba.id`,
    [id, userId]
  );
  return rows[0] || null;
}

async function updateWatermark(id, userId, { watermarkPath, opacity, position }) {
  const { rows } = await query(
    `UPDATE brand_accounts
     SET watermark_path = $3, watermark_opacity = $4, watermark_position = $5
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, watermarkPath || null, opacity ?? 0.5, position || 'center']
  );
  return rows[0] || null;
}

async function create({ userId, name }) {
  const { rows } = await query(
    'INSERT INTO brand_accounts (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name.trim()]
  );
  return rows[0];
}

async function rename(id, userId, name) {
  const { rows } = await query(
    'UPDATE brand_accounts SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId, name.trim()]
  );
  return rows[0] || null;
}

async function remove(id, userId) {
  const { rows } = await query(
    'DELETE FROM brand_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] || null;
}

async function addMember(brandAccountId, connectedAccountId) {
  await query(
    'INSERT INTO brand_account_members (brand_account_id, connected_account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [brandAccountId, connectedAccountId]
  );
}

async function removeMember(brandAccountId, connectedAccountId) {
  await query(
    'DELETE FROM brand_account_members WHERE brand_account_id = $1 AND connected_account_id = $2',
    [brandAccountId, connectedAccountId]
  );
}

// Resolve brand account IDs → connected_account_id array (deduped)
async function resolveToAccountIds(brandAccountIds) {
  if (!brandAccountIds.length) return [];
  const { rows } = await query(
    'SELECT DISTINCT connected_account_id FROM brand_account_members WHERE brand_account_id = ANY($1)',
    [brandAccountIds]
  );
  return rows.map((r) => r.connected_account_id);
}

module.exports = { listByUser, findWithMembers, create, rename, remove, addMember, removeMember, resolveToAccountIds, updateWatermark };
