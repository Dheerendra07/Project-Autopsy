import { createHash } from "node:crypto";
import path from "node:path";
import { simpleGit } from "simple-git";
import { createAnalysisGit } from "../analysis/analysis-git.js";

import type { DiscoveredCommit } from "../commits/commit.discovery.js";
import type {
  DatabaseMigrationAnalysisStatus,
  DatabaseMigrationChangeType,
  DatabaseMigrationEvent,
  DatabaseMigrationFramework,
  DatabaseMigrationKind,
  DatabaseMigrationOperation,
  DatabaseMigrationOperationType
} from "./schema.types.js";

const SQL_EXTENSIONS = new Set([".sql"]);
const CODE_MIGRATION_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".rb"
]);

const MIGRATION_DIRECTORY_NAMES = new Set([
  "migrations",
  "migration",
  "migrate"
]);

const IDENTIFIER =
  '(?:"[^"]+"|\\x60[^\\x60]+\\x60|\\[[^\\]]+\\]|[A-Za-z_][A-Za-z0-9_$]*(?:\\.(?:"[^"]+"|\\x60[^\\x60]+\\x60|\\[[^\\]]+\\]|[A-Za-z_][A-Za-z0-9_$]*))?)';

const SCHEMA_OPERATION_TYPES = new Set<DatabaseMigrationOperationType>([
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
  "alter_table_other"
]);

const DATA_OPERATION_TYPES = new Set<DatabaseMigrationOperationType>([
  "truncate",
  "insert",
  "update",
  "delete",
  "merge"
]);

const DESTRUCTIVE_SIGNAL_BY_OPERATION: Partial<
  Record<DatabaseMigrationOperationType, string>
> = {
  drop_table: "destructive:drop_table",
  alter_table_drop_column: "destructive:drop_column",
  drop_schema: "destructive:drop_schema",
  drop_type: "destructive:drop_type",
  drop_view: "destructive:drop_view",
  drop_function: "destructive:drop_function",
  drop_index: "destructive:drop_index",
  truncate: "destructive:truncate",
  alter_column_type: "rewrite_possible:alter_column_type"
};

export interface SqlStatement {
  text: string;
  line: number;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function normalizedSegments(filePath: string): string[] {
  return normalizePath(filePath)
    .toLowerCase()
    .split("/")
    .filter(Boolean);
}

export function isDatabaseMigrationPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const segments = normalizedSegments(normalized);
  const extension = path.extname(normalized).toLowerCase();

  if (
    !SQL_EXTENSIONS.has(extension) &&
    !CODE_MIGRATION_EXTENSIONS.has(extension)
  ) {
    return false;
  }

  if (
    segments.includes("prisma") ||
    segments.includes("sequelize") ||
    segments.includes("typeorm") ||
    segments.includes("knex") ||
    segments.includes("drizzle")
  ) {
    return segments.some((segment) =>
      MIGRATION_DIRECTORY_NAMES.has(segment)
    );
  }

  return segments.some((segment) =>
    MIGRATION_DIRECTORY_NAMES.has(segment)
  );
}

