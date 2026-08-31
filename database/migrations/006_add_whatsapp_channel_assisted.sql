-- Run once on existing databases:
-- psql "$DATABASE_URL" -f database/migrations/006_add_whatsapp_channel_assisted.sql

ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'whatsapp_channel';
ALTER TYPE publish_status ADD VALUE IF NOT EXISTS 'ready_to_publish';
ALTER TYPE publish_status ADD VALUE IF NOT EXISTS 'opened_in_whatsapp';
ALTER TYPE publish_status ADD VALUE IF NOT EXISTS 'published_manually';
ALTER TYPE publish_status ADD VALUE IF NOT EXISTS 'failed_to_prepare';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'manual_action_required';

ALTER TABLE post_platforms
  ALTER COLUMN connected_account_id DROP NOT NULL;
