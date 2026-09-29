export interface StoredContributorActivity {
  author_name: string | null;
  author_email: string | null;
  commit_count: number;
  additions: number;
  deletions: number;
  total_churn: number;
  paths_touched: number;
  first_committed_at: string | null;
  last_committed_at: string | null;
  total_contributors: number;
}

export interface ContributorActivity {
  authorName: string | null;
  authorEmail: string | null;
  commitCount: number;
  additions: number;
  deletions: number;
  totalChurn: number;
  pathsTouched: number;
  firstCommittedAt: string | null;
  lastCommittedAt: string | null;
}

export interface ContributorActivityResult {
  totalContributors: number;
  contributors: ContributorActivity[];
}
