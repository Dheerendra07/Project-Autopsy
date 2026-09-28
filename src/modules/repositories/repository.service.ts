import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import { env } from "../../config/env.js";
import type { RepositoryMetadata } from "./repository.types.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";

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

export async function cloneRepository(
  repositoryId: string,
  remoteUrl: string,
  branch?: string
): Promise<RepositoryMetadata> {
  const safeUrl = validateRemoteRepositoryUrl(remoteUrl);
  const repositoryPath = await prepareRepositoryStorage(repositoryId);
  const parentPath = path.dirname(repositoryPath);

  const git = simpleGit({
    baseDir: parentPath,
    maxConcurrentProcesses: 1,
    timeout: {
      block: env.MAX_ANALYSIS_TIME_MINUTES * 60 * 1000
    }
  });

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

export async function readRepositoryMetadata(
  repositoryPath: string
): Promise<RepositoryMetadata> {
  const git = simpleGit(repositoryPath);

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

function getRepositoryNameFromUrl(url: URL): string {
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
  const entries = await readdir(directoryPath, {
    withFileTypes: true
  });

  let total = 0;

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      total += await calculateDirectorySize(entryPath);
      continue;
    }

    total += (await stat(entryPath)).size;
  }

  return total;
}
