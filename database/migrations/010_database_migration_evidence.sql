CREATE TABLE IF NOT EXISTS database_migration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  change_type VARCHAR(16) NOT NULL,
  framework VARCHAR(32) NOT NULL,
  analysis_status VARCHAR(32) NOT NULL,
  migration_kind VARCHAR(16) NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  operation_count INTEGER NOT NULL DEFAULT 0,
  schema_operation_count INTEGER NOT NULL DEFAULT 0,
  data_operation_count INTEGER NOT NULL DEFAULT 0,
  content_hash CHAR(64),
  operations JSONB NOT NULL DEFAULT '[]'::jsonb,
  destructive_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, commit_id, path),
  CHECK (change_type IN ('added', 'modified', 'deleted')),
  CHECK (
    framework IN (
      'sql',
      'prisma',
      'drizzle',
      'knex',
      'sequelize',
      'typeorm',
      'rails',
      'unknown'
    )
  ),
  CHECK (
    analysis_status IN (
      'supported_sql',
      'unsupported_code',
      'deleted',
      'read_error'
    )
  ),
  CHECK (migration_kind IN ('schema', 'data', 'mixed', 'unknown')),
  CHECK (line_count >= 0),
  CHECK (operation_count >= 0),
  CHECK (schema_operation_count >= 0),
  CHECK (data_operation_count >= 0),
  CHECK (jsonb_typeof(operations) = 'array'),
  CHECK (jsonb_typeof(destructive_signals) = 'array'),
  CHECK (jsonb_typeof(warnings) = 'array'),
  CHECK (
    content_hash IS NULL OR content_hash ~ '^[0-9a-fA-F]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_database_migration_events_repository_commit
  ON database_migration_events(repository_id, commit_id);

CREATE INDEX IF NOT EXISTS idx_database_migration_events_repository_framework
  ON database_migration_events(repository_id, framework, created_at);

CREATE INDEX IF NOT EXISTS idx_database_migration_events_repository_kind
  ON database_migration_events(repository_id, migration_kind, created_at);
