import { db } from "../../config/database.js";

import type {
  StoredTestEvolutionEvent,
  TestAnalysisStatus,
  TestArtifactType,
  TestChangeType,
  TestEvolutionAggregate,
  TestEvolutionEvent,
  TestEvolutionFilters,
  TestEvolutionGroupAggregate,
  TestEvolutionGroupBy,
  TestFramework,
  TestType
} from "./test-evolution.types.js";

function buildWhereClause(
  repositoryId: string,
  filters: TestEvolutionFilters
): {
  sql: string;
  values: unknown[];
} {
  const clauses = ["events.repository_id = $1"];
  const values: unknown[] = [repositoryId];

  const add = (sql: string, value: unknown): void => {
    values.push(value);
    clauses.push(sql.replace("$N", "$" + values.length));
  };

  if (filters.framework) add("events.framework = $N", filters.framework);
  if (filters.artifactType) add("events.artifact_type = $N", filters.artifactType);
  if (filters.testType) add("events.test_type = $N", filters.testType);
  if (filters.changeType) add("events.change_type = $N", filters.changeType);
  if (filters.analysisStatus) {
    add("events.analysis_status = $N", filters.analysisStatus);
  }

  return {
    sql: clauses.join(" AND "),
    values
  };
}

const INSERT_EVENT_SQL = [
  "INSERT INTO test_evolution_events (",
  "repository_id, commit_id, path, change_type, framework, artifact_type, test_type, analysis_status,",
  "line_count, previous_line_count, test_case_count, previous_test_case_count, test_case_delta,",
  "suite_count, previous_suite_count, suite_delta, hook_count, previous_hook_count, hook_delta,",
  "assertion_count, previous_assertion_count, assertion_delta, mock_count, previous_mock_count, mock_delta,",
  "content_hash, previous_content_hash, co_changed_production_files, signals, warnings",
  ") VALUES (",
  "$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,",
  "$11, $12, $13, $14, $15, $16, $17, $18, $19, $20,",
  "$21, $22, $23, $24, $25, $26, $27, $28, $29, $30",
  ") ON CONFLICT (repository_id, commit_id, path)",
  "DO UPDATE SET",
  "change_type = EXCLUDED.change_type,",
  "framework = EXCLUDED.framework,",
  "artifact_type = EXCLUDED.artifact_type,",
  "test_type = EXCLUDED.test_type,",
  "analysis_status = EXCLUDED.analysis_status,",
  "line_count = EXCLUDED.line_count,",
  "previous_line_count = EXCLUDED.previous_line_count,",
  "test_case_count = EXCLUDED.test_case_count,",
  "previous_test_case_count = EXCLUDED.previous_test_case_count,",
  "test_case_delta = EXCLUDED.test_case_delta,",
  "suite_count = EXCLUDED.suite_count,",
  "previous_suite_count = EXCLUDED.previous_suite_count,",
  "suite_delta = EXCLUDED.suite_delta,",
  "hook_count = EXCLUDED.hook_count,",
  "previous_hook_count = EXCLUDED.previous_hook_count,",
  "hook_delta = EXCLUDED.hook_delta,",
  "assertion_count = EXCLUDED.assertion_count,",
  "previous_assertion_count = EXCLUDED.previous_assertion_count,",
  "assertion_delta = EXCLUDED.assertion_delta,",
  "mock_count = EXCLUDED.mock_count,",
  "previous_mock_count = EXCLUDED.previous_mock_count,",
  "mock_delta = EXCLUDED.mock_delta,",
  "content_hash = EXCLUDED.content_hash,",
  "previous_content_hash = EXCLUDED.previous_content_hash,",
  "co_changed_production_files = EXCLUDED.co_changed_production_files,",
  "signals = EXCLUDED.signals,",
  "warnings = EXCLUDED.warnings"
].join("\n");

