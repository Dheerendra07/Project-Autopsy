CREATE INDEX IF NOT EXISTS idx_analysis_runs_repository_created_at
  ON analysis_runs(repository_id, created_at DESC, id DESC);
