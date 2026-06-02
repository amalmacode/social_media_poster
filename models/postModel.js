const { pool, query } = require('../config/db');

async function create({ userId, mediaIds, caption, scheduledFor, platformPayloads, targets }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO posts (user_id, media_id, caption, platform_payloads, status, scheduled_for)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, mediaIds[0], caption || '', platformPayloads || {}, scheduledFor ? 'pending' : 'processing', scheduledFor || null]
    );
    const post = rows[0];
    for (let i = 0; i < mediaIds.length; i++) {
      await client.query(
        'INSERT INTO post_media (post_id, media_id, position) VALUES ($1,$2,$3)',
        [post.id, mediaIds[i], i + 1]
      );
    }
    for (const target of targets) {
      await client.query(
        `INSERT INTO post_platforms (post_id, platform, connected_account_id, status)
         VALUES ($1,$2,$3,'pending')`,
        [post.id, target.platform, target.connectedAccountId]
      );
    }
    await client.query('COMMIT');
    return post;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listByUser(userId, options = {}) {
  const limit = options.limit || 20;
  const statusClause = options.status ? 'AND p.status = $3::post_status' : '';
  const params = options.status ? [userId, limit, options.status] : [userId, limit];
  const { rows } = await query(
    `SELECT p.*, m.thumbnail_path, m.mime_type,
      COUNT(pp.id)::int AS platform_count,
      COUNT(pp.id) FILTER (WHERE pp.status = 'failed')::int AS failed_count,
      COALESCE(
        json_agg(
          json_build_object(
            'platform', pp.platform,
            'username', ca.username,
            'status', pp.status,
            'error_message', pp.error_message,
            'remote_post_id', pp.remote_post_id
          ) ORDER BY pp.created_at
        ) FILTER (WHERE pp.id IS NOT NULL),
        '[]'::json
      ) AS platform_targets
     FROM posts p
     JOIN media m ON m.id = p.media_id
     LEFT JOIN post_platforms pp ON pp.post_id = p.id
     LEFT JOIN connected_accounts ca ON ca.id = pp.connected_account_id
     WHERE p.user_id = $1 ${statusClause}
     GROUP BY p.id, m.thumbnail_path, m.mime_type
     ORDER BY COALESCE(p.scheduled_for, p.created_at) DESC
     LIMIT $2`,
    params
  );
  return rows;
}

async function findWithTargets(postId) {
  const { rows } = await query(
    `SELECT p.*, row_to_json(m.*) AS media
     FROM posts p JOIN media m ON m.id = p.media_id WHERE p.id = $1`,
    [postId]
  );
  if (!rows[0]) return null;
  const [targets, mediaItemsRes] = await Promise.all([
    query('SELECT * FROM post_platforms WHERE post_id = $1 ORDER BY created_at', [postId]),
    query(
      'SELECT m.* FROM post_media pm JOIN media m ON m.id = pm.media_id WHERE pm.post_id = $1 ORDER BY pm.position',
      [postId]
    )
  ]);
  // Fall back to the single media column for posts created before the post_media table existed
  const mediaItems = mediaItemsRes.rows.length ? mediaItemsRes.rows : [rows[0].media];
  return { ...rows[0], targets: targets.rows, mediaItems };
}

async function updatePostStatus(postId, status) {
  await query(
    `UPDATE posts
     SET status = $2::post_status,
       published_at = CASE WHEN $2::post_status IN ('success'::post_status, 'partial_success'::post_status) THEN now() ELSE published_at END
     WHERE id = $1`,
    [postId, status]
  );
}

async function updateTargetStatus(id, patch) {
  const { rows } = await query(
    `UPDATE post_platforms
     SET status = $2::publish_status, remote_post_id = COALESCE($3, remote_post_id), error_message = $4,
       api_response = COALESCE($5, api_response), failed_payload = COALESCE($6, failed_payload),
       retry_count = retry_count + $7,
       published_at = CASE WHEN $2::publish_status = 'success'::publish_status THEN now() ELSE published_at END
     WHERE id = $1 RETURNING *`,
    [id, patch.status, patch.remotePostId || null, patch.errorMessage || null, patch.apiResponse || null, patch.failedPayload || null, patch.incrementRetry ? 1 : 0]
  );
  return rows[0];
}

async function dashboardCounts(userId) {
  const { rows } = await query(
    `SELECT
      COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS active,
      COUNT(*) FILTER (WHERE scheduled_for IS NOT NULL AND status = 'pending')::int AS scheduled,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*)::int AS total
     FROM posts WHERE user_id = $1`,
    [userId]
  );
  return rows[0];
}

async function reschedule(id, userId, scheduledFor) {
  const { rows } = await query(
    `UPDATE posts SET scheduled_for = $3 WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
    [id, userId, scheduledFor]
  );
  return rows[0] || null;
}

async function remove(id, userId) {
  const { rows } = await query('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return rows[0] || null;
}

module.exports = { create, listByUser, findWithTargets, updatePostStatus, updateTargetStatus, dashboardCounts, reschedule, remove };
