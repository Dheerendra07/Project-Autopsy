import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import test from "node:test";

import {
  classifyDatabaseMigrationSource,
  classifySqlStatement,
  detectDatabaseMigrationFramework,
  discoverDatabaseMigrationEvolution,
  isDatabaseMigrationPath,
  splitSqlStatements
} from "../src/modules/schema/schema.discovery.js";

test("identifies common migration paths and frameworks", () => {
  assert.equal(isDatabaseMigrationPath("db/migrations/001_create_users.sql"), true);
  assert.equal(
    isDatabaseMigrationPath(
      "prisma/migrations/202609290001_init/migration.sql"
    ),
    true
  );
  assert.equal(isDatabaseMigrationPath("src/db/migrations/001_create_users.ts"), true);
  assert.equal(isDatabaseMigrationPath("src/models/user.ts"), false);

  assert.equal(
    detectDatabaseMigrationFramework(
      "prisma/migrations/202609290001_init/migration.sql"
    ),
    "prisma"
  );
  assert.equal(
    detectDatabaseMigrationFramework("db/migrations/001_create_users.sql"),
    "sql"
  );
  assert.equal(
    detectDatabaseMigrationFramework(
      "db/migrate/202609290001_create_users.rb",
      "class CreateUsers < ActiveRecord::Migration[8.0]\nend"
    ),
    "rails"
  );
});

test("splits SQL without breaking semicolons in strings, comments, or dollar-quoted bodies", () => {
  const statements = splitSqlStatements(
    [
      "-- comment with ;",
      "CREATE TABLE users (",
      "  name TEXT DEFAULT 'semi;colon'",
      ");",
      "",
      "/* block comment ; */",
      "CREATE FUNCTION ping() RETURNS void AS $$",
      "BEGIN",
      "  PERFORM 1;",
      "  RAISE NOTICE 'inside;body';",
      "END",
      "$$ LANGUAGE plpgsql;",
      "",
      "INSERT INTO users(name) VALUES ('after;function');"
    ].join("\n")
  );

  assert.equal(statements.length, 3);
  assert.equal(statements[0]?.line, 2);
  assert.match(statements[0]?.text ?? "", /^CREATE TABLE users/i);
  assert.match(statements[1]?.text ?? "", /^CREATE FUNCTION ping/i);
  assert.match(statements[2]?.text ?? "", /^INSERT INTO users/i);
});

test("classifies PostgreSQL ALTER TABLE ONLY syntax", () => {
  const operations = [
    classifySqlStatement({
      text: "ALTER TABLE ONLY public.users ADD COLUMN email TEXT",
      line: 1
    }),
    classifySqlStatement({
      text: "ALTER TABLE IF EXISTS ONLY public.users DROP COLUMN legacy_email",
      line: 2
    }),
    classifySqlStatement({
      text: "ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_key UNIQUE (email)",
      line: 3
    }),
    classifySqlStatement({
      text: "ALTER TABLE ONLY public.users DROP CONSTRAINT users_email_key",
      line: 4
    })
  ];

  assert.deepEqual(
    operations.map((operation) => operation.operationType),
    [
      "alter_table_add_column",
      "alter_table_drop_column",
      "add_constraint",
      "drop_constraint"
    ]
  );

  assert.equal(operations[0]?.tableName, "public.users");
  assert.equal(operations[1]?.tableName, "public.users");
  assert.equal(operations[2]?.tableName, "public.users");
  assert.equal(operations[3]?.tableName, "public.users");
});

test("classifies lowercase SQL statements case-insensitively", () => {
  const statements = [
    "create table users (id bigint primary key);",
    "alter table users add column email text;",
    "alter table users rename column email to email_address;",
    "alter table users alter column email_address type varchar(320);",
    "alter table users alter column email_address set not null;",
    "alter table users add constraint users_email_key unique (email_address);",
    "create unique index concurrently idx_users_email on users(email_address);",
    "drop index concurrently idx_users_email;",
    "insert into users(id) values (1);",
    "update users set email_address = 'a@example.com';",
    "delete from users where id = 1;"
  ].join("\n");

  const event = classifyDatabaseMigrationSource(
    "db/migrations/001_users.sql",
    statements,
    "0123456789abcdef0123456789abcdef01234567",
    "added"
  );

  assert.equal(event.analysisStatus, "supported_sql");
  assert.equal(event.operationCount, 11);
  assert.equal(event.schemaOperationCount, 8);
  assert.equal(event.dataOperationCount, 3);
  assert.equal(event.operations[0]?.operationType, "create_table");
  assert.equal(event.operations[1]?.operationType, "alter_table_add_column");
  assert.equal(event.operations[2]?.operationType, "alter_table_rename_column");
  assert.equal(event.operations[8]?.operationType, "insert");
  assert.equal(event.operations[9]?.operationType, "update");
  assert.equal(event.operations[10]?.operationType, "delete");
});

