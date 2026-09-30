import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { db } from "../../config/database.js";
import type { RepositoryMetadata } from "./repository.types.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";
import { assertAnalysisDeadline } from "../analysis/analysis-deadline.js";
import { createAnalysisGit } from "../analysis/analysis-git.js";

const REPOSITORY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertRepositoryId(repositoryId: string): void {
  if (!REPOSITORY_ID_PATTERN.test(repositoryId)) {
    throw new Error("Repository id is invalid.");
  }
}

export function getRepositoryStoragePath(repositoryId: string): string {
  assertRepositoryId(repositoryId);
  return path.resolve(env.REPOSITORY_STORAGE_PATH, repositoryId);
}

export async function prepareRepositoryStorage(
  repositoryId: string
): Promise<string> {
  const repositoryPath = getRepositoryStoragePath(repositoryId);

  await mkdir(repositoryPath, { recursive: true });

  return repositoryPath;
}

export type RepositoryDeletionResult =
  | { status: "deleted"; storageDeleted: boolean; cleanupPending: boolean }
  | { status: "not_found" }
  | { status: "blocked"; analysisRunId: string };

type PendingStorageCleanup = {
  repository_id: string;
  storage_path: string;
};

async function recordRepositoryStorageCleanup(
  client: import("pg").PoolClient,
  repositoryId: string,
  storagePath: string
): Promise<void> {
  await client.query(
    `
      INSERT INTO repository_storage_cleanup (
        repository_id,
        storage_path
      )
      VALUES ($1, $2)
      ON CONFLICT (repository_id)
      DO UPDATE SET
        storage_path = EXCLUDED.storage_path,
        requested_at = NOW(),
        attempts = 0,
        last_error = NULL,
        completed_at = NULL
    `,
    [repositoryId, storagePath]
  );
}

async function markRepositoryStorageCleanupFailed(
  repositoryId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  try {
    await db.query(
      `
        UPDATE repository_storage_cleanup
        SET
          attempts = attempts + 1,
          last_error = $2
        WHERE repository_id = $1
          AND completed_at IS NULL
      `,
      [repositoryId, message.slice(0, 2_000)]
    );
  } catch (persistenceError) {
    console.error(
      `Failed to record repository storage cleanup error for ${repositoryId}:`,
      persistenceError
    );
  }
}

async function completeRepositoryStorageCleanup(
  repositoryId: string
): Promise<void> {
  await db.query(
    "DELETE FROM repository_storage_cleanup WHERE repository_id = $1",
    [repositoryId]
  );
}

export async function retryRepositoryStorageCleanup(
  limit = 20
): Promise<{ attempted: number; cleaned: number; pending: number }> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

  const result = await db.query<PendingStorageCleanup>(
    `
      SELECT repository_id, storage_path
      FROM repository_storage_cleanup
      WHERE completed_at IS NULL
      ORDER BY requested_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `,
    [safeLimit]
  );

  let cleaned = 0;

  for (const item of result.rows) {
    try {
      assertManagedRepositoryStoragePath(item.storage_path);
      await removeRepositoryStoragePath(item.storage_path);
      await completeRepositoryStorageCleanup(item.repository_id);
      cleaned += 1;
    } catch (error) {
      await markRepositoryStorageCleanupFailed(item.repository_id, error);
    }
  }

  return {
    attempted: result.rows.length,
    cleaned,
    pending: result.rows.length - cleaned
  };
}

