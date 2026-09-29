import { db } from "../../config/database.js";

import type {
  PreparedRuntimeTelemetryEvent,
  RuntimeTelemetryAggregate,
  RuntimeTelemetryFilters,
  RuntimeTelemetryGroupAggregate,
  RuntimeTelemetryGroupBy,
  RuntimeTelemetryEventInput
} from "./runtime.types.js";

export interface RuntimeTelemetryRow {
  id: string;
  event_id: string;
  observed_at: string;
  signal_type: RuntimeTelemetryEventInput["signalType"];
  service_name: string;
  operation_name: string;
  environment: string | null;
  deployment_id: string | null;
  revision_sha: string | null;
  trace_id: string | null;
  span_id: string | null;
  duration_ms: number;
  status: RuntimeTelemetryEventInput["status"];
  http_status_code: number | null;
  error_type: string | null;
  received_at: string;
}

export class RuntimeTelemetryEventConflictError extends Error {
  constructor(public readonly eventId: string) {
    super(
      `Telemetry eventId already exists with different payload: ${eventId}`
    );
    this.name = "RuntimeTelemetryEventConflictError";
  }
}

function buildWhereClause(
  repositoryId: string,
  filters: RuntimeTelemetryFilters
): {
  sql: string;
  values: unknown[];
} {
  const clauses = ["e.repository_id = $1"];
  const values: unknown[] = [repositoryId];

  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace("$N", `$${values.length}`));
  };

  if (filters.from) add("e.observed_at >= $N", filters.from.toISOString());
  if (filters.to) add("e.observed_at < $N", filters.to.toISOString());
  if (filters.deploymentId) add("e.deployment_id = $N", filters.deploymentId);
  if (filters.revisionSha) add("e.revision_sha = $N", filters.revisionSha);
  if (filters.environment) add("e.environment = $N", filters.environment);
  if (filters.operationName) add("e.operation_name = $N", filters.operationName);
  if (filters.signalType) add("e.signal_type = $N", filters.signalType);

  return {
    sql: clauses.join(" AND "),
    values
  };
}

export async function insertRuntimeTelemetryBatch(
  repositoryId: string,
  events: PreparedRuntimeTelemetryEvent[]
): Promise<{ accepted: number; duplicates: number }> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const values: unknown[] = [];
    const rows = events.map((event, eventIndex) => {
      const base = eventIndex * 17;

      values.push(
        repositoryId,
        event.eventId,
        event.observedAtIso,
        event.signalType,
        event.serviceName,
        event.operationName,
        event.environment ?? null,
        event.deploymentId ?? null,
        event.revisionSha ?? null,
        event.traceId ?? null,
        event.spanId ?? null,
        event.durationMs,
        event.status,
        event.httpStatusCode ?? null,
        event.errorType ?? null,
        JSON.stringify(event.attributes),
        event.payloadHash
      );

      const placeholders = Array.from(
        { length: 17 },
        (_, index) => `$${base + index + 1}`
      ).join(", ");

      return `(${placeholders})`;
    });

    const inserted = await client.query<{ event_id: string }>(
      `INSERT INTO runtime_telemetry_events (
        repository_id,
        event_id,
        observed_at,
        signal_type,
        service_name,
        operation_name,
        environment,
        deployment_id,
        revision_sha,
        trace_id,
        span_id,
        duration_ms,
        status,
        http_status_code,
        error_type,
        attributes,
        payload_hash
      )
      VALUES ${rows.join(", ")}
      ON CONFLICT (repository_id, event_id) DO NOTHING
      RETURNING event_id`,
      values
    );

    const eventIds = [...new Set(events.map((event) => event.eventId))];
    const existing = await client.query<{
      event_id: string;
      payload_hash: string;
    }>(
      `SELECT event_id, payload_hash
       FROM runtime_telemetry_events
       WHERE repository_id = $1
         AND event_id = ANY($2::text[])`,
      [repositoryId, eventIds]
    );

    const hashesByEventId = new Map(
      existing.rows.map((row) => [row.event_id, row.payload_hash])
    );

    for (const event of events) {
      const existingHash = hashesByEventId.get(event.eventId);

      if (!existingHash) {
        throw new Error(
          `Telemetry event disappeared during persistence: ${event.eventId}`
        );
      }

      if (existingHash !== event.payloadHash) {
        throw new RuntimeTelemetryEventConflictError(event.eventId);
      }
    }

    await client.query("COMMIT");

    const accepted = inserted.rows.length;

    return {
      accepted,
      duplicates: events.length - accepted
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listRuntimeTelemetryEvents(
  repositoryId: string,
  page: number,
  limit: number,
  filters: RuntimeTelemetryFilters
): Promise<{ total: number; events: RuntimeTelemetryRow[] }> {
  const { sql, values } = buildWhereClause(repositoryId, filters);

  const count = await db.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count
     FROM runtime_telemetry_events e
     WHERE ${sql}`,
    values
  );

  const total = Number(count.rows[0]?.count ?? "0");
  const offset = (page - 1) * limit;

  const result = await db.query<RuntimeTelemetryRow>(
    `SELECT
       e.id,
       e.event_id,
       e.observed_at,
       e.signal_type,
       e.service_name,
       e.operation_name,
       e.environment,
       e.deployment_id,
       e.revision_sha,
       e.trace_id,
       e.span_id,
       e.duration_ms,
       e.status,
       e.http_status_code,
       e.error_type,
       e.received_at
     FROM runtime_telemetry_events e
     WHERE ${sql}
     ORDER BY e.observed_at DESC, e.id DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    total,
    events: result.rows
  };
}

