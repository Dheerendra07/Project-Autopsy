CREATE TABLE IF NOT EXISTS code_complexity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('added', 'modified', 'deleted')),
  analysis_status TEXT NOT NULL CHECK (
    analysis_status IN ('supported', 'parse_error', 'skipped_too_large')
  ),
  before_source_lines INTEGER,
  after_source_lines INTEGER,
  before_function_count INTEGER,
  after_function_count INTEGER,
  before_class_count INTEGER,
  after_class_count INTEGER,
  before_cyclomatic_complexity INTEGER,
  after_cyclomatic_complexity INTEGER,
  before_max_nesting_depth INTEGER,
  after_max_nesting_depth INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, commit_id, path)
);

CREATE INDEX IF NOT EXISTS idx_code_complexity_events_repository_time
  ON code_complexity_events(repository_id, commit_id, path);

CREATE INDEX IF NOT EXISTS idx_code_complexity_events_repository_status
  ON code_complexity_events(repository_id, analysis_status, path);