test("classifies representative PostgreSQL schema and data operations", () => {
  const sql = [
    "CREATE TABLE users (id BIGINT PRIMARY KEY);",
    "ALTER TABLE users ADD COLUMN email TEXT;",
    "ALTER TABLE users RENAME COLUMN email TO email_address;",
    "ALTER TABLE users ALTER COLUMN email_address TYPE VARCHAR(320);",
    "ALTER TABLE users ALTER COLUMN email_address SET NOT NULL;",
    "ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email_address);",
    "CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users(email_address);",
    "DROP INDEX CONCURRENTLY idx_users_email;",
    "INSERT INTO users(id) VALUES (1);",
    "UPDATE users SET email_address = 'a@example.com';",
    "DELETE FROM users WHERE id = 1;"
  ].join("\n");

  const event = classifyDatabaseMigrationSource(
    "db/migrations/001_users.sql",
    sql,
    "0123456789abcdef0123456789abcdef01234567",
    "added"
  );

  assert.equal(event.analysisStatus, "supported_sql");
  assert.equal(event.migrationKind, "mixed");
  assert.equal(event.operationCount, 11);
  assert.equal(event.schemaOperationCount, 8);
  assert.equal(event.dataOperationCount, 3);
  assert.ok(
    event.operations.some(
      (item) => item.operationType === "alter_table_rename_column"
    )
  );
  assert.ok(
    event.operations.some(
      (item) =>
        item.operationType === "create_index" && item.concurrent === true
    )
  );
  assert.ok(
    event.operations.some(
      (item) =>
        item.operationType === "drop_index" && item.concurrent === true
    )
  );
  assert.ok(
    event.warnings.some((warning) => warning.includes("both schema and data"))
  );
  assert.ok(
    event.warnings.some((warning) => warning.includes("type changes"))
  );
});

test("marks destructive SQL explicitly without claiming deployment impact", () => {
  const statement = classifySqlStatement({
    text: "DROP TABLE users",
    line: 10
  });

  assert.equal(statement.operationType, "drop_table");

  const event = classifyDatabaseMigrationSource(
    "db/migrations/002_drop_users.sql",
    "DROP TABLE users;",
    "abcdef1234567890",
    "added"
  );

  assert.deepEqual(event.destructiveSignals, ["destructive:drop_table"]);
  assert.ok(
    event.warnings.some((warning) => warning.includes("evidence, not proof"))
  );
});

test("records code-based migrations without fabricating SQL operations", () => {
  const event = classifyDatabaseMigrationSource(
    "src/db/migrations/003_add_index.ts",
    "export async function up(db) { await db.schema.createIndex('users'); }",
    "abcdef1234567890",
    "added"
  );

  assert.equal(event.analysisStatus, "unsupported_code");
  assert.equal(event.migrationKind, "unknown");
  assert.equal(event.operationCount, 0);
  assert.equal(event.operations.length, 0);
  assert.equal(event.framework, "unknown");
});

test("discovers historical migration evidence across add, modify, and delete commits", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "project-autopsy-schema-")
  );
  const git = simpleGit(directory);

  try {
    await git.init();
    await git.addConfig("user.name", "Autopsy Test");
    await git.addConfig("user.email", "autopsy@test.invalid");

    await mkdir(path.join(directory, "db", "migrations"), {
      recursive: true
    });

    const migrationPath = path.join(
      directory,
      "db",
      "migrations",
      "001_users.sql"
    );

    await writeFile(
      migrationPath,
      "CREATE TABLE users (id BIGINT PRIMARY KEY);\n",
      "utf8"
    );

    await git.add(".");
    const firstCommit = await git.commit("feat: add users table");

    await writeFile(
      migrationPath,
      [
        "CREATE TABLE users (id BIGINT PRIMARY KEY);",
        "ALTER TABLE users ADD COLUMN email TEXT;",
        "INSERT INTO users(id) VALUES (1);"
      ].join("\n"),
      "utf8"
    );

    await git.add(".");
    const secondCommit = await git.commit("feat: evolve users schema");

    await git.rm(migrationPath);
    const thirdCommit = await git.commit("chore: remove obsolete migration");

    const { discoverCommits } = await import(
      "../src/modules/commits/commit.discovery.js"
    );

    const commits = await discoverCommits(directory);
    const events = await discoverDatabaseMigrationEvolution(
      directory,
      commits
    );

    assert.equal(events.length, 3);
    assert.equal(events[0]?.sha, firstCommit.commit);
    assert.equal(events[0]?.changeType, "added");
    assert.equal(events[0]?.operationCount, 1);

    assert.equal(events[1]?.sha, secondCommit.commit);
    assert.equal(events[1]?.changeType, "modified");
    assert.equal(events[1]?.migrationKind, "mixed");
    assert.equal(events[1]?.dataOperationCount, 1);

    assert.equal(events[2]?.sha, thirdCommit.commit);
    assert.equal(events[2]?.changeType, "deleted");
    assert.equal(events[2]?.analysisStatus, "deleted");
    assert.equal(events[2]?.operationCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
