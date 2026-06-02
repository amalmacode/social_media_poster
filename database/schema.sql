CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions(expire);

CREATE TYPE publish_status AS ENUM ('pending', 'processing', 'success', 'failed');
CREATE TYPE post_status AS ENUM ('draft', 'pending', 'processing', 'partial_success', 'success', 'failed');
CREATE TYPE platform_type AS ENUM ('instagram', 'facebook', 'pinterest', 'youtube', 'tiktok');

CREATE TABLE IF NOT EXISTS connected_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  platform_user_id text NOT NULL,
  username text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, platform_user_id)
);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_platform ON connected_accounts(user_id, platform);

CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration numeric,
  width int,
  height int,
  thumbnail_path text,
  processing_status publish_status NOT NULL DEFAULT 'pending',
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_user_created ON media(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media(id),
  caption text NOT NULL DEFAULT '',
  platform_payloads jsonb NOT NULL DEFAULT '{}'::jsonb,
  status post_status NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_schedule ON posts(status, scheduled_for);

CREATE TABLE IF NOT EXISTS post_platforms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  connected_account_id uuid NOT NULL REFERENCES connected_accounts(id),
  remote_post_id text,
  status publish_status NOT NULL DEFAULT 'pending',
  error_message text,
  api_response jsonb,
  failed_payload jsonb,
  retry_count int NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_platforms_post ON post_platforms(post_id);
CREATE INDEX IF NOT EXISTS idx_post_platforms_status ON post_platforms(status);

CREATE TABLE IF NOT EXISTS post_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media(id),
  position int NOT NULL DEFAULT 1,
  UNIQUE(post_id, position)
);
CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id, position);

CREATE TABLE IF NOT EXISTS brand_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_accounts_user ON brand_accounts(user_id);

CREATE TABLE IF NOT EXISTS brand_account_members (
  brand_account_id uuid NOT NULL REFERENCES brand_accounts(id) ON DELETE CASCADE,
  connected_account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (brand_account_id, connected_account_id)
);

CREATE TABLE IF NOT EXISTS api_error_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  platform platform_type,
  post_platform_id uuid REFERENCES post_platforms(id) ON DELETE SET NULL,
  request_payload jsonb,
  response_payload jsonb,
  error_message text NOT NULL,
  retryable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
