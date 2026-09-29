import { listContributorActivity } from "./contributor-evolution.persistence.js";
import type {
  ContributorActivity,
  ContributorActivityResult,
  StoredContributorActivity
} from "./contributor-evolution.types.js";

function toContributorActivity(row: StoredContributorActivity): ContributorActivity {
  return {
    authorName: row.author_name,
    authorEmail: row.author_email,
    commitCount: row.commit_count,
    additions: row.additions,
    deletions: row.deletions,
    totalChurn: row.total_churn,
    pathsTouched: row.paths_touched,
    firstCommittedAt: row.first_committed_at,
    lastCommittedAt: row.last_committed_at
  };
}

export async function getContributorActivity(
  repositoryId: string,
  limit: number
): Promise<ContributorActivityResult> {
  const result = await listContributorActivity(repositoryId, limit);
  return {
    totalContributors: result.total,
    contributors: result.contributors.map(toContributorActivity)
  };
}

export { toContributorActivity };
