import { simpleGit } from "simple-git";
import { createAnalysisGit } from "../analysis/analysis-git.js";

export type DependencyScope = "dependencies" | "devDependencies";
export type DependencyChangeType = "added" | "removed" | "changed";

export interface DependencySnapshot {
  manifestPath: string;
  packageManager: "npm";
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface DependencyChange {
  manifestPath: string;
  packageManager: "npm";
  packageName: string;
  scope: DependencyScope;
  changeType: DependencyChangeType;
  previousSpec: string | null;
  currentSpec: string | null;
}

export interface DependencyEvolutionOptions {
  baseHeadSha?: string | null;
}

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

function toDependencySnapshot(
  manifest: PackageManifest
): DependencySnapshot {
  return {
    manifestPath: "package.json",
    packageManager: "npm",
    dependencies: normalizeDependencyMap(manifest.dependencies),
    devDependencies: normalizeDependencyMap(manifest.devDependencies)
  };
}

export async function discoverDependencyEvolution(
  repositoryPath: string,
  commits: Array<{ sha: string }>,
  options: DependencyEvolutionOptions = {}
): Promise<{
  snapshots: Array<DependencySnapshot & { sha: string }>;
  changes: Array<DependencyChange & { sha: string }>;
}> {
  const git = createAnalysisGit(repositoryPath);
  const snapshots: Array<DependencySnapshot & { sha: string }> = [];
  const changes: Array<DependencyChange & { sha: string }> = [];
  let previous: DependencySnapshot | null = null;

  if (options.baseHeadSha) {
    const baseManifest = await readPackageJsonAtCommit(
      git,
      options.baseHeadSha
    );

    previous = baseManifest
      ? toDependencySnapshot(baseManifest)
      : null;
  }

  for (const commit of commits) {
    const manifest = await readPackageJsonAtCommit(git, commit.sha);

    if (!manifest) {
      if (previous) {
        changes.push(
          ...mapChanges(
            diffDependencyMaps(
              previous.dependencies,
              {}
            ),
            previous,
            commit.sha,
            "dependencies"
          ),
          ...mapChanges(
            diffDependencyMaps(
              previous.devDependencies,
              {}
            ),
            previous,
            commit.sha,
            "devDependencies"
          )
        );
      }

      previous = null;
      continue;
    }

    const current = toDependencySnapshot(manifest);

    snapshots.push({
      sha: commit.sha,
      ...current
    });

    if (previous) {
      changes.push(
        ...mapChanges(
          diffDependencyMaps(
            previous.dependencies,
            current.dependencies
          ),
          current,
          commit.sha,
          "dependencies"
        ),
        ...mapChanges(
          diffDependencyMaps(
            previous.devDependencies,
            current.devDependencies
          ),
          current,
          commit.sha,
          "devDependencies"
        )
      );
    } else {
      changes.push(
        ...Object.entries(current.dependencies).map(([packageName, currentSpec]) => ({
          sha: commit.sha,
          manifestPath: current.manifestPath,
          packageManager: current.packageManager,
          packageName,
          scope: "dependencies" as const,
          changeType: "added" as const,
          previousSpec: null,
          currentSpec
        })),
        ...Object.entries(current.devDependencies).map(([packageName, currentSpec]) => ({
          sha: commit.sha,
          manifestPath: current.manifestPath,
          packageManager: current.packageManager,
          packageName,
          scope: "devDependencies" as const,
          changeType: "added" as const,
          previousSpec: null,
          currentSpec
        }))
      );
    }

    previous = current;
  }

  return { snapshots, changes };
}

async function readPackageJsonAtCommit(
  git: ReturnType<typeof simpleGit>,
  sha: string
): Promise<PackageManifest | null> {
  try {
    const raw = await git.show([`${sha}:package.json`]);
    return JSON.parse(raw) as PackageManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/path .*package\.json.* does not exist in/i.test(message)) {
      return null;
    }

    throw error;
  }
}

function normalizeDependencyMap(
  value: Record<string, unknown> | undefined
): Record<string, string> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

export function diffDependencyMaps(
  previous: Record<string, string>,
  current: Record<string, string>
): Array<{
  packageName: string;
  changeType: DependencyChangeType;
  previousSpec: string | null;
  currentSpec: string | null;
}> {
  const packageNames = new Set([
    ...Object.keys(previous),
    ...Object.keys(current)
  ]);

  const changes: Array<{
    packageName: string;
    changeType: DependencyChangeType;
    previousSpec: string | null;
    currentSpec: string | null;
  }> = [];

  for (const packageName of [...packageNames].sort((a, b) => a.localeCompare(b))) {
    const previousSpec = previous[packageName] ?? null;
    const currentSpec = current[packageName] ?? null;

    if (previousSpec === null && currentSpec !== null) {
      changes.push({
        packageName,
        changeType: "added",
        previousSpec,
        currentSpec
      });
      continue;
    }

    if (previousSpec !== null && currentSpec === null) {
      changes.push({
        packageName,
        changeType: "removed",
        previousSpec,
        currentSpec
      });
      continue;
    }

    if (
      previousSpec !== null &&
      currentSpec !== null &&
      previousSpec !== currentSpec
    ) {
      changes.push({
        packageName,
        changeType: "changed",
        previousSpec,
        currentSpec
      });
    }
  }

  return changes;
}

function mapChanges(
  changes: ReturnType<typeof diffDependencyMaps>,
  snapshot: DependencySnapshot,
  sha: string,
  scope: DependencyScope
): Array<DependencyChange & { sha: string }> {
  return changes.map((change) => ({
    sha,
    manifestPath: snapshot.manifestPath,
    packageManager: snapshot.packageManager,
    packageName: change.packageName,
    scope,
    changeType: change.changeType,
    previousSpec: change.previousSpec,
    currentSpec: change.currentSpec
  }));
}