interface AggregateDbRow {
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

function toAggregate(row: AggregateDbRow): RuntimeTelemetryAggregate {
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

const GROUP_COLUMNS: Record<RuntimeTelemetryGroupBy, string> = {
  revision: "e.revision_sha",
  operation: "e.operation_name",
  service: "e.service_name",
  environment: "e.environment",
  signalType: "e.signal_type"
};

export async function summarizeRuntimeTelemetry(
  repositoryId: string,
  filters: RuntimeTelemetryFilters,
  groupBy: RuntimeTelemetryGroupBy,
  groupLimit: number
): Promise<{
  overall: RuntimeTelemetryAggregate;
  groups: RuntimeTelemetryGroupAggregate[];
}> {
  const filter = buildWhereClause(repositoryId, filters);

  const overall = await db.query<AggregateDbRow>(
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
     WHERE ${filter.sql}`,
    filter.values
  );

  const column = GROUP_COLUMNS[groupBy];

  const groupResult = await db.query<
    AggregateDbRow & {
      group_key: string | null;
      revision_known: boolean;
    }
  >(
    `SELECT
       COALESCE(${column}, '<unknown>') AS group_key,
       COALESCE(BOOL_OR(c.sha IS NOT NULL), false) AS revision_known,
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
     LEFT JOIN commits c
       ON c.repository_id = e.repository_id
      AND c.sha = e.revision_sha
     WHERE ${filter.sql}
     GROUP BY ${column}
     ORDER BY sample_count DESC, group_key ASC
     LIMIT $${filter.values.length + 1}`,
    [...filter.values, groupLimit]
  );

  const overallRow = overall.rows[0];

  return {
    overall: toAggregate(
      overallRow ?? {
        sample_count: "0",
        duration_sample_count: "0",
        error_count: "0",
        error_rate: 0,
        min_duration_ms: null,
        avg_duration_ms: null,
        p50_duration_ms: null,
        p95_duration_ms: null,
        p99_duration_ms: null,
        max_duration_ms: null,
        first_observed_at: null,
        last_observed_at: null
      }
    ),
    groups: groupResult.rows.map((row) => ({
      key: row.group_key ?? "<unknown>",
      ...toAggregate(row),
      ...(groupBy === "revision"
        ? { revisionKnown: row.revision_known }
        : {})
    }))
  };
}
