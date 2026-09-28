import { db } from "../../config/database.js";

export interface StoredRepeatedlyModifiedFile {
  path: string;
  commits_touched: number;
  additions: number;
  deletions: number;
  binary_changes: number;
  total_churn: number;
  first_changed_at: string | null;
  last_changed_at: string | null;
  change_span_days: number;
}

export async function listRepeatedlyModifiedFiles(
  repositoryId: string,
  minTouches: number,
  limit: number
): Promise<StoredRepeatedlyModifiedFile[]> {
  const result = await db.query<StoredRepeatedlyModifiedFile>(
    `
      SELECT
        metrics.path,
        metrics.commits_touched,
        metrics.additions,
        metrics.deletions,
        metrics.binary_changes,
        metrics.total_churn,
        MIN(commits.committed_at) AS first_changed_at,
        MAX(commits.committed_at) AS last_changed_at,
        GREATEST(
          FLOOR(
            EXTRACT(
              EPOCH FROM (
                MAX(commits.committed_at) -
                MIN(commits.committed_at)
              )
            ) / 86400
          ),
          0
        )::int AS change_span_days
      FROM file_change_metrics AS metrics
      INNER JOIN commit_files AS files
        ON files.path = metrics.path
      INNER JOIN commits
        ON commits.id = files.commit_id
       AND commits.repository_id = metrics.repository_id
      WHERE metrics.repository_id = $1
        AND metrics.commits_touched >= $2
      GROUP BY
        metrics.path,
        metrics.commits_touched,
        metrics.additions,
        metrics.deletions,
        metrics.binary_changes,
        metrics.total_churn
      ORDER BY
        metrics.commits_touched DESC,
        metrics.total_churn DESC,
        change_span_days DESC,
        metrics.path ASC
      LIMIT $3
    `,
    [repositoryId, minTouches, limit]
  );

  return result.rows;
}
