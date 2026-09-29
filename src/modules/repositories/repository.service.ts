import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import type { RepositoryMetadata } from "./repository.types.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";
import { assertAnalysisDeadline } from "../analysis/analysis-deadline.js";
import { createAnalysisGit } from "../analysis/analysis-git.js";

export function getRepositoryStoragePath(repositoryId: string): string {
  return path.resolve(env.REPOSITORY_STORAGE_PATH, repositoryId);
}

export async function prepareRepositoryStorage(
  repositoryId: string
): Promise<string> {
  const repositoryPath = getRepositoryStoragePath(repositoryId);

  await mkdir(repositoryPath, { recursive: true });

  return repositoryPath;
}

export async function removeRepositoryStorage(
  repositoryId: string
): Promise<void> {
  await rm(getRepositoryStoragePath(repositoryId), {
    recursive: true,
    force: true
  });
}

export async function isRepositoryStorageReady(
  repositoryPath: string
): Promise<boolean> {
  try {
    await stat(path.join(repositoryPath, ".git"));
    return true;
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
  const repositoryPath = await prepareRepositoryStorage(repositoryId);
  const parentPath = path.dirname(repositoryPath);

  const git = createAnalysisGit(parentPath);

  const cloneArgs = ["--no-tags", "--filter=blob:none"];

  if (branch) {
    cloneArgs.push("--branch", branch);
  }

  try {
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
    await removeRepositoryStorage(repositoryId);
    throw error;
  }
}

function assertSafeBranchName(branch: string): void {
  if (!branch || branch.length > 255) {
    throw new Error("Repository branch is invalid.");
  }

  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error("Repository branch contains unsupported characters.");
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

async function calculateDirectorySize(
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

    if (entry.isDirectory()) {
      total += await calculateDirectorySize(entryPath);
      continue;
    }

    total += (await stat(entryPath)).size;
  }

  return total;
}
