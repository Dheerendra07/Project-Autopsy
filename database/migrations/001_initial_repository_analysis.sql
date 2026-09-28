CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(32) NOT NULL,
  source_url TEXT,
  name VARCHAR(255) NOT NULL,
  default_branch VARCHAR(255),
  head_sha VARCHAR(64),
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  analyzer_version VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_repository_id
  ON analysis_runs(repository_id);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_status
  ON analysis_runs(status);
