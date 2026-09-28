import type { PoolClient } from "pg";
import { db } from "../../config/database.js";
import type { AnalysisRunStatus } from "../analysis/analysis.types.js";
import type { RepositoryMetadata } from "./repository.types.js";

export type AnalysisMode = "check" | "full" | "incremental";

export interface StoredRepository {
  id: string;
  source_type: string;
  source_url: string | null;
  name: string;
  default_branch: string | null;
  tracked_branch: string | null;
  head_sha: string | null;
  storage_path: string | null;
}

export interface StoredAnalysisRun {
  id: string;
  repository_id: string;
  analyzer_version: string;
  analysis_mode: AnalysisMode;
  base_head_sha: string | null;
  target_head_sha: string | null;
  status: AnalysisRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface StoredCommit {
  sha: string;
  parent_shas: string[];
  author_name: string | null;
  author_email: string | null;
  authored_at: string | null;
  committer_name: string | null;
  committer_email: string | null;
  committed_at: string | null;
  subject: string;
  files_changed: number;
  additions: number | null;
  deletions: number | null;
}

export interface CreateRepositoryInput {
  id: string;
  sourceType: string;
  sourceUrl: string;
  name: string;
  trackedBranch: string;
  metadata: RepositoryMetadata;
  storagePath: string;
}

export interface CreateAnalysisRunInput {
  analyzerVersion: string;
  analysisMode: AnalysisMode;
  baseHeadSha: string | null;
  targetHeadSha: string | null;
}

export interface PendingRepositoryInput {
  id: string;
  sourceType: string;
  sourceUrl: string;
  name: string;
  trackedBranch: string | null;
  storagePath: string;
}

async function createAnalysisRun(
  client: PoolClient,
  repositoryId: string,
  input: CreateAnalysisRunInput
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO analysis_runs (
        repository_id,
        analyzer_version,
        analysis_mode,
        base_head_sha,
        target_head_sha,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'queued')
      RETURNING id
    `,
    [
      repositoryId,
      input.analyzerVersion,
      input.analysisMode,
      input.baseHeadSha,
      input.targetHeadSha
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to create analysis run.");
  }

  return row.id;
}

export async function createRepositoryWithAnalysis(
  input: CreateRepositoryInput,
  analyzerVersion: string
): Promise<{ repositoryId: string; analysisRunId: string }> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO repositories (
          id,
          source_type,
          source_url,
          name,
          default_branch,
          tracked_branch,
          head_sha,
          storage_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.id,
        input.sourceType,
        input.sourceUrl,
        input.name,
        input.metadata.defaultBranch,
        input.trackedBranch,
        input.metadata.headSha,
        input.storagePath
      ]
    );

    const analysisRunId = await createAnalysisRun(client, input.id, {
      analyzerVersion,
      analysisMode: "full",
      baseHeadSha: null,
      targetHeadSha: input.metadata.headSha
    });

    await client.query("COMMIT");

    return {
      repositoryId: input.id,
      analysisRunId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createPendingRepositoryWithAnalysis(
  input: PendingRepositoryInput,
  analyzerVersion: string
): Promise<{ repositoryId: string; analysisRunId: string }> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO repositories (
          id,
          source_type,
          source_url,
          name,
          tracked_branch,
          storage_path
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.id,
        input.sourceType,
        input.sourceUrl,
        input.name,
        input.trackedBranch,
        input.storagePath
      ]
    );

    const analysisRunId = await createAnalysisRun(client, input.id, {
      analyzerVersion,
      analysisMode: "full",
      baseHeadSha: null,
      targetHeadSha: null
    });

    await client.query("COMMIT");

    return {
      repositoryId: input.id,
      analysisRunId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRepositoryImportMetadata(
  repositoryId: string,
  metadata: RepositoryMetadata,
  trackedBranch: string
): Promise<void> {
  await db.query(
    `
      UPDATE repositories
      SET
        name = $2,
        default_branch = $3,
        tracked_branch = $4,
        head_sha = $5,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      repositoryId,
      metadata.name,
      metadata.defaultBranch,
      trackedBranch,
      metadata.headSha
    ]
  );
}

export async function setAnalysisRunTargetHead(
  analysisRunId: string,
  targetHeadSha: string
): Promise<void> {
  await db.query(
    `
      UPDATE analysis_runs
      SET target_head_sha = $2
      WHERE id = $1
    `,
    [analysisRunId, targetHeadSha]
  );
}

export async function createAnalysisRunForRepository(
  repositoryId: string,
  input: CreateAnalysisRunInput
): Promise<string> {
  const client = await db.connect();

  try {
    return await createAnalysisRun(client, repositoryId, input);
  } finally {
    client.release();
  }
}

export async function setAnalysisRunPlan(
  analysisRunId: string,
  input: {
    analysisMode: AnalysisMode;
    baseHeadSha: string | null;
    targetHeadSha: string;
  }
): Promise<void> {
  await db.query(
    `
      UPDATE analysis_runs
      SET
        analysis_mode = $2,
        base_head_sha = $3,
        target_head_sha = $4
      WHERE id = $1
    `,
    [
      analysisRunId,
      input.analysisMode,
      input.baseHeadSha,
      input.targetHeadSha
    ]
  );
}

