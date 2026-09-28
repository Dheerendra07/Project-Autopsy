import { db } from "../../config/database.js";

import type {
  RuntimeCorrelationChangedFile,
  RuntimeCorrelationChangeContext,
  RuntimeCorrelationStatus,
  RuntimeCorrelationWindow
} from "./correlation.types.js";
import type {
  RuntimeTelemetryAggregate,
  RuntimeTelemetryFilters
} from "./runtime.types.js";

export const RUNTIME_CORRELATION_CHANGED_FILES_LIMIT = 100;

interface AggregateRow {
  sample_count: string;
  duration_sample_count: string;
  error_count: string;
  error_rate: number;
  min_duration_ms: number | null;
  avg_duration_ms: number | null;
  p50_duration_ms: number | null;
  p95_duration_ms: number | null;
  p99_duration_ms: number | null;
  max_duration_ms: number | null;
  first_observed_at: string | null;
  last_observed_at: string | null;
}

function emptyAggregate(): RuntimeTelemetryAggregate {
  return {
    sampleCount: 0,
    durationSampleCount: 0,
    errorCount: 0,
    errorRate: 0,
    minDurationMs: null,
    avgDurationMs: null,
    p50DurationMs: null,
    p95DurationMs: null,
    p99DurationMs: null,
    maxDurationMs: null,
    firstObservedAt: null,
    lastObservedAt: null
  };
}

function toAggregate(row?: AggregateRow): RuntimeTelemetryAggregate {
  if (!row) return emptyAggregate();

  return {
    sampleCount: Number(row.sample_count),
    durationSampleCount: Number(row.duration_sample_count),
    errorCount: Number(row.error_count),
    errorRate: Number(row.error_rate),
    minDurationMs: row.min_duration_ms,
    avgDurationMs: row.avg_duration_ms,
    p50DurationMs: row.p50_duration_ms,
    p95DurationMs: row.p95_duration_ms,
    p99DurationMs: row.p99_duration_ms,
    maxDurationMs: row.max_duration_ms,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at
  };
}

function buildExtraFilters(
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">,
  startIndex: number
): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  const add = (column: string, value: unknown) => {
    values.push(value);
    clauses.push("AND " + column + " = $" + String(startIndex + values.length));
  };

  if (filters.environment) add("e.environment", filters.environment);
  if (filters.operationName) add("e.operation_name", filters.operationName);
  if (filters.signalType) add("e.signal_type", filters.signalType);

  return {
    sql: clauses.join(" "),
    values
  };
}

export interface RuntimeRevisionContext {
  targetRevisionSha: string;
  parentRevisionSha: string | null;
  parentRevisionPersisted: boolean;
  committedAt: string | null;
  subject: string;
  filesChanged: number;
  additions: number | null;
  deletions: number | null;
  changedFiles: RuntimeCorrelationChangedFile[];
  changedFilesTruncated: boolean;
  changedFilesComplete: boolean;
}

export async function getRuntimeRevisionContext(
  repositoryId: string,
  targetRevisionSha: string
): Promise<RuntimeRevisionContext | null> {
  const result = await db.query<{
    sha: string;
    parent_revision_sha: string | null;
    committed_at: Date | string | null;
    subject: string;
    files_changed: number;
    additions: number | null;
    deletions: number | null;
    parent_revision_persisted: boolean;
  }>(
    `SELECT
       c.sha,
       c.parent_shas ->> 0 AS parent_revision_sha,
       c.committed_at,
       c.subject,
       c.files_changed,
       c.additions,
       c.deletions,
       CASE
         WHEN c.parent_shas ->> 0 IS NULL THEN false
         ELSE EXISTS (
           SELECT 1
           FROM commits p
           WHERE p.repository_id = c.repository_id
             AND p.sha = c.parent_shas ->> 0
         )
       END AS parent_revision_persisted
     FROM commits c
     WHERE c.repository_id = $1
       AND c.sha = $2
     LIMIT 1`,
    [repositoryId, targetRevisionSha]
  );

  const row = result.rows[0];
  if (!row) return null;

  const changedFilesResult = await db.query<RuntimeCorrelationChangedFile>(
    `SELECT
       cf.path,
       cf.status,
       cf.additions,
       cf.deletions
     FROM commit_files cf
     INNER JOIN commits c ON c.id = cf.commit_id
     WHERE c.repository_id = $1
       AND c.sha = $2
     ORDER BY cf.path ASC, cf.status ASC, cf.additions ASC, cf.deletions ASC
     LIMIT $3`,
    [
      repositoryId,
      targetRevisionSha,
      RUNTIME_CORRELATION_CHANGED_FILES_LIMIT
    ]
  );

  const changedFiles = changedFilesResult.rows;
  const changedFilesTruncated =
    row.files_changed > RUNTIME_CORRELATION_CHANGED_FILES_LIMIT;
  const changedFilesComplete =
    !changedFilesTruncated && changedFiles.length === row.files_changed;

  return {
    targetRevisionSha: row.sha,
    parentRevisionSha: row.parent_revision_sha,
    parentRevisionPersisted: row.parent_revision_persisted,
    committedAt:
      row.committed_at instanceof Date
        ? row.committed_at.toISOString()
        : row.committed_at,
    subject: row.subject,
    filesChanged: row.files_changed,
    additions: row.additions,
    deletions: row.deletions,
    changedFiles,
    changedFilesTruncated,
    changedFilesComplete
  };
}

