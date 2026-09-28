declare module "pg" {
  export interface QueryResult<Row = unknown> {
    rows: Row[];
    rowCount: number | null;
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    [key: string]: unknown;
  }

  export class PoolClient {
    query<Row = unknown>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<Row>>;

    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);

    connect(): Promise<PoolClient>;

    query<Row = unknown>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<Row>>;

    on(
      event: "error",
      listener: (error: Error) => void
    ): this;

    end(): Promise<void>;
  }

  const pg: {
    Pool: typeof Pool;
  };

  export default pg;
}