export async function updateRepositoryHead(
  repositoryId: string,
  metadata: RepositoryMetadata
): Promise<void> {
  await db.query(
    `
      UPDATE repositories
      SET
        default_branch = $2,
        head_sha = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      repositoryId,
      metadata.defaultBranch,
      metadata.headSha
    ]
  );
}

export async function getRepositoryById(
  repositoryId: string
): Promise<StoredRepository | null> {
  const result = await db.query<StoredRepository>(
    `
      SELECT
        id,
        source_type,
        source_url,
        name,
        default_branch,
        tracked_branch,
        head_sha,
        storage_path
      FROM repositories
      WHERE id = $1
    `,
    [repositoryId]
  );

  return result.rows[0] ?? null;
}

export async function getAnalysisRunById(
  analysisRunId: string
): Promise<StoredAnalysisRun | null> {
  const result = await db.query<StoredAnalysisRun>(
    `
      SELECT
        id,
        repository_id,
        analyzer_version,
        analysis_mode,
        base_head_sha,
        target_head_sha,
        status,
        started_at,
        completed_at,
        error_message
      FROM analysis_runs
      WHERE id = $1
    `,
    [analysisRunId]
  );

  return result.rows[0] ?? null;
}

export async function getActiveAnalysisRun(
  repositoryId: string
): Promise<StoredAnalysisRun | null> {
  const result = await db.query<StoredAnalysisRun>(
    `
      SELECT
        id,
        repository_id,
        analyzer_version,
        analysis_mode,
        base_head_sha,
        target_head_sha,
        status,
        started_at,
        completed_at,
        error_message
      FROM analysis_runs
      WHERE repository_id = $1
        AND status IN ('queued', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [repositoryId]
  );

  return result.rows[0] ?? null;
}

export async function getLatestCompletedAnalysisRun(
  repositoryId: string
): Promise<StoredAnalysisRun | null> {
  const result = await db.query<StoredAnalysisRun>(
    `
      SELECT
        id,
        repository_id,
        analyzer_version,
        analysis_mode,
        base_head_sha,
        target_head_sha,
        status,
        started_at,
        completed_at,
        error_message
      FROM analysis_runs
      WHERE repository_id = $1
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [repositoryId]
  );

  return result.rows[0] ?? null;
}

export async function updateAnalysisRun(
  analysisRunId: string,
  status: AnalysisRunStatus,
  details?: {
    errorMessage?: string;
  }
): Promise<void> {
  await db.query(
    `
      UPDATE analysis_runs
      SET
        status = $2,
        started_at = CASE
          WHEN $2 = 'running' AND started_at IS NULL THEN NOW()
          ELSE started_at
        END,
        completed_at = CASE
          WHEN $2 IN ('completed', 'failed') THEN NOW()
          ELSE completed_at
        END,
        error_message = $3
      WHERE id = $1
    `,
    [analysisRunId, status, details?.errorMessage ?? null]
  );
}

async function writeCommitBatch(
  client: PoolClient,
  repositoryId: string,
  commits: Array<{
    sha: string;
    parentShas: string[];
    authorName: string;
    authorEmail: string;
    authoredAt: string;
    committerName: string;
    committerEmail: string;
    committedAt: string;
    subject: string;
    additions: number;
    deletions: number;
    files: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
  }>
): Promise<number> {
  let persisted = 0;

  for (const commit of commits) {
    const commitResult = await client.query<{ id: string }>(
      `
        INSERT INTO commits (
          repository_id,
          sha,
          parent_shas,
          author_name,
          author_email,
          authored_at,
          committer_name,
          committer_email,
          committed_at,
          subject,
          files_changed,
          additions,
          deletions
        )
        VALUES (
          $1,
          $2,
          $3::jsonb,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13
        )
        ON CONFLICT (repository_id, sha)
        DO UPDATE SET
          parent_shas = EXCLUDED.parent_shas,
          author_name = EXCLUDED.author_name,
          author_email = EXCLUDED.author_email,
          authored_at = EXCLUDED.authored_at,
          committer_name = EXCLUDED.committer_name,
          committer_email = EXCLUDED.committer_email,
          committed_at = EXCLUDED.committed_at,
          subject = EXCLUDED.subject,
          files_changed = EXCLUDED.files_changed,
          additions = EXCLUDED.additions,
          deletions = EXCLUDED.deletions
        RETURNING id
      `,
      [
        repositoryId,
        commit.sha,
        JSON.stringify(commit.parentShas),
        commit.authorName,
        commit.authorEmail,
        commit.authoredAt,
        commit.committerName,
        commit.committerEmail,
        commit.committedAt,
        commit.subject,
        commit.files.length,
        commit.additions,
        commit.deletions
      ]
    );

    const commitRow = commitResult.rows[0];

    if (!commitRow) {
      throw new Error(`Failed to persist commit ${commit.sha}.`);
    }

    const commitId = commitRow.id;

    await client.query(
      "DELETE FROM commit_files WHERE commit_id = $1",
      [commitId]
    );

    for (const file of commit.files) {
      await client.query(
        `
          INSERT INTO commit_files (
            commit_id,
            path,
            status,
            additions,
            deletions
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [commitId, file.path, file.status, file.additions, file.deletions]
      );
    }

    persisted += 1;
  }

  return persisted;
}

