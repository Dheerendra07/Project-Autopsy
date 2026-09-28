ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS tracked_branch VARCHAR(255);

UPDATE repositories
SET tracked_branch = default_branch
WHERE tracked_branch IS NULL
  AND default_branch IS NOT NULL;

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS analysis_mode VARCHAR(16) NOT NULL DEFAULT 'full';

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS base_head_sha VARCHAR(64);

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS target_head_sha VARCHAR(64);

UPDATE analysis_runs AS runs
SET target_head_sha = repositories.head_sha
FROM repositories
WHERE repositories.id = runs.repository_id
  AND runs.status = 'completed'
  AND runs.target_head_sha IS NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_runs_repository_created_at
  ON analysis_runs(repository_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_repository_target
  ON analysis_runs(repository_id, target_head_sha);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_runs_one_active_repository
  ON analysis_runs(repository_id)
  WHERE status IN ('queued', 'running');