async function upsertEventsInTransaction(
  client: {
    query: <T = unknown>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  repositoryId: string,
  events: TestEvolutionEvent[]
): Promise<void> {
  for (const event of events) {
    const commitResult = await client.query<{ id: string }>(
      "SELECT id FROM commits WHERE repository_id = $1 AND sha = $2",
      [repositoryId, event.sha]
    );

    const commitId = commitResult.rows[0]?.id;

    if (!commitId) {
      continue;
    }

    await client.query(INSERT_EVENT_SQL, [
      repositoryId,
      commitId,
      event.path,
      event.changeType,
      event.framework,
      event.artifactType,
      event.testType,
      event.analysisStatus,
      event.lineCount,
      event.previousLineCount,
      event.testCaseCount,
      event.previousTestCaseCount,
      event.testCaseDelta,
      event.suiteCount,
      event.previousSuiteCount,
      event.suiteDelta,
      event.hookCount,
      event.previousHookCount,
      event.hookDelta,
      event.assertionCount,
      event.previousAssertionCount,
      event.assertionDelta,
      event.mockCount,
      event.previousMockCount,
      event.mockDelta,
      event.contentHash,
      event.previousContentHash,
      JSON.stringify(event.coChangedProductionFiles),
      JSON.stringify(event.signals),
      JSON.stringify(event.warnings)
    ]);
  }
}

async function persist(
  repositoryId: string,
  events: TestEvolutionEvent[],
  replace: boolean
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (replace) {
      await client.query(
        "DELETE FROM test_evolution_events WHERE repository_id = $1",
        [repositoryId]
      );
    }

    await upsertEventsInTransaction(client, repositoryId, events);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceTestEvolution(
  repositoryId: string,
  events: TestEvolutionEvent[]
): Promise<void> {
  await persist(repositoryId, events, true);
}

export async function appendTestEvolution(
  repositoryId: string,
  events: TestEvolutionEvent[]
): Promise<void> {
  await persist(repositoryId, events, false);
}

export async function listTestEvolutionEvents(
  repositoryId: string,
  limit: number,
  filters: TestEvolutionFilters = {}
): Promise<{
  total: number;
  events: StoredTestEvolutionEvent[];
}> {
  const filter = buildWhereClause(repositoryId, filters);

  const count = await db.query<{ count: string }>(
    [
      "SELECT COUNT(*)::text AS count",
      "FROM test_evolution_events events",
      "WHERE " + filter.sql
    ].join("\n"),
    filter.values
  );

  const result = await db.query<StoredTestEvolutionEvent>(
    [
      "SELECT",
      'events.id, events.repository_id AS "repositoryId",',
      "commits.sha, commits.subject, commits.committed_at AS \"committedAt\",",
      'events.path, events.change_type AS "changeType", events.framework,',
      'events.artifact_type AS "artifactType", events.test_type AS "testType",',
      'events.analysis_status AS "analysisStatus",',
      'events.line_count AS "lineCount", events.previous_line_count AS "previousLineCount",',
      'events.test_case_count AS "testCaseCount", events.previous_test_case_count AS "previousTestCaseCount",',
      'events.test_case_delta AS "testCaseDelta", events.suite_count AS "suiteCount",',
      'events.previous_suite_count AS "previousSuiteCount", events.suite_delta AS "suiteDelta",',
      'events.hook_count AS "hookCount", events.previous_hook_count AS "previousHookCount",',
      'events.hook_delta AS "hookDelta", events.assertion_count AS "assertionCount",',
      'events.previous_assertion_count AS "previousAssertionCount", events.assertion_delta AS "assertionDelta",',
      'events.mock_count AS "mockCount", events.previous_mock_count AS "previousMockCount",',
      'events.mock_delta AS "mockDelta", events.content_hash AS "contentHash",',
      'events.previous_content_hash AS "previousContentHash",',
      'events.co_changed_production_files AS "coChangedProductionFiles",',
      "events.signals, events.warnings",
      "FROM test_evolution_events events",
      "INNER JOIN commits",
      "  ON commits.id = events.commit_id",
      " AND commits.repository_id = events.repository_id",
      "WHERE " + filter.sql,
      "ORDER BY commits.committed_at ASC NULLS LAST, commits.sha ASC, events.path ASC",
      "LIMIT $" + (filter.values.length + 1)
    ].join("\n"),
    [...filter.values, limit]
  );

  return {
    total: Number.parseInt(count.rows[0]?.count ?? "0", 10),
    events: result.rows
  };
}

const GROUP_COLUMNS: Record<TestEvolutionGroupBy, string> = {
  framework: "events.framework",
  artifactType: "events.artifact_type",
  testType: "events.test_type",
  changeType: "events.change_type"
};

interface AggregateRow {
  event_count: string;
  test_case_count: string;
  test_case_delta: string;
  suite_count: string;
  suite_delta: string;
  hook_count: string;
  hook_delta: string;
  assertion_count: string;
  assertion_delta: string;
  mock_count: string;
  mock_delta: string;
  first_observed_at: string | null;
  last_observed_at: string | null;
}

const EMPTY_AGGREGATE: AggregateRow = {
  event_count: "0",
  test_case_count: "0",
  test_case_delta: "0",
  suite_count: "0",
  suite_delta: "0",
  hook_count: "0",
  hook_delta: "0",
  assertion_count: "0",
  assertion_delta: "0",
  mock_count: "0",
  mock_delta: "0",
  first_observed_at: null,
  last_observed_at: null
};

function toAggregate(row: AggregateRow): TestEvolutionAggregate {
  return {
    eventCount: Number.parseInt(row.event_count, 10),
    testCaseCount: Number.parseInt(row.test_case_count, 10),
    testCaseDelta: Number.parseInt(row.test_case_delta, 10),
    suiteCount: Number.parseInt(row.suite_count, 10),
    suiteDelta: Number.parseInt(row.suite_delta, 10),
    hookCount: Number.parseInt(row.hook_count, 10),
    hookDelta: Number.parseInt(row.hook_delta, 10),
    assertionCount: Number.parseInt(row.assertion_count, 10),
    assertionDelta: Number.parseInt(row.assertion_delta, 10),
    mockCount: Number.parseInt(row.mock_count, 10),
    mockDelta: Number.parseInt(row.mock_delta, 10),
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at
  };
}

export async function summarizeTestEvolution(
  repositoryId: string,
  filters: TestEvolutionFilters,
  groupBy: TestEvolutionGroupBy,
  groupLimit: number
): Promise<{
  overall: TestEvolutionAggregate;
  groups: TestEvolutionGroupAggregate[];
}> {
  const filter = buildWhereClause(repositoryId, filters);
  const groupColumn = GROUP_COLUMNS[groupBy];

  const aggregateSelect = [
    "COUNT(*)::text AS event_count",
    "COALESCE(SUM(events.test_case_count), 0)::text AS test_case_count",
    "COALESCE(SUM(events.test_case_delta), 0)::text AS test_case_delta",
    "COALESCE(SUM(events.suite_count), 0)::text AS suite_count",
    "COALESCE(SUM(events.suite_delta), 0)::text AS suite_delta",
    "COALESCE(SUM(events.hook_count), 0)::text AS hook_count",
    "COALESCE(SUM(events.hook_delta), 0)::text AS hook_delta",
    "COALESCE(SUM(events.assertion_count), 0)::text AS assertion_count",
    "COALESCE(SUM(events.assertion_delta), 0)::text AS assertion_delta",
    "COALESCE(SUM(events.mock_count), 0)::text AS mock_count",
    "COALESCE(SUM(events.mock_delta), 0)::text AS mock_delta",
    "MIN(commits.committed_at) AS first_observed_at",
    "MAX(commits.committed_at) AS last_observed_at"
  ].join(",\n");

  const fromJoin = [
    "FROM test_evolution_events events",
    "INNER JOIN commits",
    "  ON commits.id = events.commit_id",
    " AND commits.repository_id = events.repository_id",
    "WHERE " + filter.sql
  ].join("\n");

  const overallResult = await db.query<AggregateRow>(
    "SELECT " + aggregateSelect + "\n" + fromJoin,
    filter.values
  );

  const groupsResult = await db.query<
    AggregateRow & { group_key: string | null }
  >(
    [
      "SELECT COALESCE(" + groupColumn + ", '<unknown>') AS group_key,",
      aggregateSelect,
      fromJoin,
      "GROUP BY " + groupColumn,
      "ORDER BY event_count DESC, group_key ASC",
      "LIMIT $" + (filter.values.length + 1)
    ].join("\n"),
    [...filter.values, groupLimit]
  );

  return {
    overall: toAggregate(
      overallResult.rows[0] ?? EMPTY_AGGREGATE
    ),
    groups: groupsResult.rows.map((row) => ({
      key: row.group_key ?? "<unknown>",
      ...toAggregate(row)
    }))
  };
}

export function isTestFramework(
  value: string
): value is TestFramework {
  return [
    "node_test",
    "jest",
    "vitest",
    "mocha",
    "ava",
    "tap",
    "playwright",
    "cypress",
    "unknown"
  ].includes(value);
}

export function isTestArtifactType(
  value: string
): value is TestArtifactType {
  return ["test_source", "test_config", "fixture"].includes(value);
}

export function isTestType(
  value: string
): value is TestType {
  return [
    "unit",
    "integration",
    "e2e",
    "contract",
    "fixture",
    "config",
    "unknown"
  ].includes(value);
}

export function isTestChangeType(
  value: string
): value is TestChangeType {
  return ["added", "modified", "deleted"].includes(value);
}

export function isTestAnalysisStatus(
  value: string
): value is TestAnalysisStatus {
  return [
    "supported_source",
    "deleted",
    "read_error"
  ].includes(value);
}