export function detectDatabaseMigrationFramework(
  filePath: string,
  source = ""
): DatabaseMigrationFramework {
  const normalized = normalizePath(filePath).toLowerCase();
  const segments = normalized.split("/");

  if (segments.includes("prisma")) return "prisma";
  if (segments.includes("drizzle")) return "drizzle";
  if (segments.includes("sequelize")) return "sequelize";
  if (segments.includes("typeorm")) return "typeorm";
  if (segments.includes("knex")) return "knex";

  if (
    segments.includes("db") &&
    segments.some((segment) => segment === "migrate")
  ) {
    return "rails";
  }

  if (/queryinterface\s*\./i.test(source)) return "sequelize";
  if (/knex(?:\.|\s*\()|knex\.schema/i.test(source)) return "knex";
  if (/queryrunner\s*\./i.test(source)) return "typeorm";

  if (path.extname(normalized).toLowerCase() === ".sql") {
    return "sql";
  }

  return "unknown";
}

function appendCommentSpace(
  buffer: string[],
  character: string,
  lineRef: { value: number }
): void {
  buffer.push(character === "\n" ? "\n" : " ");

  if (character === "\n") {
    lineRef.value += 1;
  }
}

export function splitSqlStatements(source: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const buffer: string[] = [];
  const lineRef = { value: 1 };
  let statementStartLine = 1;
  let statementHasContent = false;
  let state:
    | "normal"
    | "single"
    | "double"
    | "line_comment"
    | "block_comment"
    | "dollar" = "normal";
  let dollarDelimiter = "";

  const markContent = (): void => {
    if (!statementHasContent) {
      statementStartLine = lineRef.value;
      statementHasContent = true;
    }
  };

  const pushStatement = (): void => {
    const text = buffer.join("").trim();

    if (text) {
      statements.push({
        text,
        line: statementStartLine
      });
    }

    buffer.length = 0;
    statementHasContent = false;
    statementStartLine = lineRef.value;
  };

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "line_comment") {
      appendCommentSpace(buffer, current, lineRef);

      if (current === "\n") {
        state = "normal";
      }

      continue;
    }

    if (state === "block_comment") {
      if (current === "*" && next === "/") {
        appendCommentSpace(buffer, current, lineRef);
        appendCommentSpace(buffer, next, lineRef);
        index += 1;
        state = "normal";
      } else {
        appendCommentSpace(buffer, current, lineRef);
      }

      continue;
    }

    if (state === "single") {
      buffer.push(current);

      if (current === "\n") {
        lineRef.value += 1;
      }

      if (current === "\\" && next) {
        buffer.push(next);
        index += 1;
        continue;
      }

      if (current === "'" && next === "'") {
        buffer.push(next);
        index += 1;
        continue;
      }

      if (current === "'") {
        state = "normal";
      }

      continue;
    }

    if (state === "double") {
      buffer.push(current);

      if (current === "\n") {
        lineRef.value += 1;
      }

      if (current === "\\" && next) {
        buffer.push(next);
        index += 1;
        continue;
      }

      if (current === '"' && next === '"') {
        buffer.push(next);
        index += 1;
        continue;
      }

      if (current === '"') {
        state = "normal";
      }

      continue;
    }

    if (state === "dollar") {
      if (
        dollarDelimiter &&
        source.startsWith(dollarDelimiter, index)
      ) {
        buffer.push(dollarDelimiter);
        index += dollarDelimiter.length - 1;
        state = "normal";
        continue;
      }

      buffer.push(current);

      if (current === "\n") {
        lineRef.value += 1;
      }

      continue;
    }

    if (current === "-" && next === "-") {
      appendCommentSpace(buffer, current, lineRef);
      appendCommentSpace(buffer, next, lineRef);
      index += 1;
      state = "line_comment";
      continue;
    }

    if (current === "/" && next === "*") {
      appendCommentSpace(buffer, current, lineRef);
      appendCommentSpace(buffer, next, lineRef);
      index += 1;
      state = "block_comment";
      continue;
    }

    if (current === "'") {
      markContent();
      buffer.push(current);
      state = "single";
      continue;
    }

    if (current === '"') {
      markContent();
      buffer.push(current);
      state = "double";
      continue;
    }

    if (current === "$") {
      const match = source
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|)\$/);

      if (match?.[0]) {
        markContent();
        dollarDelimiter = match[0];
        buffer.push(dollarDelimiter);
        index += dollarDelimiter.length - 1;
        state = "dollar";
        continue;
      }
    }

    if (current === ";") {
      pushStatement();
      continue;
    }

    if (!/\s/.test(current)) {
      markContent();
    }

    buffer.push(current);

    if (current === "\n") {
      lineRef.value += 1;
    }
  }

  pushStatement();
  return statements;
}
function cleanStatement(statement: string): string {
  return statement.replace(/\s+/g, " ").trim();
}

