import pg from "pg";
import { env } from "./env.js";
import { normalizeDatabaseConnectionString } from "./database-url.js";

const { Pool } = pg;

export const DATABASE_QUERY_TIMEOUT_MS = 120_000;

export const db = new Pool({
  connectionString: normalizeDatabaseConnectionString(env.DATABASE_URL),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: DATABASE_QUERY_TIMEOUT_MS,
  query_timeout: DATABASE_QUERY_TIMEOUT_MS
});

db.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error);
});

export async function checkDatabaseConnection(): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
