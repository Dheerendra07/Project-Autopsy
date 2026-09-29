ALTER TABLE runtime_telemetry_events
ADD COLUMN IF NOT EXISTS deployment_id VARCHAR(256);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_repository_deployment_observed_at
  ON runtime_telemetry_events(repository_id, deployment_id, observed_at DESC);
