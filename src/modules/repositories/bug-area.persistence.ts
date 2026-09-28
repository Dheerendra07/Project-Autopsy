import { db } from "../../config/database.js";
import { BUG_SIGNAL_PATTERN } from "../metrics/bug-signals.js";

export interface StoredBugArea {
  path: string;
  signal_commits: number;
  total_commits_touched: number;
  signal_ratio: number;
  total_churn: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
}

export async function listRepeatedBugAreas(
  repositoryId: string,
  limit: number
): Promise<StoredBugArea[]> {
  const result = await db.query<StoredBugArea>(
    `
      SELECT
        files.path,
        COUNT(*) FILTER (
          WHERE commits.subject ~* $2
        )::int AS signal_commits,
        COUNT(*)::int AS total_commits_touched,
        (
          COUNT(*) FILTER (
            WHERE commits.subject ~* $2
          )::float8 / NULLIF(COUNT(*), 0)
        ) AS signal_ratio,
        COALESCE(metrics.total_churn, 0)::int AS total_churn,
        MIN(commits.committed_at) FILTER (
          WHERE commits.subject ~* $2
        ) AS first_signal_at,
        MAX(commits.committed_at) FILTER (
          WHERE commits.subject ~* $2
        ) AS last_signal_at
      FROM commit_files AS files
      INNER JOIN commits
        ON commits.id = files.commit_id
       AND commits.repository_id = $1
      LEFT JOIN file_change_metrics AS metrics
        ON metrics.repository_id = commits.repository_id
       AND metrics.path = files.path
      GROUP BY
        files.path,
        metrics.total_churn
      HAVING COUNT(*) FILTER (
        WHERE commits.subject ~* $2
      ) >= 2
      ORDER BY
        signal_commits DESC,
        total_churn DESC,
        files.path ASC
      LIMIT $3
    `,
    [repositoryId, BUG_SIGNAL_PATTERN, limit]
  );

  return result.rows;
}
