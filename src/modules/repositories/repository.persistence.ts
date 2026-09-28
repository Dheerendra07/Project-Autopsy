import type { PoolClient } from "pg";
import { db } from "../../config/database.js";
import type { AnalysisRunStatus } from "../analysis/analysis.types.js";
import type { RepositoryMetadata } from "./repository.types.js";

export interface StoredRepository {
  id: string;
  source_type: string;
  source_url: string | null;
  name: string;
  default_branch: string | null;
  head_sha: string | null;
  storage_path: string | null;
}

export interface CreateRepositoryInput {
  id: string;
  sourceType: string;
  sourceUrl: string;
  name: string;
  metadata: RepositoryMetadata;
  storagePath: string;
}

async function createAnalysisRun(
  client: PoolClient,
  repositoryId: string,
  analyzerVersion: string
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO analysis_runs (
        repository_id,
        analyzer_version,
        status
      )
      VALUES ($1, $2, 'queued')
      RETURNING id
    `,
    [repositoryId, analyzerVersion]
  );

  return result.rows[0].id;
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
          head_sha,
          storage_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.id,
        input.sourceType,
        input.sourceUrl,
        input.name,
        input.metadata.defaultBranch,
        input.metadata.headSha,
        input.storagePath
      ]
    );

    const analysisRunId = await createAnalysisRun(
      client,
      input.id,
      analyzerVersion
    );

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
        head_sha,
        storage_path
      FROM repositories
      WHERE id = $1
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
    files: Array<{
      path: string;
      status: string;
    }>;
  }>
): Promise<number> {
  if (commits.length === 0) {
    return 0;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

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
            files_changed
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
            $11
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
            files_changed = EXCLUDED.files_changed
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
          commit.files.length
        ]
      );

      const commitId = commitResult.rows[0].id;

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
              status
            )
            VALUES ($1, $2, $3)
          `,
          [commitId, file.path, file.status]
        );
      }

      persisted += 1;
    }

    await client.query("COMMIT");
    return persisted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