export async function aggregateRuntimeWindow(
  repositoryId: string,
  from: Date,
  to: Date,
  revisionSha: string | null,
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">
): Promise<RuntimeTelemetryAggregate> {
  const extra = buildExtraFilters(filters, 3);
  const values: unknown[] = [
    repositoryId,
    from.toISOString(),
    to.toISOString(),
    ...extra.values
  ];
  const revisionClause = revisionSha
    ? "AND e.revision_sha = $" + String(values.length + 1)
    : "";
  if (revisionSha) values.push(revisionSha);

  const result = await db.query<AggregateRow>(
    `SELECT
       COUNT(*)::bigint AS sample_count,
       COUNT(*) FILTER (WHERE e.duration_ms IS NOT NULL)::bigint AS duration_sample_count,
       COUNT(*) FILTER (WHERE e.status = 'error')::bigint AS error_count,
       COALESCE(
         COUNT(*) FILTER (WHERE e.status = 'error')::double precision
         / NULLIF(COUNT(*)::double precision, 0),
         0
       ) AS error_rate,
       MIN(e.duration_ms) AS min_duration_ms,
       AVG(e.duration_ms) AS avg_duration_ms,
       PERCENTILE_CONT(0.50)
         WITHIN GROUP (ORDER BY e.duration_ms) AS p50_duration_ms,
       PERCENTILE_CONT(0.95)
         WITHIN GROUP (ORDER BY e.duration_ms) AS p95_duration_ms,
       PERCENTILE_CONT(0.99)
         WITHIN GROUP (ORDER BY e.duration_ms) AS p99_duration_ms,
       MAX(e.duration_ms) AS max_duration_ms,
       MIN(e.observed_at) AS first_observed_at,
       MAX(e.observed_at) AS last_observed_at
     FROM runtime_telemetry_events e
     WHERE e.repository_id = $1
       AND e.observed_at >= $2
       AND e.observed_at < $3
       ${revisionClause}
       ${extra.sql}`,
    values
  );

  return toAggregate(result.rows[0]);
}

export function deriveRuntimeCorrelationStatus(
  hasRevision: boolean,
  hasCommitTime: boolean,
  hasParentRevision: boolean,
  baselineSampleCount: number,
  targetSampleCount: number,
  minimumSamples: number
): RuntimeCorrelationStatus {
  if (!hasRevision) return "repository_revision_not_found";
  if (!hasCommitTime) return "commit_time_unavailable";
  if (!hasParentRevision) return "missing_parent_revision";
  if (baselineSampleCount < minimumSamples) return "insufficient_baseline_samples";
  if (targetSampleCount < minimumSamples) return "insufficient_target_samples";
  return "ready";
}

export function buildCorrelationWindow(
  label: "baseline" | "target",
  from: Date,
  to: Date,
  revisionSha: string,
  aggregate: RuntimeTelemetryAggregate
): RuntimeCorrelationWindow {
  return {
    label,
    from: from.toISOString(),
    to: to.toISOString(),
    revisionSha,
    aggregate
  };
}


export function buildRuntimeChangeContext(
  context: RuntimeRevisionContext
): RuntimeCorrelationChangeContext {
  return {
    commitSha: context.targetRevisionSha,
    subject: context.subject,
    committedAt: context.committedAt,
    parentRevisionSha: context.parentRevisionSha,
    filesChanged: context.filesChanged,
    additions: context.additions,
    deletions: context.deletions,
    changedFiles: context.changedFiles,
    changedFilesTruncated: context.changedFilesTruncated,
    changedFilesComplete: context.changedFilesComplete
  };
}
