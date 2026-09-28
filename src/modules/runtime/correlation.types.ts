import type {
  RuntimeTelemetryAggregate,
  RuntimeTelemetryFilters
} from "./runtime.types.js";

export type RuntimeCorrelationStatus =
  | "ready"
  | "repository_revision_not_found"
  | "commit_time_unavailable"
  | "missing_parent_revision"
  | "insufficient_baseline_samples"
  | "insufficient_target_samples";

export interface RuntimeCorrelationWindow {
  label: "baseline" | "target";
  from: string | null;
  to: string | null;
  revisionSha: string | null;
  aggregate: RuntimeTelemetryAggregate;
}

export interface RuntimeCorrelationEvidence {
  status: RuntimeCorrelationStatus;
  repositoryId: string;
  targetRevisionSha: string;
  parentRevisionSha: string | null;
  targetCommitAt: string | null;
  windowMinutes: number;
  minimumSamples: number;
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">;
  baseline: RuntimeCorrelationWindow | null;
  target: RuntimeCorrelationWindow | null;
  observedDelta: {
    avgDurationMs: number | null;
    p95DurationMs: number | null;
    errorRate: number | null;
  };
  evidencePolicy: string[];
}
