import path from "node:path";

export const MAX_PUBLIC_ANALYSIS_ERROR_LENGTH = 1_000;

function safeResolvedPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return path.resolve(value);
  } catch {
    return null;
  }
}

export function sanitizePublicAnalysisErrorMessage(
  message: string | null | undefined,
  repositoryStoragePath: string | null | undefined
): string | null {
  if (!message) {
    return null;
  }

  const candidates = [
    repositoryStoragePath,
    process.env.REPOSITORY_STORAGE_PATH,
    process.cwd()
  ]
    .flatMap((value) => [value, safeResolvedPath(value)])
    .filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index
    );

  let sanitized = message
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  for (const candidate of candidates) {
    sanitized = sanitized.split(candidate).join("<managed-path>");
  }

  if (sanitized.length > MAX_PUBLIC_ANALYSIS_ERROR_LENGTH) {
    return (
      sanitized.slice(0, MAX_PUBLIC_ANALYSIS_ERROR_LENGTH - 1).trimEnd() +
      "…"
    );
  }

  return sanitized || null;
}
