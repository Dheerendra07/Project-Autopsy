CREATE TABLE IF NOT EXISTS file_change_coupling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path_a TEXT NOT NULL,
  path_b TEXT NOT NULL,
  co_change_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, path_a, path_b),
  CHECK(path_a < path_b)
);

CREATE INDEX IF NOT EXISTS idx_file_change_coupling_repository_count
  ON file_change_coupling(repository_id, co_change_count DESC, path_a ASC, path_b ASC);
