import { simpleGit } from "simple-git";
import { createAnalysisGit } from "../analysis/analysis-git.js";
import { env } from "../../config/env.js";

export interface DiscoveredCommitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface DiscoveredCommit {
  sha: string;
  parentShas: string[];
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  committerName: string;
  committerEmail: string;
  committedAt: string;
  subject: string;
  additions: number;
  deletions: number;
  files: DiscoveredCommitFile[];
}

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";
const NUL_SEPARATOR = "\0";
const GIT_LOG_PAGE_SIZE = 500;

export async function discoverCommits(
  repositoryPath: string,
  range?: {
    fromExclusive?: string;
    toInclusive?: string;
  }
): Promise<DiscoveredCommit[]> {
  const git = createAnalysisGit(repositoryPath);

  const rangeArguments =
    range?.fromExclusive && range.toInclusive
      ? [`${range.fromExclusive}..${range.toInclusive}`]
      : ["--all"];

  const commitCount = await countCommits(git, range);

  if (commitCount > env.MAX_ANALYZED_COMMITS) {
    throw new Error(
      `Repository history contains ${commitCount.toLocaleString()} commits; the configured analysis limit is ${env.MAX_ANALYZED_COMMITS.toLocaleString()}.`
    );
  }

  const commits: DiscoveredCommit[] = [];

  for (
    let skip = 0;
    skip < commitCount;
    skip += GIT_LOG_PAGE_SIZE
  ) {
    const output = await git.raw([
      "log",
      ...rangeArguments,
      "--full-history",
      "--reverse",
      "--date=iso-strict",
      "--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%s",
      "--name-status",
      "--no-renames",
      "-z",
      `--skip=${skip}`,
      `--max-count=${GIT_LOG_PAGE_SIZE}`
    ]);

    for (const record of output
      .split(RECORD_SEPARATOR)
      .map((value) =>
        value.replace(/^\r?\n/, "").replace(/\r?\n$/, "")
      )
      .filter(Boolean)) {
      commits.push(parseCommitRecord(record));
    }
  }

  const numstat = await discoverNumstat(git, range);

  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\r?\n/, "").replace(/\r?\n$/, ""))
    .filter(Boolean)
    .map(parseCommitRecord)
    .map((commit) => applyNumstat(commit, numstat.get(commit.sha)));
}

async function countCommits(
  git: ReturnType<typeof simpleGit>,
  range?: {
    fromExclusive?: string;
    toInclusive?: string;
  }
): Promise<number> {
  const rangeArguments =
    range?.fromExclusive && range.toInclusive
      ? [`${range.fromExclusive}..${range.toInclusive}`]
      : ["--all"];

  const output = await git.raw([
    "rev-list",
    ...rangeArguments,
    "--count"
  ]);

  const count = Number.parseInt(output.trim(), 10);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Git returned an invalid commit count.");
  }

  return count;
}

export function parseCommitRecord(record: string): DiscoveredCommit {
  const parts = record.split(NUL_SEPARATOR);
  const hasNulDelimitedFiles = parts.length > 1;
  const header = hasNulDelimitedFiles
    ? parts.shift() ?? ""
    : (record.split(/\r?\n/).shift() ?? "");
  const fields = header.split(FIELD_SEPARATOR);

  if (fields.length !== 9) {
    throw new Error("Git commit record has an unexpected format.");
  }

  const [
    sha,
    parentField,
    authorName,
    authorEmail,
    authoredAt,
    committerName,
    committerEmail,
    committedAt,
    subject
  ] = fields;

  if (!sha || !/^[0-9a-f]{7,64}$/i.test(sha)) {
    throw new Error("Git commit record is missing a valid SHA.");
  }

  if (!authoredAt || !committedAt) {
    throw new Error("Git commit record is missing required timestamps.");
  }

  const files = hasNulDelimitedFiles
    ? Array.from(
        { length: Math.floor(parts.length / 2) },
        (_unused, index) => {
          const status = (parts[index * 2] ?? "").replace(/^\r?\n/, "");
          const filePath = parts[index * 2 + 1] ?? "";

          if (!status || !filePath) {
            return null;
          }

          return {
            status,
            path: filePath,
            additions: 0,
            deletions: 0
          };
        }
      ).filter(
        (file): file is DiscoveredCommitFile =>
          file !== null && file.path.length > 0
      )
    : record
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.replace(/\r$/, ""))
        .filter((line) => line.length > 0)
        .map((line) => {
          const separatorIndex = line.indexOf("\t");

          if (separatorIndex <= 0) {
            return null;
          }

          return {
            status: line.slice(0, separatorIndex),
            path: line.slice(separatorIndex + 1),
            additions: 0,
            deletions: 0
          };
        })
        .filter(
          (file): file is DiscoveredCommitFile =>
            file !== null && file.path.length > 0
        );

  return {
    sha,
    parentShas: parentField ? parentField.split(" ") : [],
    authorName: authorName ?? "",
    authorEmail: authorEmail ?? "",
    authoredAt,
    committerName: committerName ?? "",
    committerEmail: committerEmail ?? "",
    committedAt,
    subject: subject ?? "",
    additions: 0,
    deletions: 0,
    files
  };
}

