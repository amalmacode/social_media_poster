const { query } = require('../config/db');

async function create(media) {
  const { rows } = await query(
    `INSERT INTO media
     (user_id, file_path, original_name, mime_type, size_bytes, duration, width, height, thumbnail_path, processing_status, validation_errors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      media.userId,
      media.filePath,
      media.originalName,
      media.mimeType,
      media.sizeBytes,
      media.duration,
      media.width,
      media.height,
      media.thumbnailPath,
      media.processingStatus || 'success',
      media.validationErrors || []
    ]
  );
  return rows[0];
}

async function listByUser(userId, limit = 12) {
  const { rows } = await query('SELECT * FROM media WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
  return rows;
}

async function findForUser(id, userId) {
  const { rows } = await query('SELECT * FROM media WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

async function hasLinkedPosts(mediaId) {
  const { rows } = await query(
    `SELECT 1 FROM posts WHERE media_id = $1
     UNION ALL SELECT 1 FROM post_media WHERE media_id = $1
     LIMIT 1`,
    [mediaId]
  );
  return rows.length > 0;
}

async function update(id, userId, fields) {
  const { rows } = await query(
    `UPDATE media
     SET width=$3, height=$4, thumbnail_path=$5, size_bytes=$6
     WHERE id=$1 AND user_id=$2
     RETURNING *`,
    [id, userId, fields.width, fields.height, fields.thumbnailPath, fields.sizeBytes]
  );
  return rows[0] || null;
}

async function remove(id, userId) {
  await query('DELETE FROM media WHERE id = $1 AND user_id = $2', [id, userId]);
}

module.exports = { create, listByUser, findForUser, hasLinkedPosts, update, remove };
