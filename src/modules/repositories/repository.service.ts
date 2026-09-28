import { mkdir } from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import { env } from "../../config/env.js";
import type { RepositoryMetadata } from "./repository.types.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";

export async function prepareRepositoryStorage(repositoryId: string): Promise<string> {
  const root = path.resolve(env.REPOSITORY_STORAGE_PATH);
  const repositoryPath = path.join(root, repositoryId);

  await mkdir(repositoryPath, { recursive: true });

  return repositoryPath;
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

  await git.clone(safeUrl.toString(), repositoryPath, cloneArgs);

  return readRepositoryMetadata(repositoryPath);
}

export async function readRepositoryMetadata(
  repositoryPath: string
): Promise<RepositoryMetadata> {
  const git = simpleGit(repositoryPath);

  const [branch, head, count, shallow] = await Promise.all([
    git.revparse(["--abbrev-ref", "HEAD"]),
    git.revparse(["HEAD"]),
    git.raw(["rev-list", "--count", "HEAD"]),
    git.raw(["rev-parse", "--is-shallow-repository"])
  ]);

  return {
    name: path.basename(repositoryPath),
    defaultBranch: branch.trim(),
    headSha: head.trim(),
    commitCount: Number.parseInt(count.trim(), 10),
    isShallow: shallow.trim() === "true"
  };
}
