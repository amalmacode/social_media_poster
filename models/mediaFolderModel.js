const { query } = require('../config/db');

// Upsert DIVERS + one folder per brand, migrate orphaned media to DIVERS,
// then return all folders for this user with a live media_count.
async function ensureAndList(userId, brands = []) {
  // 1. Ensure DIVERS exists
  await query(
    `INSERT INTO media_folders (user_id, name, type)
     VALUES ($1, 'DIVERS', 'divers')
     ON CONFLICT (user_id) WHERE type = 'divers' DO NOTHING`,
    [userId]
  );

  const { rows: [divers] } = await query(
    `SELECT id FROM media_folders WHERE user_id = $1 AND type = 'divers'`,
    [userId]
  );

  // 2. Migrate any pre-folder media (folder_id IS NULL) into DIVERS
  await query(
    `UPDATE media SET folder_id = $1 WHERE user_id = $2 AND folder_id IS NULL`,
    [divers.id, userId]
  );

  // 3. Ensure one brand folder per brand (upsert name in case brand was renamed)
  for (const brand of brands) {
    await query(
      `INSERT INTO media_folders (user_id, name, type, brand_id)
       VALUES ($1, $2, 'brand', $3)
       ON CONFLICT (user_id, brand_id) WHERE brand_id IS NOT NULL
       DO UPDATE SET name = EXCLUDED.name`,
      [userId, brand.name, brand.id]
    );
  }

  // 4. Return all folders with media count, ordered: DIVERS → brand → custom
  const { rows } = await query(
    `SELECT mf.id, mf.name, mf.type, mf.brand_id, mf.created_at,
            COUNT(m.id)::int AS media_count
     FROM media_folders mf
     LEFT JOIN media m ON m.folder_id = mf.id
     WHERE mf.user_id = $1
     GROUP BY mf.id
     ORDER BY
       CASE mf.type WHEN 'divers' THEN 0 WHEN 'brand' THEN 1 ELSE 2 END,
       mf.created_at ASC`,
    [userId]
  );
  return rows;
}

async function createCustom(userId, name) {
  const { rows } = await query(
    `INSERT INTO media_folders (user_id, name, type)
     VALUES ($1, $2, 'custom') RETURNING *`,
    [userId, name.trim()]
  );
  return rows[0];
}

async function findForUser(id, userId) {
  const { rows } = await query(
    `SELECT * FROM media_folders WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

// Only custom folders can be deleted; their media is moved back to DIVERS.
async function removeCustom(id, userId) {
  const folder = await findForUser(id, userId);
  if (!folder || folder.type !== 'custom') return null;

  const { rows: [divers] } = await query(
    `SELECT id FROM media_folders WHERE user_id = $1 AND type = 'divers'`,
    [userId]
  );
  if (divers) {
    await query(`UPDATE media SET folder_id = $1 WHERE folder_id = $2`, [divers.id, id]);
  }

  const { rows } = await query(
    `DELETE FROM media_folders WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { ensureAndList, createCustom, findForUser, removeCustom };
