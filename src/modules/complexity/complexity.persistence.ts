import { db } from "../../config/database.js";
import type {
  CodeComplexityEvent,
  ComplexityAnalysisStatus
} from "./complexity.discovery.js";

export interface StoredCodeComplexityEvent {
  path: string;
  change_type: "added" | "modified" | "deleted";
  analysis_status: ComplexityAnalysisStatus;
  before_source_lines: number | null;
  after_source_lines: number | null;
  before_function_count: number | null;
  after_function_count: number | null;
  before_class_count: number | null;
  after_class_count: number | null;
  before_cyclomatic_complexity: number | null;
  after_cyclomatic_complexity: number | null;
  before_max_nesting_depth: number | null;
  after_max_nesting_depth: number | null;
  sha: string;
  committed_at: string | null;
  subject: string;
}

type DatabaseClient = {
  query<Row = unknown>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: Row[] }>;
};

async function insertCodeComplexityEvents(
  client: DatabaseClient,
  repositoryId: string,
  events: CodeComplexityEvent[]
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  await client.query(
    `INSERT INTO code_complexity_events (
      repository_id,
      commit_id,
      path,
      change_type,
      analysis_status,
      before_source_lines,
      after_source_lines,
      before_function_count,
      after_function_count,
      before_class_count,
      after_class_count,
      before_cyclomatic_complexity,
      after_cyclomatic_complexity,
      before_max_nesting_depth,
      after_max_nesting_depth
    )
    SELECT
      $1,
      commits.id,
      item.path,
      item.change_type,
      item.analysis_status,
      item.before_source_lines,
      item.after_source_lines,
      item.before_function_count,
      item.after_function_count,
      item.before_class_count,
      item.after_class_count,
      item.before_cyclomatic_complexity,
      item.after_cyclomatic_complexity,
      item.before_max_nesting_depth,
      item.after_max_nesting_depth
    FROM jsonb_to_recordset($2::jsonb) AS item(
      sha TEXT,
      path TEXT,
      change_type TEXT,
      analysis_status TEXT,
      before_source_lines INTEGER,
      after_source_lines INTEGER,
      before_function_count INTEGER,
      after_function_count INTEGER,
      before_class_count INTEGER,
      after_class_count INTEGER,
      before_cyclomatic_complexity INTEGER,
      after_cyclomatic_complexity INTEGER,
      before_max_nesting_depth INTEGER,
      after_max_nesting_depth INTEGER
    )
    INNER JOIN commits
      ON commits.repository_id = $1
     AND commits.sha = item.sha
    ON CONFLICT (repository_id, commit_id, path)
    DO UPDATE SET
      change_type = EXCLUDED.change_type,
      analysis_status = EXCLUDED.analysis_status,
      before_source_lines = EXCLUDED.before_source_lines,
      after_source_lines = EXCLUDED.after_source_lines,
      before_function_count = EXCLUDED.before_function_count,
      after_function_count = EXCLUDED.after_function_count,
      before_class_count = EXCLUDED.before_class_count,
      after_class_count = EXCLUDED.after_class_count,
      before_cyclomatic_complexity = EXCLUDED.before_cyclomatic_complexity,
      after_cyclomatic_complexity = EXCLUDED.after_cyclomatic_complexity,
      before_max_nesting_depth = EXCLUDED.before_max_nesting_depth,
      after_max_nesting_depth = EXCLUDED.after_max_nesting_depth`,
    [
      repositoryId,
      JSON.stringify(
        events.map((event) => ({
          sha: event.sha,
          path: event.path,
          change_type: event.changeType,
          analysis_status: event.analysisStatus,
          before_source_lines: event.before?.sourceLines ?? null,
          after_source_lines: event.after?.sourceLines ?? null,
          before_function_count: event.before?.functionCount ?? null,
          after_function_count: event.after?.functionCount ?? null,
          before_class_count: event.before?.classCount ?? null,
          after_class_count: event.after?.classCount ?? null,
          before_cyclomatic_complexity:
            event.before?.cyclomaticComplexity ?? null,
          after_cyclomatic_complexity:
            event.after?.cyclomaticComplexity ?? null,
          before_max_nesting_depth:
            event.before?.maxNestingDepth ?? null,
          after_max_nesting_depth:
            event.after?.maxNestingDepth ?? null
        }))
      )
    ]
  );
}

export async function replaceCodeComplexityEvolution(
  repositoryId: string,
  events: CodeComplexityEvent[]
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM code_complexity_events WHERE repository_id = $1",
      [repositoryId]
    );
    await insertCodeComplexityEvents(client, repositoryId, events);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function appendCodeComplexityEvolution(
  repositoryId: string,
  events: CodeComplexityEvent[]
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await insertCodeComplexityEvents(client, repositoryId, events);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCodeComplexityEvents(
  repositoryId: string,
  limit: number
): Promise<StoredCodeComplexityEvent[]> {
  const result = await db.query<StoredCodeComplexityEvent>(
    `SELECT
      events.path,
      events.change_type,
      events.analysis_status,
      events.before_source_lines,
      events.after_source_lines,
      events.before_function_count,
      events.after_function_count,
      events.before_class_count,
      events.after_class_count,
      events.before_cyclomatic_complexity,
      events.after_cyclomatic_complexity,
      events.before_max_nesting_depth,
      events.after_max_nesting_depth,
      commits.sha,
      commits.committed_at,
      commits.subject
    FROM code_complexity_events AS events
    INNER JOIN commits
      ON commits.id = events.commit_id
     AND commits.repository_id = events.repository_id
    WHERE events.repository_id = $1
    ORDER BY commits.committed_at ASC NULLS LAST, events.path ASC
    LIMIT $2`,
    [repositoryId, limit]
  );

  return result.rows;
}
