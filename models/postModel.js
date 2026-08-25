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
  const params = [userId, limit];
  const clauses = [];
  let joins = '';
  let idx = 3;

  if (options.status) {
    clauses.push(`p.status = $${idx}::post_status`);
    params.push(options.status);
    idx++;
  }
  if (options.accountId) {
    clauses.push(`pp.connected_account_id = $${idx}`);
    params.push(options.accountId);
    idx++;
  }
  if (options.brandId) {
    joins += ` JOIN brand_account_members bam ON bam.connected_account_id = pp.connected_account_id AND bam.brand_account_id = $${idx}`;
    params.push(options.brandId);
    idx++;
  }
  if (options.dateFrom) {
    clauses.push(`COALESCE(p.scheduled_for, p.created_at) >= $${idx}`);
    params.push(options.dateFrom);
    idx++;
  }
  if (options.dateTo) {
    clauses.push(`COALESCE(p.scheduled_for, p.created_at) < $${idx}`);
    params.push(options.dateTo);
    idx++;
  }

  const where = clauses.length ? 'AND ' + clauses.join(' AND ') : '';
  const { rows } = await query(
    `SELECT p.*, m.thumbnail_path, m.mime_type,
      COUNT(pp.id)::int AS platform_count,
      COUNT(pp.id) FILTER (WHERE pp.status = 'failed')::int AS failed_count,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pp.id,
            'platform', pp.platform,
            'username', ca.username,
            'status', pp.status,
            'error_message', pp.error_message,
            'remote_post_id', pp.remote_post_id,
            'api_response', pp.api_response
          ) ORDER BY pp.created_at
        ) FILTER (WHERE pp.id IS NOT NULL),
        '[]'::json
      ) AS platform_targets
     FROM posts p
     JOIN media m ON m.id = p.media_id
     LEFT JOIN post_platforms pp ON pp.post_id = p.id
     LEFT JOIN connected_accounts ca ON ca.id = pp.connected_account_id
     ${joins}
     WHERE p.user_id = $1 ${where}
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

async function update(id, userId, { caption, scheduledFor, platformPayloads }) {
  const { rows } = await query(
    `UPDATE posts
     SET caption = $3, scheduled_for = $4, platform_payloads = $5,
         status = CASE WHEN status = 'failed' THEN 'pending'::post_status ELSE status END
     WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'failed')
     RETURNING *`,
    [id, userId, caption || '', scheduledFor || null, platformPayloads || {}]
  );
  return rows[0] || null;
}

async function reschedule(id, userId, scheduledFor) {
  const { rows } = await query(
    `UPDATE posts SET scheduled_for = $3 WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
    [id, userId, scheduledFor]
  );
  return rows[0] || null;
}

async function resetFailedTargets(postId) {
  await query(
    `UPDATE post_platforms SET status = 'pending', error_message = NULL
     WHERE post_id = $1 AND status = 'failed'`,
    [postId]
  );
}

async function findTargetForUser(targetId, userId) {
  const { rows } = await query(
    `SELECT pp.*, p.user_id, ca.access_token, ca.refresh_token, ca.expires_at, ca.metadata_json, ca.username
     FROM post_platforms pp
     JOIN posts p ON p.id = pp.post_id
     JOIN connected_accounts ca ON ca.id = pp.connected_account_id
     WHERE pp.id = $1 AND p.user_id = $2`,
    [targetId, userId]
  );
  return rows[0] || null;
}

async function markRemoteDeleted(targetId, apiResponse) {
  const { rows } = await query(
    `UPDATE post_platforms
     SET api_response = COALESCE(api_response, '{}'::jsonb) || $2::jsonb,
       error_message = NULL
     WHERE id = $1
     RETURNING *`,
    [targetId, apiResponse || {}]
  );
  return rows[0] || null;
}

async function remove(id, userId) {
  const { rows } = await query('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return rows[0] || null;
}

module.exports = { create, listByUser, findWithTargets, findTargetForUser, updatePostStatus, updateTargetStatus, markRemoteDeleted, dashboardCounts, update, reschedule, resetFailedTargets, remove };
