import { simpleGit } from "simple-git";

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
  files: Array<{
    path: string;
    status: string;
  }>;
}

const RECORD_SEPARATOR = "";
const FIELD_SEPARATOR = "";

export async function discoverCommits(
  repositoryPath: string
): Promise<DiscoveredCommit[]> {
  const git = simpleGit(repositoryPath);

  const output = await git.raw([
    "log",
    "--all",
    "--full-history",
    "--date=iso-strict",
    "--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%s",
    "--name-status",
    "--no-renames"
  ]);

  const records = output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean);

  return records.map(parseCommitRecord);
}

export function parseCommitRecord(record: string): DiscoveredCommit {
  const lines = record.split(/?\n/);
  const header = lines.shift() ?? "";
  const fields = header.split(FIELD_SEPARATOR);

  if (fields.length !== 10) {
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

  if (!sha || !subject) {
    throw new Error("Git commit record is missing required fields.");
  }

  const files = lines
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.indexOf("\t");

      if (separatorIndex <= 0) {
        return null;
      }

      return {
        status: line.slice(0, separatorIndex),
        path: line.slice(separatorIndex + 1)
      };
    })
    .filter((file): file is { status: string; path: string } => file !== null);

  return {
    sha,
    parentShas: parentField ? parentField.split(" ") : [],
    authorName: authorName ?? "",
    authorEmail: authorEmail ?? "",
    authoredAt: authoredAt ?? "",
    committerName: committerName ?? "",
    committerEmail: committerEmail ?? "",
    committedAt: committedAt ?? "",
    subject,
    files
  };
}
