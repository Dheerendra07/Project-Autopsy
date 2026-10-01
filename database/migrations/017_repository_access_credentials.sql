CREATE TABLE IF NOT EXISTS repository_access_credentials (
  repository_id UUID PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
  encrypted_credential TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repository_access_credentials_updated_at
  ON repository_access_credentials(updated_at);
