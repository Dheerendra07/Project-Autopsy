CREATE TABLE IF NOT EXISTS runtime_telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  event_id VARCHAR(128) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  signal_type VARCHAR(32) NOT NULL,
  service_name VARCHAR(128) NOT NULL,
  operation_name VARCHAR(256) NOT NULL,
  environment VARCHAR(64),
  revision_sha VARCHAR(64),
  trace_id VARCHAR(32),
  span_id VARCHAR(16),
  duration_ms DOUBLE PRECISION NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ok',
  http_status_code INTEGER,
  error_type VARCHAR(256),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash CHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, event_id),
  CHECK (signal_type IN ('http', 'job', 'db', 'external', 'custom')),
  CHECK (status IN ('ok', 'error', 'unset')),
  CHECK (duration_ms >= 0),
  CHECK (duration_ms <= 86400000),
  CHECK (http_status_code IS NULL OR http_status_code BETWEEN 100 AND 599),
  CHECK (jsonb_typeof(attributes) = 'object'),
  CHECK (revision_sha IS NULL OR revision_sha ~ '^[0-9a-fA-F]{7,64}$'),
  CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-fA-F]{16,32}$'),
  CHECK (span_id IS NULL OR span_id ~ '^[0-9a-fA-F]{8,16}$'),
  CHECK (payload_hash ~ '^[0-9a-fA-F]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_repository_observed_at
  ON runtime_telemetry_events(repository_id, observed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_repository_revision_observed_at
  ON runtime_telemetry_events(repository_id, revision_sha, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_repository_operation_observed_at
  ON runtime_telemetry_events(repository_id, operation_name, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_repository_environment_observed_at
  ON runtime_telemetry_events(repository_id, environment, observed_at DESC);
