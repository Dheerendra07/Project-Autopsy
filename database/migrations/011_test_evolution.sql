CREATE TABLE IF NOT EXISTS test_evolution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  change_type VARCHAR(16) NOT NULL,
  framework VARCHAR(32) NOT NULL,
  artifact_type VARCHAR(32) NOT NULL,
  test_type VARCHAR(32) NOT NULL,
  analysis_status VARCHAR(32) NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  previous_line_count INTEGER NOT NULL DEFAULT 0,
  test_case_count INTEGER NOT NULL DEFAULT 0,
  previous_test_case_count INTEGER NOT NULL DEFAULT 0,
  test_case_delta INTEGER NOT NULL DEFAULT 0,
  suite_count INTEGER NOT NULL DEFAULT 0,
  previous_suite_count INTEGER NOT NULL DEFAULT 0,
  suite_delta INTEGER NOT NULL DEFAULT 0,
  hook_count INTEGER NOT NULL DEFAULT 0,
  previous_hook_count INTEGER NOT NULL DEFAULT 0,
  hook_delta INTEGER NOT NULL DEFAULT 0,
  assertion_count INTEGER NOT NULL DEFAULT 0,
  previous_assertion_count INTEGER NOT NULL DEFAULT 0,
  assertion_delta INTEGER NOT NULL DEFAULT 0,
  mock_count INTEGER NOT NULL DEFAULT 0,
  previous_mock_count INTEGER NOT NULL DEFAULT 0,
  mock_delta INTEGER NOT NULL DEFAULT 0,
  content_hash CHAR(64),
  previous_content_hash CHAR(64),
  co_changed_production_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, commit_id, path),
  CHECK (change_type IN ('added', 'modified', 'deleted')),
  CHECK (
    framework IN (
      'node_test',
      'jest',
      'vitest',
      'mocha',
      'ava',
      'tap',
      'playwright',
      'cypress',
      'unknown'
    )
  ),
  CHECK (artifact_type IN ('test_source', 'test_config', 'fixture')),
  CHECK (
    test_type IN (
      'unit',
      'integration',
      'e2e',
      'contract',
      'fixture',
      'config',
      'unknown'
    )
  ),
  CHECK (
    analysis_status IN (
      'supported_source',
      'deleted',
      'read_error'
    )
  ),
  CHECK (line_count >= 0),
  CHECK (previous_line_count >= 0),
  CHECK (test_case_count >= 0),
  CHECK (previous_test_case_count >= 0),
  CHECK (suite_count >= 0),
  CHECK (previous_suite_count >= 0),
  CHECK (hook_count >= 0),
  CHECK (previous_hook_count >= 0),
  CHECK (assertion_count >= 0),
  CHECK (previous_assertion_count >= 0),
  CHECK (mock_count >= 0),
  CHECK (previous_mock_count >= 0),
  CHECK (jsonb_typeof(co_changed_production_files) = 'array'),
  CHECK (jsonb_typeof(signals) = 'array'),
  CHECK (jsonb_typeof(warnings) = 'array'),
  CHECK (
    content_hash IS NULL OR content_hash ~ '^[0-9a-fA-F]{64}$'
  ),
  CHECK (
    previous_content_hash IS NULL OR
    previous_content_hash ~ '^[0-9a-fA-F]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_test_evolution_repository_commit
  ON test_evolution_events(repository_id, commit_id);

CREATE INDEX IF NOT EXISTS idx_test_evolution_repository_framework
  ON test_evolution_events(repository_id, framework, created_at);

CREATE INDEX IF NOT EXISTS idx_test_evolution_repository_type
  ON test_evolution_events(repository_id, test_type, created_at);

CREATE INDEX IF NOT EXISTS idx_test_evolution_repository_change
  ON test_evolution_events(repository_id, change_type, created_at);
