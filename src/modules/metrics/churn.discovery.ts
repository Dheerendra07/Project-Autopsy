import { simpleGit } from "simple-git";

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
  const git = simpleGit(repositoryPath);

  const output = await git.raw([
    "log",
    "--all",
    "--full-history",
    "--numstat",
    "--no-renames",
    "--format="
  ]);

  const metrics = new Map<string, FileChurnEvidence>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");

    if (!line) {
      continue;
    }

    const parsed = parseNumstatLine(line);

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
