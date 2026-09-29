import { db } from "../../config/database.js";
import type { StoredContributorActivity } from "./contributor-evolution.types.js";

export async function listContributorActivity(
  repositoryId: string,
  limit: number
): Promise<{ contributors: StoredContributorActivity[]; total: number }> {
  const result = await db.query<StoredContributorActivity>(
    `
      WITH contributor_commits AS (
        SELECT
          c.author_name,
          c.author_email,
          COUNT(*)::int AS commit_count,
          COALESCE(SUM(COALESCE(c.additions, 0)), 0)::int AS additions,
          COALESCE(SUM(COALESCE(c.deletions, 0)), 0)::int AS deletions,
          to_char(
            MIN(c.committed_at) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) AS first_committed_at,
          to_char(
            MAX(c.committed_at) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) AS last_committed_at
        FROM commits AS c
        WHERE c.repository_id = $1
        GROUP BY c.author_name, c.author_email
      ),
      contributor_paths AS (
        SELECT
          c.author_name,
          c.author_email,
          COUNT(DISTINCT cf.path)::int AS paths_touched
        FROM commits AS c
        LEFT JOIN commit_files AS cf
          ON cf.commit_id = c.id
        WHERE c.repository_id = $1
        GROUP BY c.author_name, c.author_email
      )
      SELECT
        cc.author_name,
        cc.author_email,
        cc.commit_count,
        cc.additions,
        cc.deletions,
        (cc.additions + cc.deletions)::int AS total_churn,
        COALESCE(cp.paths_touched, 0)::int AS paths_touched,
        cc.first_committed_at,
        cc.last_committed_at,
        COUNT(*) OVER()::int AS total_contributors
      FROM contributor_commits AS cc
      LEFT JOIN contributor_paths AS cp
        ON cp.author_name IS NOT DISTINCT FROM cc.author_name
       AND cp.author_email IS NOT DISTINCT FROM cc.author_email
      ORDER BY
        cc.commit_count DESC,
        (cc.additions + cc.deletions) DESC,
        cc.additions DESC,
        cc.deletions DESC,
        cc.author_name ASC NULLS LAST,
        cc.author_email ASC NULLS LAST
      LIMIT $2
    `,
    [repositoryId, limit]
  );

  return {
    contributors: result.rows,
    total: result.rows[0]?.total_contributors ?? 0
  };
}
