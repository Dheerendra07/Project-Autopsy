CREATE TABLE IF NOT EXISTS file_change_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  commits_touched INTEGER NOT NULL DEFAULT 0,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  binary_changes INTEGER NOT NULL DEFAULT 0,
  total_churn INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, path)
);

CREATE INDEX IF NOT EXISTS idx_file_change_metrics_repository
  ON file_change_metrics(repository_id);

CREATE INDEX IF NOT EXISTS idx_file_change_metrics_hotspot_order
  ON file_change_metrics(
    repository_id,
    commits_touched DESC,
    total_churn DESC,
    path ASC
  );
