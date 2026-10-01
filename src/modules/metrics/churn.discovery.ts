import { simpleGit } from "simple-git";
import { createAnalysisGit } from "../analysis/analysis-git.js";

export const GIT_LOG_PAGE_SIZE = 500;

export interface FileChurnEvidence {
  path: string;
  additions: number;
  deletions: number;
  binaryChanges: number;
}

const NUMSTAT_LINE =
  /^(\d+|-)\t(\d+|-)\t(.+)$/;

export async function discoverFileChurn(
  repositoryPath: string
): Promise<FileChurnEvidence[]> {
  const git = createAnalysisGit(repositoryPath);

  const countOutput = await git.raw([
    "rev-list",
    "--all",
    "--count"
  ]);
  const commitCount = Number.parseInt(countOutput.trim(), 10);

  if (!Number.isSafeInteger(commitCount) || commitCount < 0) {
    throw new Error("Git returned an invalid commit count.");
  }

  const metrics = new Map<string, FileChurnEvidence>();

  for (
    let skip = 0;
    skip < commitCount;
    skip += GIT_LOG_PAGE_SIZE
  ) {
    const output = await git.raw([
      "log",
      "--all",
      "--full-history",
      "--reverse",
      "--numstat",
      "--no-renames",
      "--format=",
      "-z",
      `--skip=${skip}`,
      `--max-count=${GIT_LOG_PAGE_SIZE}`
    ]);

    for (const record of output.split("\0")) {
      if (!record) {
        continue;
      }

      const parsed = parseNumstatLine(record);

      if (!parsed) {
        continue;
      }

      const existing = metrics.get(parsed.path) ?? {
        path: parsed.path,
        additions: 0,
        deletions: 0,
        binaryChanges: 0
      };

      if (parsed.binary) {
        existing.binaryChanges += 1;
      } else {
        existing.additions += parsed.additions;
        existing.deletions += parsed.deletions;
      }

      metrics.set(parsed.path, existing);
    }
  }

  return [...metrics.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
}

export function parseNumstatLine(
  line: string
): {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
} | null {
  const match = line.match(NUMSTAT_LINE);

  if (!match) {
    return null;
  }

  const additionsField = match[1];
  const deletionsField = match[2];
  const path = match[3];

  if (!additionsField || !deletionsField || !path) {
    return null;
  }

  const binary =
    additionsField === "-" &&
    deletionsField === "-";

  if (binary) {
    return {
      path,
      additions: 0,
      deletions: 0,
      binary: true
    };
  }

  const additions = Number.parseInt(additionsField, 10);
  const deletions = Number.parseInt(deletionsField, 10);

  if (
    !Number.isSafeInteger(additions) ||
    !Number.isSafeInteger(deletions) ||
    additions < 0 ||
    deletions < 0
  ) {
    return null;
  }

  return {
    path,
    additions,
    deletions,
    binary: false
  };
}
