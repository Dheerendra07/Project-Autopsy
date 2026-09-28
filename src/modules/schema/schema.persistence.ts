import { db } from "../../config/database.js";

import type {
  DatabaseMigrationEvent,
  DatabaseMigrationFilters,
  DatabaseMigrationFramework,
  DatabaseMigrationKind,
  DatabaseMigrationOperationType,
  DatabaseMigrationChangeType,
  StoredDatabaseMigrationEvent
} from "./schema.types.js";

interface PersistedDatabaseMigrationEvent extends DatabaseMigrationEvent {}

export async function replaceDatabaseMigrationEvolution(
  repositoryId: string,
  events: DatabaseMigrationEvent[]
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM database_migration_events WHERE repository_id = $1",
      [repositoryId]
    );

    for (const event of events) {
      const commitResult = await client.query<{ id: string }>(
        "SELECT id FROM commits WHERE repository_id = $1 AND sha = $2",
        [repositoryId, event.sha]
      );
      const commitId = commitResult.rows[0]?.id;

      if (!commitId) {
        continue;
      }

      await client.query(
        `INSERT INTO database_migration_events (
          repository_id, commit_id, path, change_type, framework,
          analysis_status, migration_kind, line_count, operation_count,
          schema_operation_count, data_operation_count, content_hash,
          operations, destructive_signals, warnings
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14::jsonb, $15::jsonb
        )
        ON CONFLICT (repository_id, commit_id, path)
        DO UPDATE SET
          change_type = EXCLUDED.change_type,
          framework = EXCLUDED.framework,
          analysis_status = EXCLUDED.analysis_status,
          migration_kind = EXCLUDED.migration_kind,
          line_count = EXCLUDED.line_count,
          operation_count = EXCLUDED.operation_count,
          schema_operation_count = EXCLUDED.schema_operation_count,
          data_operation_count = EXCLUDED.data_operation_count,
          content_hash = EXCLUDED.content_hash,
          operations = EXCLUDED.operations,
          destructive_signals = EXCLUDED.destructive_signals,
          warnings = EXCLUDED.warnings`,
        [
          repositoryId,
          commitId,
          event.path,
          event.changeType,
          event.framework,
          event.analysisStatus,
          event.migrationKind,
          event.lineCount,
          event.operationCount,
          event.schemaOperationCount,
          event.dataOperationCount,
          event.contentHash,
          JSON.stringify(event.operations),
          JSON.stringify(event.destructiveSignals),
          JSON.stringify(event.warnings)
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function appendDatabaseMigrationEvolution(
  repositoryId: string,
  events: DatabaseMigrationEvent[]
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const event of events) {
      const commitResult = await client.query<{ id: string }>(
        "SELECT id FROM commits WHERE repository_id = $1 AND sha = $2",
        [repositoryId, event.sha]
      );
      const commitId = commitResult.rows[0]?.id;

      if (!commitId) {
        continue;
      }

      await client.query(
        `INSERT INTO database_migration_events (
          repository_id, commit_id, path, change_type, framework,
          analysis_status, migration_kind, line_count, operation_count,
          schema_operation_count, data_operation_count, content_hash,
          operations, destructive_signals, warnings
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14::jsonb, $15::jsonb
        )
        ON CONFLICT (repository_id, commit_id, path)
        DO UPDATE SET
          change_type = EXCLUDED.change_type,
          framework = EXCLUDED.framework,
          analysis_status = EXCLUDED.analysis_status,
          migration_kind = EXCLUDED.migration_kind,
          line_count = EXCLUDED.line_count,
          operation_count = EXCLUDED.operation_count,
          schema_operation_count = EXCLUDED.schema_operation_count,
          data_operation_count = EXCLUDED.data_operation_count,
          content_hash = EXCLUDED.content_hash,
          operations = EXCLUDED.operations,
          destructive_signals = EXCLUDED.destructive_signals,
          warnings = EXCLUDED.warnings`,
        [
          repositoryId,
          commitId,
          event.path,
          event.changeType,
          event.framework,
          event.analysisStatus,
          event.migrationKind,
          event.lineCount,
          event.operationCount,
          event.schemaOperationCount,
          event.dataOperationCount,
          event.contentHash,
          JSON.stringify(event.operations),
          JSON.stringify(event.destructiveSignals),
          JSON.stringify(event.warnings)
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listDatabaseMigrationEvents(
  repositoryId: string,
  limit: number,
  filters: DatabaseMigrationFilters = {}
): Promise<{
  total: number;
  events: StoredDatabaseMigrationEvent[];
}> {
  const clauses = ["events.repository_id = $1"];
  const values: unknown[] = [repositoryId];

  const addFilter = (sql: string, value: unknown): void => {
    values.push(value);
    clauses.push(sql.replace("$N", "$" + values.length));
  };

  if (filters.framework) {
    addFilter("events.framework = $N", filters.framework);
  }

  if (filters.changeType) {
    addFilter("events.change_type = $N", filters.changeType);
  }

  if (filters.migrationKind) {
    addFilter("events.migration_kind = $N", filters.migrationKind);
  }

  if (filters.operationType) {
    addFilter(
      "events.operations @> $N::jsonb",
      JSON.stringify([{ operationType: filters.operationType }])
    );
  }

  const where = clauses.join(" AND ");

  const count = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM database_migration_events events
     WHERE ${where}`,
    values
  );

  const rows = await db.query<StoredDatabaseMigrationEvent>(
    `SELECT
       events.id,
       events.repository_id AS "repositoryId",
       commits.sha,
       commits.subject,
       commits.committed_at AS "committedAt",
       events.path,
       events.change_type AS "changeType",
       events.framework,
       events.analysis_status AS "analysisStatus",
       events.migration_kind AS "migrationKind",
       events.line_count AS "lineCount",
       events.operation_count AS "operationCount",
       events.schema_operation_count AS "schemaOperationCount",
       events.data_operation_count AS "dataOperationCount",
       events.content_hash AS "contentHash",
       events.operations,
       events.destructive_signals AS "destructiveSignals",
       events.warnings
     FROM database_migration_events events
     INNER JOIN commits
       ON commits.id = events.commit_id
      AND commits.repository_id = events.repository_id
     WHERE ${where}
     ORDER BY commits.committed_at ASC NULLS LAST, commits.sha ASC, events.path ASC
     LIMIT $${values.length + 1}`,
    [...values, limit]
  );

  return {
    total: Number.parseInt(count.rows[0]?.count ?? "0", 10),
    events: rows.rows
  };
}

export function isDatabaseMigrationFramework(
  value: string
): value is DatabaseMigrationFramework {
  return [
    "sql",
    "prisma",
    "drizzle",
    "knex",
    "sequelize",
    "typeorm",
    "rails",
    "unknown"
  ].includes(value);
}

export function isDatabaseMigrationKind(
  value: string
): value is DatabaseMigrationKind {
  return ["schema", "data", "mixed", "unknown"].includes(value);
}

export function isDatabaseMigrationChangeType(
  value: string
): value is DatabaseMigrationChangeType {
  return ["added", "modified", "deleted"].includes(value);
}

export function isDatabaseMigrationOperationType(
  value: string
): value is DatabaseMigrationOperationType {
  return [
    "create_table",
    "drop_table",
    "alter_table_add_column",
    "alter_table_drop_column",
    "alter_table_rename_column",
    "alter_column_type",
    "set_not_null",
    "drop_not_null",
    "add_constraint",
    "drop_constraint",
    "create_index",
    "drop_index",
    "create_view",
    "drop_view",
    "create_schema",
    "drop_schema",
    "create_type",
    "alter_type",
    "drop_type",
    "create_sequence",
    "drop_sequence",
    "create_function",
    "drop_function",
    "truncate",
    "insert",
    "update",
    "delete",
    "merge",
    "alter_table_other",
    "unknown"
  ].includes(value);
}