export async function persistCommitBatch(
  repositoryId: string,
  commits: Array<{
    sha: string;
    parentShas: string[];
    authorName: string;
    authorEmail: string;
    authoredAt: string;
    committerName: string;
    committerEmail: string;
    committedAt: string;
    subject: string;
    additions: number;
    deletions: number;
    files: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
  }>
): Promise<number> {
  if (commits.length === 0) {
    return 0;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const persisted = await writeCommitBatch(client, repositoryId, commits);
    await client.query("COMMIT");
    return persisted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceRepositoryCommitHistory(
  repositoryId: string,
  commits: Array<{
    sha: string;
    parentShas: string[];
    authorName: string;
    authorEmail: string;
    authoredAt: string;
    committerName: string;
    committerEmail: string;
    committedAt: string;
    subject: string;
    additions: number;
    deletions: number;
    files: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
  }>
): Promise<number> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "DELETE FROM commits WHERE repository_id = $1",
      [repositoryId]
    );

    const persisted = await writeCommitBatch(
      client,
      repositoryId,
      commits
    );

    await client.query("COMMIT");
    return persisted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listRepositoryCommits(
  repositoryId: string,
  page: number,
  limit: number
): Promise<{ commits: StoredCommit[]; total: number }> {
  const offset = (page - 1) * limit;

  const [rowsResult, countResult] = await Promise.all([
    db.query<StoredCommit>(
      `
        SELECT
          sha,
          parent_shas,
          author_name,
          author_email,
          authored_at,
          committer_name,
          committer_email,
          committed_at,
          subject,
          files_changed,
          additions,
          deletions
        FROM commits
        WHERE repository_id = $1
        ORDER BY committed_at ASC NULLS LAST, sha ASC
        LIMIT $2
        OFFSET $3
      `,
      [repositoryId, limit, offset]
    ),
    db.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM commits
        WHERE repository_id = $1
      `,
      [repositoryId]
    )
  ]);

  const countRow = countResult.rows[0];

  if (!countRow) {
    throw new Error("Failed to count repository commits.");
  }

  return {
    commits: rowsResult.rows,
    total: Number.parseInt(countRow.count, 10)
  };
}

export async function replaceFileChangeMetrics(
  repositoryId: string,
  metrics: Array<{
    path: string;
    additions: number;
    deletions: number;
    binaryChanges: number;
  }>
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "DELETE FROM file_change_metrics WHERE repository_id = $1",
      [repositoryId]
    );

    if (metrics.length > 0) {
      await client.query(
        `
          INSERT INTO file_change_metrics (
            repository_id,
            path,
            commits_touched,
            additions,
            deletions,
            binary_changes,
            total_churn
          )
          SELECT
            $1,
            item.path,
            COALESCE(
              (
                SELECT COUNT(*)::int
                FROM commit_files cf
                INNER JOIN commits c ON c.id = cf.commit_id
                WHERE c.repository_id = $1
                  AND cf.path = item.path
              ),
              0
            ),
            item.additions,
            item.deletions,
            item.binary_changes,
            item.additions + item.deletions
          FROM jsonb_to_recordset($2::jsonb) AS item(
            path TEXT,
            additions INTEGER,
            deletions INTEGER,
            binary_changes INTEGER
          )
          ON CONFLICT (repository_id, path)
          DO UPDATE SET
            commits_touched = EXCLUDED.commits_touched,
            additions = EXCLUDED.additions,
            deletions = EXCLUDED.deletions,
            binary_changes = EXCLUDED.binary_changes,
            total_churn = EXCLUDED.total_churn,
            updated_at = NOW()
        `,
        [repositoryId, JSON.stringify(metrics)]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface StoredHotspot {
  path: string;
  commits_touched: number;
  additions: number;
  deletions: number;
  binary_changes: number;
  total_churn: number;
  first_changed_at: string | null;
  last_changed_at: string | null;
}

export async function listRepositoryHotspots(
  repositoryId: string,
  limit: number
): Promise<StoredHotspot[]> {
  const result = await db.query<StoredHotspot>(
    `
      SELECT
        metrics.path,
        metrics.commits_touched,
        metrics.additions,
        metrics.deletions,
        metrics.binary_changes,
        metrics.total_churn,
        MIN(commits.committed_at) AS first_changed_at,
        MAX(commits.committed_at) AS last_changed_at
      FROM file_change_metrics AS metrics
      LEFT JOIN commit_files AS files
        ON files.path = metrics.path
      LEFT JOIN commits
        ON commits.id = files.commit_id
       AND commits.repository_id = metrics.repository_id
      WHERE metrics.repository_id = $1
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
        metrics.path ASC
      LIMIT $2
    `,
    [repositoryId, limit]
  );

  return result.rows;
}
