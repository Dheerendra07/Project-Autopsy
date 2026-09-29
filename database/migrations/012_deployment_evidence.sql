CREATE TABLE IF NOT EXISTS deployment_evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  event_id VARCHAR(128) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  provider VARCHAR(64) NOT NULL,
  deployment_id VARCHAR(256) NOT NULL,
  environment VARCHAR(64) NOT NULL,
  state VARCHAR(32) NOT NULL,
  revision_sha VARCHAR(64),
  artifact_digest VARCHAR(255),
  build_id VARCHAR(256),
  release_id VARCHAR(256),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash CHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, event_id),
  CHECK (state IN ('started', 'succeeded', 'failed', 'cancelled', 'unknown')),
  CHECK (revision_sha IS NULL OR revision_sha ~ '^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$'),
  CHECK (artifact_digest IS NULL OR artifact_digest ~ '^sha256:[0-9a-fA-F]{64}$'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (payload_hash ~ '^[0-9a-fA-F]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_deployment_evidence_repository_occurred_at
  ON deployment_evidence_events(repository_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_deployment_evidence_repository_deployment
  ON deployment_evidence_events(repository_id, deployment_id, occurred_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_deployment_evidence_repository_revision
  ON deployment_evidence_events(repository_id, revision_sha, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_deployment_evidence_repository_environment
  ON deployment_evidence_events(repository_id, environment, occurred_at DESC);
