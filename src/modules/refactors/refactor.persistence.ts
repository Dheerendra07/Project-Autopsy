import { db } from "../../config/database.js";

export interface StoredRefactorSignal {
  sha: string;
  committed_at: string | null;
  subject: string;
  files_changed: number;
}

export async function listRefactorSignals(
  repositoryId: string,
  limit: number
): Promise<StoredRefactorSignal[]> {
  const result = await db.query<StoredRefactorSignal>(
    "SELECT " +
      "sha, committed_at, subject, files_changed " +
      "FROM commits " +
      "WHERE repository_id = $1 " +
      "AND subject ~* $2 " +
      "ORDER BY files_changed DESC, committed_at ASC NULLS LAST, sha ASC " +
      "LIMIT $3",
    [
      repositoryId,
      "\\b(refactor|rewrite|restructure|reorganize|reorganise|clean[[:space:]-]*up|extract|split|move|rename)\\b",
      limit
    ]
  );

  return result.rows;
}
