export type DatabaseMigrationFramework =
  | "sql"
  | "prisma"
  | "drizzle"
  | "knex"
  | "sequelize"
  | "typeorm"
  | "rails"
  | "unknown";

export type DatabaseMigrationChangeType =
  | "added"
  | "modified"
  | "deleted";

export type DatabaseMigrationAnalysisStatus =
  | "supported_sql"
  | "unsupported_code"
  | "deleted"
  | "read_error";

export type DatabaseMigrationKind =
  | "schema"
  | "data"
  | "mixed"
  | "unknown";

export type DatabaseMigrationOperationType =
  | "create_table"
  | "drop_table"
  | "alter_table_add_column"
  | "alter_table_drop_column"
  | "alter_table_rename_column"
  | "alter_column_type"
  | "set_not_null"
  | "drop_not_null"
  | "add_constraint"
  | "drop_constraint"
  | "create_index"
  | "drop_index"
  | "create_view"
  | "drop_view"
  | "create_schema"
  | "drop_schema"
  | "create_type"
  | "alter_type"
  | "drop_type"
  | "create_sequence"
  | "drop_sequence"
  | "create_function"
  | "drop_function"
  | "truncate"
  | "insert"
  | "update"
  | "delete"
  | "merge"
  | "alter_table_other"
  | "unknown";

export interface DatabaseMigrationOperation {
  operationType: DatabaseMigrationOperationType;
  tableName: string | null;
  columnName: string | null;
  previousName: string | null;
  currentName: string | null;
  objectName: string | null;
  line: number;
  statementHash: string;
  concurrent: boolean;
}

export interface DatabaseMigrationEvent {
  sha: string;
  path: string;
  changeType: DatabaseMigrationChangeType;
  framework: DatabaseMigrationFramework;
  analysisStatus: DatabaseMigrationAnalysisStatus;
  migrationKind: DatabaseMigrationKind;
  lineCount: number;
  operationCount: number;
  schemaOperationCount: number;
  dataOperationCount: number;
  contentHash: string | null;
  operations: DatabaseMigrationOperation[];
  destructiveSignals: string[];
  warnings: string[];
}

export interface DatabaseMigrationFilters {
  framework?: DatabaseMigrationFramework;
  changeType?: DatabaseMigrationChangeType;
  migrationKind?: DatabaseMigrationKind;
  operationType?: DatabaseMigrationOperationType;
}

export interface StoredDatabaseMigrationEvent
  extends DatabaseMigrationEvent {
  id: string;
  repositoryId: string;
  subject: string;
  committedAt: string | null;
}