function identifier(value: string): string {
  return value
    .split(".")
    .map((part) =>
      part.replace(/^[\"\x60\[]|[\"\x60\]]$/g, "")
    )
    .join(".");
}

function hashStatement(statement: string): string {
  return createHash("sha256")
    .update(statement.trim(), "utf8")
    .digest("hex");
}

function operation(
  statement: SqlStatement,
  operationType: DatabaseMigrationOperationType,
  values: Partial<DatabaseMigrationOperation> = {}
): DatabaseMigrationOperation {
  return {
    operationType,
    tableName: values.tableName ?? null,
    columnName: values.columnName ?? null,
    previousName: values.previousName ?? null,
    currentName: values.currentName ?? null,
    objectName: values.objectName ?? null,
    line: statement.line,
    statementHash: hashStatement(statement.text),
    concurrent: values.concurrent ?? false
  };
}

function matchIdentifier(
  statement: string,
  expression: RegExp
): string | null {
  const match = statement.match(expression);
  const value = match?.[1];

  return value ? identifier(value) : null;
}

export function classifySqlStatement(
  statement: SqlStatement
): DatabaseMigrationOperation {
  const cleaned = cleanStatement(statement.text);

  let match = cleaned.match(
    new RegExp(
      "^CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i"),
  );

  if (match?.[1]) {
    return operation(statement, "create_table", {
      objectName: identifier(match[1]),
      tableName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "drop_table", {
      objectName: identifier(match[1]),
      tableName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+ADD\\s+(?!CONSTRAINT\\b)(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "alter_table_add_column", {
      tableName: identifier(match[1]),
      columnName: identifier(match[2])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "alter_table_drop_column", {
      tableName: identifier(match[1]),
      columnName: identifier(match[2])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+RENAME\\s+COLUMN\\s+(" +
        IDENTIFIER +
        ")\\s+TO\\s+(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1] && match?.[2] && match?.[3]) {
    return operation(statement, "alter_table_rename_column", {
      tableName: identifier(match[1]),
      previousName: identifier(match[2]),
      currentName: identifier(match[3])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+ALTER\\s+COLUMN\\s+(" +
        IDENTIFIER +
        ")\\s+TYPE\\s+(.+)$",
      "i"
    )
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "alter_column_type", {
      tableName: identifier(match[1]),
      columnName: identifier(match[2]),
      currentName: cleanStatement(match[3] ?? "")
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+ALTER\\s+COLUMN\\s+(" +
        IDENTIFIER +
        ")\\s+SET\\s+NOT\\s+NULL"
    , "i")
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "set_not_null", {
      tableName: identifier(match[1]),
      columnName: identifier(match[2])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+ALTER\\s+COLUMN\\s+(" +
        IDENTIFIER +
        ")\\s+DROP\\s+NOT\\s+NULL"
    , "i")
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "drop_not_null", {
      tableName: identifier(match[1]),
      columnName: identifier(match[2])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+ADD\\s+CONSTRAINT\\s+(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "add_constraint", {
      tableName: identifier(match[1]),
      objectName: identifier(match[2])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
        IDENTIFIER +
        ")\\s+DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "drop_constraint", {
      tableName: identifier(match[1]),
      objectName: identifier(match[2])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:(?:CONCURRENTLY)\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")\\s+ON\\s+(" +
        IDENTIFIER +
        ")",
      "i"
    )
  );

  if (match?.[1] && match?.[2]) {
    return operation(statement, "create_index", {
      objectName: identifier(match[1]),
      tableName: identifier(match[2]),
      concurrent: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(
        cleaned
      )
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+INDEX\\s+(?:(?:CONCURRENTLY)\\s+)?(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")",
      "i"
    )
  );

  if (match?.[1]) {
    return operation(statement, "drop_index", {
      objectName: identifier(match[1]),
      concurrent: /DROP\s+INDEX\s+CONCURRENTLY\b/i.test(cleaned)
    });
  }

  match = cleaned.match(
    new RegExp(
      "^CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "create_view", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+VIEW\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "drop_view", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^CREATE\\s+SCHEMA\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "create_schema", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+SCHEMA\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "drop_schema", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^CREATE\\s+(?:OR\\s+REPLACE\\s+)?TYPE\\s+(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "create_type", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^ALTER\\s+TYPE\\s+(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "alter_type", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+TYPE\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "drop_type", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "create_function", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "drop_function", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?SEQUENCE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "create_sequence", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp(
      "^DROP\\s+SEQUENCE\\s+(?:IF\\s+EXISTS\\s+)?(" +
        IDENTIFIER +
        ")"
    , "i")
  );

  if (match?.[1]) {
    return operation(statement, "drop_sequence", {
      objectName: identifier(match[1])
    });
  }

  match = cleaned.match(/^TRUNCATE\\s+(?:TABLE\\s+)?(.+)$/i);
  if (match?.[1]) {
    return operation(statement, "truncate", {
      objectName: cleanStatement(match[1])
    });
  }

  match = cleaned.match(
    new RegExp("^INSERT\\s+INTO\\s+(" + IDENTIFIER + ")", "i")
  );
  if (match?.[1]) {
    return operation(statement, "insert", {
      tableName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp("^UPDATE\\s+(" + IDENTIFIER + ")\\s+SET", "i")
  );
  if (match?.[1]) {
    return operation(statement, "update", {
      tableName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp("^DELETE\\s+FROM\\s+(" + IDENTIFIER + ")", "i")
  );
  if (match?.[1]) {
    return operation(statement, "delete", {
      tableName: identifier(match[1])
    });
  }

  match = cleaned.match(
    new RegExp("^MERGE\\s+INTO\\s+(" + IDENTIFIER + ")", "i")
  );
  if (match?.[1]) {
    return operation(statement, "merge", {
      tableName: identifier(match[1])
    });
  }

  if (/^ALTER\\s+TABLE\\b/i.test(cleaned)) {
    const tableName = matchIdentifier(
      cleaned,
      new RegExp(
        "^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(" +
          IDENTIFIER +
          ")",
        "i"
      )
    );

    return operation(statement, "alter_table_other", {
      tableName
    });
  }

  return operation(statement, "unknown");
}

export function classifyDatabaseMigrationSource(
  filePath: string,
  source: string,
  sha: string,
  changeType: DatabaseMigrationChangeType
): DatabaseMigrationEvent {
  const framework = detectDatabaseMigrationFramework(filePath, source);
  const extension = path.extname(filePath).toLowerCase();
  const contentHash = createHash("sha256")
    .update(source, "utf8")
    .digest("hex");
  const lineCount =
    source.length === 0
      ? 0
      : source.split(/\r\n|\r|\n/).length;

  if (changeType === "deleted") {
    return {
      sha,
      path: filePath,
      changeType,
      framework,
      analysisStatus: "deleted",
      migrationKind: "unknown",
      lineCount,
      operationCount: 0,
      schemaOperationCount: 0,
      dataOperationCount: 0,
      contentHash,
      operations: [],
      destructiveSignals: [],
      warnings: ["Migration file was deleted; no new-schema content is available."]
    };
  }

  if (!SQL_EXTENSIONS.has(extension)) {
    return {
      sha,
      path: filePath,
      changeType,
      framework,
      analysisStatus: "unsupported_code",
      migrationKind: "unknown",
      lineCount,
      operationCount: 0,
      schemaOperationCount: 0,
      dataOperationCount: 0,
      contentHash,
      operations: [],
      destructiveSignals: [],
      warnings: [
        "Migration source is code-based; v1 records the file as evidence but does not infer database operations."
      ]
    };
  }

  const statements = splitSqlStatements(source);
  const operations = statements.map((statement) =>
    classifySqlStatement(statement)
  );
  const schemaOperationCount = operations.filter((item) =>
    SCHEMA_OPERATION_TYPES.has(item.operationType)
  ).length;
  const dataOperationCount = operations.filter((item) =>
    DATA_OPERATION_TYPES.has(item.operationType)
  ).length;
  const unknownOperationCount = operations.filter(
    (item) => item.operationType === "unknown"
  ).length;

  const migrationKind: DatabaseMigrationKind =
    schemaOperationCount > 0 && dataOperationCount > 0
      ? "mixed"
      : schemaOperationCount > 0
        ? "schema"
        : dataOperationCount > 0
          ? "data"
          : "unknown";

  const destructiveSignals = [
    ...new Set(
      operations
        .map((item) => DESTRUCTIVE_SIGNAL_BY_OPERATION[item.operationType])
        .filter((value): value is string => Boolean(value))
    )
  ];

  if (
    operations.some(
      (item) =>
        item.operationType === "alter_table_other" ||
        item.operationType === "create_index" ||
        item.operationType === "drop_index"
    )
  ) {
    for (const item of operations) {
      if (
        item.operationType === "alter_table_other" ||
        (item.operationType === "create_index" && !item.concurrent) ||
        (item.operationType === "drop_index" && !item.concurrent)
      ) {
        destructiveSignals.push("potential_lock:ddl_operation");
        break;
      }
    }
  }

  const warnings: string[] = [];

  if (unknownOperationCount > 0) {
    warnings.push(
      "One or more SQL statements could not be classified deterministically."
    );
  }

  if (migrationKind === "mixed") {
    warnings.push(
      "The migration contains both schema and data operations."
    );
  }

  if (operations.some((item) => item.operationType === "alter_column_type")) {
    warnings.push(
      "Column type changes can require rewrites, locks, or compatibility planning depending on the database engine and data volume."
    );
  }

  if (destructiveSignals.length > 0) {
    warnings.push(
      "The migration contains destructive or lock-sensitive signals; the signal is evidence, not proof of deployment impact."
    );
  }

  return {
    sha,
    path: filePath,
    changeType,
    framework,
    analysisStatus: "supported_sql",
    migrationKind,
    lineCount,
    operationCount: operations.length,
    schemaOperationCount,
    dataOperationCount,
    contentHash,
    operations,
    destructiveSignals: [...new Set(destructiveSignals)].sort(),
    warnings
  };
}

async function readMigrationAtCommit(
  git: ReturnType<typeof simpleGit>,
  sha: string,
  filePath: string
): Promise<string | null> {
  try {
    return await git.show([sha + ":" + filePath]);
  } catch {
    return null;
  }
}

export async function discoverDatabaseMigrationEvolution(
  repositoryPath: string,
  commits: DiscoveredCommit[]
): Promise<DatabaseMigrationEvent[]> {
  const git = createAnalysisGit(repositoryPath);
  const events: DatabaseMigrationEvent[] = [];

  for (const commit of commits) {
    for (const file of commit.files) {
      if (!isDatabaseMigrationPath(file.path)) {
        continue;
      }

      const changeType: DatabaseMigrationChangeType =
        file.status === "D" ? "deleted" : file.status === "A" ? "added" : "modified";

      let source: string | null = await readMigrationAtCommit(
        git,
        commit.sha,
        file.path
      );

      if (changeType === "deleted" && commit.parentShas[0]) {
        source = await readMigrationAtCommit(
          git,
          commit.parentShas[0],
          file.path
        );
      }

      if (source === null) {
        events.push({
          sha: commit.sha,
          path: file.path,
          changeType,
          framework: detectDatabaseMigrationFramework(file.path),
          analysisStatus: "read_error",
          migrationKind: "unknown",
          lineCount: 0,
          operationCount: 0,
          schemaOperationCount: 0,
          dataOperationCount: 0,
          contentHash: null,
          operations: [],
          destructiveSignals: [],
          warnings: [
            "Migration content could not be read from the recorded Git object."
          ]
        });
        continue;
      }

      events.push(
        classifyDatabaseMigrationSource(
          file.path,
          source,
          commit.sha,
          changeType
        )
      );
    }
  }

  return events;
}
