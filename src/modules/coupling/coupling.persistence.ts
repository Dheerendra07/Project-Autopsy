import { db } from "../../config/database.js";

export interface StoredFileCoupling {
  path_a: string;
  path_b: string;
  co_change_count: number;
}

export async function rebuildFileChangeCoupling(
  repositoryId: string
): Promise<number> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM file_change_coupling WHERE repository_id = $1",
      [repositoryId]
    );

    const result = await client.query<StoredFileCoupling>(
      "INSERT INTO file_change_coupling (repository_id, path_a, path_b, co_change_count) " +
        "SELECT c.repository_id, a.path, b.path, COUNT(*)::int " +
        "FROM commits c " +
        "INNER JOIN commit_files a ON a.commit_id = c.id " +
        "INNER JOIN commit_files b ON b.commit_id = c.id AND a.path < b.path " +
        "WHERE c.repository_id = $1 " +
        "GROUP BY c.repository_id, a.path, b.path",
      [repositoryId]
    );

    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listFileChangeCoupling(
  repositoryId: string,
  minCoChanges: number,
  limit: number
): Promise<StoredFileCoupling[]> {
  const result = await db.query<StoredFileCoupling>(
    "SELECT path_a, path_b, co_change_count " +
      "FROM file_change_coupling " +
      "WHERE repository_id = $1 AND co_change_count >= $2 " +
      "ORDER BY co_change_count DESC, path_a ASC, path_b ASC " +
      "LIMIT $3",
    [repositoryId, minCoChanges, limit]
  );

  return result.rows;
}