export async function deleteRepositoryWithStorage(
  repositoryId: string
): Promise<RepositoryDeletionResult> {
  assertRepositoryId(repositoryId);
  const client = await db.connect();
  let storagePath: string | null = null;

  try {
    await client.query("BEGIN");

    const repositoryResult = await client.query<{
      storage_path: string | null;
    }>(
      `
        SELECT storage_path
        FROM repositories
        WHERE id = $1
        FOR UPDATE
      `,
      [repositoryId]
    );

    const repository = repositoryResult.rows[0];

    if (!repository) {
      await client.query("ROLLBACK");
      return { status: "not_found" };
    }

    const activeRunResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM analysis_runs
        WHERE repository_id = $1
          AND status IN ('queued', 'running')
      `,
      [repositoryId]
    );

    const activeRun = activeRunResult.rows[0];

    if (activeRun) {
      await client.query("ROLLBACK");
      return {
        status: "blocked",
        analysisRunId: activeRun.id
      };
    }

    storagePath = repository.storage_path;

    if (storagePath) {
      assertManagedRepositoryStoragePath(storagePath);
      await recordRepositoryStorageCleanup(client, repositoryId, storagePath);
    }

    await client.query(
      "DELETE FROM repositories WHERE id = $1",
      [repositoryId]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (!storagePath) {
    return {
      status: "deleted",
      storageDeleted: false,
      cleanupPending: false
    };
  }

  try {
    await removeRepositoryStoragePath(storagePath);
    await completeRepositoryStorageCleanup(repositoryId);

    return {
      status: "deleted",
      storageDeleted: true,
      cleanupPending: false
    };
  } catch (error) {
    await markRepositoryStorageCleanupFailed(repositoryId, error);

    return {
      status: "deleted",
      storageDeleted: false,
      cleanupPending: true
    };
  }
}

export function assertManagedRepositoryStoragePath(
  storagePath: string
): void {
  const rootPath = path.resolve(env.REPOSITORY_STORAGE_PATH);
  const targetPath = path.resolve(storagePath);
  const relativePath = path.relative(rootPath, targetPath);

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Repository storage path is outside the managed storage root.");
  }
}

export async function removeRepositoryStoragePath(
  storagePath: string
): Promise<void> {
  assertManagedRepositoryStoragePath(storagePath);
  await rm(storagePath, {
    recursive: true,
    force: true
  });
}

export async function removeRepositoryStorage(
  repositoryId: string
): Promise<void> {
  await removeRepositoryStoragePath(getRepositoryStoragePath(repositoryId));
}

export async function isRepositoryStorageReady(
  repositoryPath: string
): Promise<boolean> {
  try {
    const gitPath = await lstat(path.join(repositoryPath, ".git"));
    return gitPath.isDirectory();
  } catch {
    return false;
  }
}

export async function cloneRepository(
  repositoryId: string,
  remoteUrl: string,
  branch?: string
): Promise<RepositoryMetadata> {
  const safeUrl = validateRemoteRepositoryUrl(remoteUrl);

  if (branch) {
    assertSafeBranchName(branch);
  }

  const repositoryPath = await prepareRepositoryStorage(repositoryId);
  const parentPath = path.dirname(repositoryPath);

  const cloneArgs = ["--no-tags", "--filter=blob:none"];

  if (branch) {
    cloneArgs.push("--branch", branch);
  }

  try {
    const git = createAnalysisGit(parentPath);
    await git.clone(safeUrl.toString(), repositoryPath, cloneArgs);

    const sizeBytes = await calculateDirectorySize(repositoryPath);
    const maxBytes = env.MAX_REPOSITORY_SIZE_MB * 1024 * 1024;

    if (sizeBytes > maxBytes) {
      throw new Error(
        `Repository exceeds the configured size limit of ${env.MAX_REPOSITORY_SIZE_MB} MB.`
      );
    }

    const metadata = await readRepositoryMetadata(repositoryPath);
    metadata.name = getRepositoryNameFromUrl(safeUrl);

    return metadata;
  } catch (error) {
    try {
      await removeRepositoryStorage(repositoryId);
    } catch (cleanupError) {
      console.error(
        `Failed to clean repository storage after clone failure for ${repositoryId}:`,
        cleanupError
      );
    }

    throw error;
  }
}

export function isSafeBranchName(branch: string): boolean {
  if (
    !branch ||
    branch.length > 255 ||
    branch.startsWith("-") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.includes("//")
  ) {
    return false;
  }

  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    return false;
  }

  if (branch === "@") {
    return false;
  }

  const segments = branch.split("/");

  return !segments.some(
    (segment) =>
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.startsWith(".") ||
      segment.endsWith(".lock")
  );
}

export function assertSafeBranchName(branch: string): void {
  if (!branch || branch.length > 255) {
    throw new Error("Repository branch is invalid.");
  }

  if (!isSafeBranchName(branch)) {
    throw new Error("Repository branch is invalid.");
  }
}

function assertValidSha(sha: string): void {
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) {
    throw new Error("Git reference is invalid.");
  }
}

export async function refreshRepository(
  repositoryId: string,
  remoteUrl: string,
  branch: string
): Promise<RepositoryMetadata> {
  const safeUrl = validateRemoteRepositoryUrl(remoteUrl);
  assertSafeBranchName(branch);

  const repositoryPath = getRepositoryStoragePath(repositoryId);
  const git = createAnalysisGit(repositoryPath);

  try {
    await git.raw([
      "check-ref-format",
      "--branch",
      branch
    ]);

    await git.raw([
      "remote",
      "set-url",
      "origin",
      safeUrl.toString()
    ]);

    await git.raw([
      "fetch",
      "origin",
      "--prune",
      "--no-tags",
      `refs/heads/${branch}:refs/remotes/origin/${branch}`
    ]);

    await git.raw([
      "checkout",
      "-B",
      branch,
      `origin/${branch}`
    ]);

    const sizeBytes = await calculateDirectorySize(repositoryPath);
    const maxBytes = env.MAX_REPOSITORY_SIZE_MB * 1024 * 1024;

    if (sizeBytes > maxBytes) {
      throw new Error(
        `Repository exceeds the configured size limit of ${env.MAX_REPOSITORY_SIZE_MB} MB.`
      );
    }

    const metadata = await readRepositoryMetadata(repositoryPath);
    metadata.name = getRepositoryNameFromUrl(safeUrl);

    return metadata;
  } catch (error) {
    throw error;
  }
}

export async function checkoutRepositoryAtCommit(
  repositoryPath: string,
  commitSha: string
): Promise<void> {
  assertValidSha(commitSha);

  const git = createAnalysisGit(repositoryPath);

  await git.raw([
    "checkout",
    "--detach",
    commitSha
  ]);
}

export async function isCommitAncestor(
  repositoryPath: string,
  ancestorSha: string,
  descendantSha: string
): Promise<boolean> {
  assertValidSha(ancestorSha);
  assertValidSha(descendantSha);

  const git = createAnalysisGit(repositoryPath);

  try {
    const mergeBase = await git.raw([
      "merge-base",
      ancestorSha,
      descendantSha
    ]);

    return mergeBase.trim() === ancestorSha;
  } catch {
    return false;
  }
}

export async function readRepositoryMetadata(
  repositoryPath: string
): Promise<RepositoryMetadata> {
  const git = createAnalysisGit(repositoryPath);

  const [currentBranch, head, count, shallow] = await Promise.all([
    git.revparse(["--abbrev-ref", "HEAD"]),
    git.revparse(["HEAD"]),
    git.raw(["rev-list", "--count", "HEAD"]),
    git.raw(["rev-parse", "--is-shallow-repository"])
  ]);

  let defaultBranch = currentBranch.trim();

  try {
    const remoteHead = await git.revparse([
      "--symbolic-full-name",
      "refs/remotes/origin/HEAD"
    ]);
    const prefix = "refs/remotes/origin/";

    if (remoteHead.trim().startsWith(prefix)) {
      defaultBranch = remoteHead.trim().slice(prefix.length);
    }
  } catch {
    // Some Git servers do not expose origin/HEAD. The current branch is
    // the safest fallback when the remote default is unavailable.
  }

  const commitCount = Number.parseInt(count.trim(), 10);

  if (!Number.isSafeInteger(commitCount) || commitCount < 0) {
    throw new Error("Git returned an invalid commit count.");
  }

  const headSha = head.trim();

  if (!/^[0-9a-f]{7,64}$/i.test(headSha)) {
    throw new Error("Git returned an invalid HEAD SHA.");
  }

  return {
    name: path.basename(repositoryPath),
    defaultBranch,
    headSha,
    commitCount,
    isShallow: shallow.trim() === "true"
  };
}

export function getRepositoryNameFromUrl(url: URL): string {
  const segments = decodeURIComponent(url.pathname)
    .split("/")
    .filter(Boolean);

  const lastSegment = segments.at(-1);

  if (!lastSegment) {
    throw new Error("Repository URL does not contain a repository name.");
  }

  return lastSegment.replace(/\.git$/i, "");
}

export async function calculateDirectorySize(
  directoryPath: string
): Promise<number> {
  assertAnalysisDeadline();

  const entries = await readdir(directoryPath, {
    withFileTypes: true
  });

  let total = 0;

  for (const entry of entries) {
    assertAnalysisDeadline();

    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      total += await calculateDirectorySize(entryPath);
      continue;
    }

    if (entry.isFile()) {
      total += (await lstat(entryPath)).size;
    }
  }

  return total;
}
