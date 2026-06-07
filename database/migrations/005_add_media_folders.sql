CREATE TABLE IF NOT EXISTS media_folders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'custom',   -- 'divers' | 'brand' | 'custom'
  brand_id uuid REFERENCES brand_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one DIVERS folder per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_folders_divers
  ON media_folders(user_id) WHERE type = 'divers';

-- Exactly one brand folder per user+brand
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_folders_brand
  ON media_folders(user_id, brand_id) WHERE brand_id IS NOT NULL;

-- No duplicate names per user (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_folders_name
  ON media_folders(user_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_media_folders_user
  ON media_folders(user_id);

-- Attach folder to media items (nullable during migration; ensureAndList migrates NULLs to DIVERS)
ALTER TABLE media ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES media_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_media_folder ON media(folder_id);
