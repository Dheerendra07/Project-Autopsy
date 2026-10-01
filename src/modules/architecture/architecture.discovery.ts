import { simpleGit } from "simple-git";
import { createAnalysisGit } from "../analysis/analysis-git.js";

export interface ArchitectureSnapshot {
  rootPath: "root" | "src";
  directories: string[];
}

export interface ArchitectureEvent {
  rootPath: "root" | "src";
  eventType: "added" | "removed";
  path: string;
}

export interface ArchitectureEvolutionOptions {
  baseHeadSha?: string | null;
}

export async function discoverArchitectureEvolution(
  repositoryPath: string,
  commits: Array<{ sha: string }>,
  options: ArchitectureEvolutionOptions = {}
): Promise<{
  snapshots: Array<ArchitectureSnapshot & { sha: string }>;
  events: Array<ArchitectureEvent & { sha: string }>;
}> {
  const git = createAnalysisGit(repositoryPath);
  const snapshots: Array<ArchitectureSnapshot & { sha: string }> = [];
  const events: Array<ArchitectureEvent & { sha: string }> = [];

  let previousRoot = new Set<string>();
  let previousSrc = new Set<string>();
  if (options.baseHeadSha) {
    previousRoot = new Set(
      await listDirectoriesAtCommit(git, options.baseHeadSha, "")
    );
    previousSrc = new Set(
      await listDirectoriesAtCommit(git, options.baseHeadSha, "src")
    );
  }

  for (const commit of commits) {
    const root = new Set(
      await listDirectoriesAtCommit(git, commit.sha, "")
    );
    const src = new Set(
      await listDirectoriesAtCommit(git, commit.sha, "src")
    );

    snapshots.push({
      sha: commit.sha,
      rootPath: "root",
      directories: [...root].sort((a, b) => a.localeCompare(b))
    });
    snapshots.push({
      sha: commit.sha,
      rootPath: "src",
      directories: [...src].sort((a, b) => a.localeCompare(b))
    });

    events.push(
      ...diffDirectorySets(previousRoot, root).map((event) => ({
        sha: commit.sha,
        rootPath: "root" as const,
        ...event
      })),
      ...diffDirectorySets(previousSrc, src).map((event) => ({
        sha: commit.sha,
        rootPath: "src" as const,
        ...event
      }))
    );

    previousRoot = root;
    previousSrc = src;
  }

  return { snapshots, events };
}

async function listDirectoriesAtCommit(
  git: ReturnType<typeof simpleGit>,
  sha: string,
  rootPath: string
): Promise<string[]> {
  const treeish = rootPath ? sha + ":" + rootPath : sha;
  let output: string;
  try {
    output = await git.raw([
      "ls-tree",
      "--name-only",
      "-d",
      treeish
    ]);
  } catch (error) {
    if (
      rootPath === "src" &&
      error instanceof Error &&
      /not a valid object name .*:src/i.test(error.message)
    ) {
      return [];
    }

    throw error;
  }

  return output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((directory) =>
      rootPath && directory.startsWith(rootPath + "/")
        ? directory.slice(rootPath.length + 1)
        : directory
    );
}
export function diffDirectorySets(
  previous: Set<string>,
  current: Set<string>
): Array<{
  eventType: "added" | "removed";
  path: string;
}> {
  return [
    ...[...current]
      .filter((path) => !previous.has(path))
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ eventType: "added" as const, path })),
    ...[...previous]
      .filter((path) => !current.has(path))
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ eventType: "removed" as const, path }))
  ];
}