async function discoverNumstat(
  git: ReturnType<typeof simpleGit>,
  range?: {
    fromExclusive?: string;
    toInclusive?: string;
  }
): Promise<Map<string, Map<string, { additions: number; deletions: number }>>> {
  const rangeArguments =
    range?.fromExclusive && range.toInclusive
      ? [`${range.fromExclusive}..${range.toInclusive}`]
      : ["--all"];

  const output = await git.raw([
    "log",
    ...rangeArguments,
    "--full-history",
    "--reverse",
    "--format=%x1e%H",
    "--numstat",
    "--no-renames",
    "-z"
  ]);

  const result = new Map<string, Map<string, { additions: number; deletions: number }>>();

  for (const rawRecord of output.split(RECORD_SEPARATOR)) {
    const record = rawRecord.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (!record) continue;

    const parts = record.split(NUL_SEPARATOR);
    const sha = (parts.shift() ?? "").trim();

    if (!sha || !/^[0-9a-f]{7,64}$/i.test(sha)) {
      continue;
    }

    const files = new Map<string, { additions: number; deletions: number }>();

    for (const rawPart of parts) {
      const line = rawPart.replace(/^\r?\n/, "").replace(/\r$/, "");

      if (!line) {
        continue;
      }

      const firstTab = line.indexOf("\t");
      const secondTab =
        firstTab >= 0
          ? line.indexOf("\t", firstTab + 1)
          : -1;

      if (firstTab <= 0 || secondTab <= firstTab) {
        continue;
      }

      const additionsField = line.slice(0, firstTab);
      const deletionsField = line.slice(firstTab + 1, secondTab);
      const filePath = line.slice(secondTab + 1);

      if (!additionsField || !deletionsField || !filePath) {
        continue;
      }

      if (additionsField === "-" && deletionsField === "-") {
        files.set(filePath, { additions: 0, deletions: 0 });
        continue;
      }

      const additions = Number.parseInt(additionsField, 10);
      const deletions = Number.parseInt(deletionsField, 10);

      if (
        Number.isSafeInteger(additions) &&
        Number.isSafeInteger(deletions) &&
        additions >= 0 &&
        deletions >= 0
      ) {
        files.set(filePath, { additions, deletions });
      }
    }

    result.set(sha, files);
  }

  return result;
}

export function applyNumstat(
  commit: DiscoveredCommit,
  stats: Map<string, { additions: number; deletions: number }> | undefined
): DiscoveredCommit {
  if (!stats) {
    return commit;
  }

  let additions = 0;
  let deletions = 0;

  const files = commit.files.map((file) => {
    const fileStats = stats.get(file.path);

    if (!fileStats) {
      return file;
    }

    additions += fileStats.additions;
    deletions += fileStats.deletions;

    return {
      ...file,
      additions: fileStats.additions,
      deletions: fileStats.deletions
    };
  });

  return {
    ...commit,
    additions,
    deletions,
    files
  };
}
