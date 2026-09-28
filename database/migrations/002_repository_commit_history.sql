CREATE TABLE IF NOT EXISTS commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha VARCHAR(64) NOT NULL,
  parent_shas JSONB NOT NULL DEFAULT '[]'::jsonb,
  author_name VARCHAR(255),
  author_email VARCHAR(320),
  authored_at TIMESTAMPTZ,
  committer_name VARCHAR(255),
  committer_email VARCHAR(320),
  committed_at TIMESTAMPTZ,
  subject TEXT NOT NULL,
  files_changed INTEGER NOT NULL DEFAULT 0,
  additions INTEGER,
  deletions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, sha)
);

CREATE INDEX IF NOT EXISTS idx_commits_repository_committed_at
  ON commits(repository_id, committed_at);

CREATE INDEX IF NOT EXISTS idx_commits_repository_sha
  ON commits(repository_id, sha);

CREATE TABLE IF NOT EXISTS commit_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  previous_path TEXT,
  additions INTEGER,
  deletions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(commit_id, path)
);

CREATE INDEX IF NOT EXISTS idx_commit_files_commit_id
  ON commit_files(commit_id);

CREATE INDEX IF NOT EXISTS idx_commit_files_path
  ON commit_files(path);
