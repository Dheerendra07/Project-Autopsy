CREATE TABLE IF NOT EXISTS repository_storage_cleanup (
  repository_id UUID PRIMARY KEY,
  storage_path TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_repository_storage_cleanup_pending
  ON repository_storage_cleanup(requested_at)
  WHERE completed_at IS NULL;
