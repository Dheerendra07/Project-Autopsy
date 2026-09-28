import { simpleGit } from "simple-git";

export interface ArchitectureSnapshot {
  rootPath: "root" | "src";
  directories: string[];
}

export interface ArchitectureEvent {
  rootPath: "root" | "src";
  eventType: "added" | "removed";
  path: string;
}

export async function discoverArchitectureEvolution(
  repositoryPath: string,
  commits: Array<{ sha: string }>
): Promise<{
  snapshots: Array<ArchitectureSnapshot & { sha: string }>;
  events: Array<ArchitectureEvent & { sha: string }>;
}> {
  const git = simpleGit(repositoryPath);
  const snapshots: Array<ArchitectureSnapshot & { sha: string }> = [];
  const events: Array<ArchitectureEvent & { sha: string }> = [];

  let previousRoot = new Set<string>();
  let previousSrc = new Set<string>();
  let hasPrevious = false;

  for (const commit of commits) {
    const root = new Set(await listDirectoriesAtCommit(git, commit.sha, ""));
    const src = new Set(await listDirectoriesAtCommit(git, commit.sha, "src"));

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

    if (hasPrevious) {
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
    } else {
      events.push(
        ...[...root].sort().map((path) => ({
          sha: commit.sha,
          rootPath: "root" as const,
          eventType: "added" as const,
          path
        })),
        ...[...src].sort().map((path) => ({
          sha: commit.sha,
          rootPath: "src" as const,
          eventType: "added" as const,
          path
        }))
      );
    }

    previousRoot = root;
    previousSrc = src;
    hasPrevious = true;
  }

  return { snapshots, events };
}

async function listDirectoriesAtCommit(
  git: ReturnType<typeof simpleGit>,
  sha: string,
  rootPath: string
): Promise<string[]> {
  try {
    const output = await git.raw(["ls-tree", "-r", "--name-only", sha]);
    const prefix = rootPath ? `${rootPath}/` : "";
    const directories = new Set<string>();

    for (const rawPath of output.split(/\r?\n/)) {
      const filePath = rawPath.trim();
      if (!filePath || (prefix && !filePath.startsWith(prefix))) {
        continue;
      }

      const relative = prefix ? filePath.slice(prefix.length) : filePath;
      const segments = relative.split("/").filter(Boolean);

      if (segments.length < 2) {
        continue;
      }

      if (rootPath === "src") {
        directories.add(segments[0]!);
      } else {
        directories.add(segments[0]!);
      }
    }

    return [...directories].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
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
