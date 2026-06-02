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
