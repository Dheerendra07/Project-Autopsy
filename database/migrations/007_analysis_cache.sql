CREATE TABLE IF NOT EXISTS analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  analyzer_name VARCHAR(64) NOT NULL,
  analyzer_version VARCHAR(64) NOT NULL,
  cache_key TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(
    repository_id,
    analyzer_name,
    analyzer_version,
    cache_key
  )
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_lookup
  ON analysis_cache(
    repository_id,
    analyzer_name,
    analyzer_version,
    cache_key
  );