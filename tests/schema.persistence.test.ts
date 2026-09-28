import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const DATABASE_AVAILABLE = Boolean(process.env.DATABASE_URL);

test(
  "schema migration evidence persistence supports replace, append, filters, and upsert",
  { skip: !DATABASE_AVAILABLE },
  async () => {
    const { db } = await import("../src/config/database.js");
    const {
      appendDatabaseMigrationEvolution,
      listDatabaseMigrationEvents,
      replaceDatabaseMigrationEvolution
    } = await import("../src/modules/schema/schema.persistence.js");

    const repositoryId = randomUUID();
    const commitId = randomUUID();
    const secondCommitId = randomUUID();

    const firstSha = "0123456789abcdef0123456789abcdef01234567";
    const secondSha = "fedcba9876543210fedcba9876543210fedcba98";

    const createTableOperation = {
      operationType: "create_table" as const,
      tableName: "users",
      columnName: null,
      previousName: null,
      currentName: null,
      objectName: "users",
      line: 1,
      statementHash: "a".repeat(64),
      concurrent: false
    };

    const dropColumnOperation = {
      operationType: "alter_table_drop_column" as const,
      tableName: "users",
      columnName: "legacy_email",
      previousName: null,
      currentName: null,
      objectName: null,
      line: 4,
      statementHash: "b".repeat(64),
      concurrent: false
    };

    const firstEvent = {
      sha: firstSha,
      path: "db/migrations/001_users.sql",
      changeType: "added" as const,
      framework: "sql" as const,
      analysisStatus: "supported_sql" as const,
      migrationKind: "schema" as const,
      lineCount: 3,
      operationCount: 1,
      schemaOperationCount: 1,
      dataOperationCount: 0,
      contentHash: "c".repeat(64),
      operations: [createTableOperation],
      destructiveSignals: [],
      warnings: []
    };

    const secondEvent = {
      sha: secondSha,
      path: "db/migrations/002_cleanup.sql",
      changeType: "modified" as const,
      framework: "sql" as const,
      analysisStatus: "supported_sql" as const,
      migrationKind: "schema" as const,
      lineCount: 6,
      operationCount: 1,
      schemaOperationCount: 1,
      dataOperationCount: 0,
      contentHash: "d".repeat(64),
      operations: [dropColumnOperation],
      destructiveSignals: ["destructive:drop_column"],
      warnings: [
        "The migration contains destructive or lock-sensitive signals; the signal is evidence, not proof of deployment impact."
      ]
    };

    try {
      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'schema-test')",
        [repositoryId]
      );

      await db.query(
        "INSERT INTO commits (id, repository_id, sha, subject, files_changed) VALUES " +
          "($1, $3, $4, 'feat: create users table', 1), " +
          "($2, $3, $5, 'fix: remove legacy column', 1)",
        [commitId, secondCommitId, repositoryId, firstSha, secondSha]
      );

      await replaceDatabaseMigrationEvolution(repositoryId, [firstEvent]);

      let result = await listDatabaseMigrationEvents(repositoryId, 10);
      assert.equal(result.total, 1);
      assert.equal(result.events[0]?.path, firstEvent.path);
      assert.equal(result.events[0]?.framework, "sql");
      assert.equal(
        result.events[0]?.operations[0]?.operationType,
        "create_table"
      );

      await appendDatabaseMigrationEvolution(repositoryId, [secondEvent]);
      await appendDatabaseMigrationEvolution(repositoryId, [secondEvent]);

      result = await listDatabaseMigrationEvents(repositoryId, 10);
      assert.equal(result.total, 2);

      const dropColumnResult = await listDatabaseMigrationEvents(
        repositoryId,
        10,
        { operationType: "alter_table_drop_column" }
      );

      assert.equal(dropColumnResult.total, 1);
      assert.equal(dropColumnResult.events[0]?.path, secondEvent.path);
      assert.deepEqual(
        dropColumnResult.events[0]?.destructiveSignals,
        ["destructive:drop_column"]
      );

      const replacementResult = await listDatabaseMigrationEvents(
        repositoryId,
        10,
        { migrationKind: "schema", changeType: "added" }
      );

      assert.equal(replacementResult.total, 1);
      assert.equal(replacementResult.events[0]?.path, firstEvent.path);
    } finally {
      await db.query(
        "DELETE FROM repositories WHERE id = $1",
        [repositoryId]
      );
    }
  }
);
