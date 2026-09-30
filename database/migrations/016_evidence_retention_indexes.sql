CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_retention_observed_at
  ON runtime_telemetry_events(observed_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_deployment_evidence_retention_occurred_at
  ON deployment_evidence_events(occurred_at ASC, id ASC);
