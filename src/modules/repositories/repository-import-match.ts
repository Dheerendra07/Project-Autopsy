export interface RepositoryImportCandidate {
  id: string;
  source_url: string | null;
  tracked_branch: string | null;
  default_branch: string | null;
}

export function normalizeRepositoryImportUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname
      .replace(/\.git\/?$/i, "")
      .replace(/\/+$/, "");

    return (
      parsed.protocol.toLowerCase() +
      "//" +
      parsed.host.toLowerCase() +
      parsed.pathname.toLowerCase()
    );
  } catch {
    return null;
  }
}

export function findMatchingRepositoryImport<T extends RepositoryImportCandidate>(
  repositories: readonly T[],
  sourceUrl: string,
  requestedBranch?: string
): T | null {
  const targetUrl = normalizeRepositoryImportUrl(sourceUrl);
  if (!targetUrl) return null;

  const branch = requestedBranch?.trim() || null;

  return (
    repositories.find((repository) => {
      const existingUrl = repository.source_url
        ? normalizeRepositoryImportUrl(repository.source_url)
        : null;

      if (existingUrl !== targetUrl) return false;

      if (branch) {
        return (
          repository.tracked_branch === branch ||
          (!repository.tracked_branch &&
            repository.default_branch === branch)
        );
      }

      return (
        !repository.tracked_branch ||
        repository.tracked_branch === repository.default_branch
      );
    }) ?? null
  );
}
