-- Run this migration once against your database:
-- psql $DATABASE_URL -f database/migrations/002_add_post_media.sql

CREATE TABLE IF NOT EXISTS post_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media(id),
  position int NOT NULL DEFAULT 1,
  UNIQUE(post_id, position)
);
CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id, position);
