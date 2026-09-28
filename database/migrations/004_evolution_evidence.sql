CREATE TABLE IF NOT EXISTS dependency_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  manifest_path TEXT NOT NULL,
  package_manager VARCHAR(32) NOT NULL,
  dependencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  dev_dependencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, commit_id, manifest_path)
);

CREATE INDEX IF NOT EXISTS idx_dependency_snapshots_repository_commit
  ON dependency_snapshots(repository_id, commit_id);

CREATE TABLE IF NOT EXISTS dependency_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  manifest_path TEXT NOT NULL,
  package_name TEXT NOT NULL,
  scope VARCHAR(16) NOT NULL,
  change_type VARCHAR(16) NOT NULL,
  previous_spec TEXT,
  current_spec TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(
    repository_id,
    commit_id,
    manifest_path,
    package_name,
    scope
  )
);

CREATE INDEX IF NOT EXISTS idx_dependency_changes_repository
  ON dependency_changes(repository_id, commit_id);

CREATE TABLE IF NOT EXISTS architecture_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  root_path TEXT NOT NULL,
  directories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, commit_id, root_path)
);

CREATE INDEX IF NOT EXISTS idx_architecture_snapshots_repository_commit
  ON architecture_snapshots(repository_id, commit_id);

CREATE TABLE IF NOT EXISTS architecture_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  root_path TEXT NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(
    repository_id,
    commit_id,
    root_path,
    event_type,
    path
  )
);

CREATE INDEX IF NOT EXISTS idx_architecture_events_repository
  ON architecture_events(repository_id, commit_id);
