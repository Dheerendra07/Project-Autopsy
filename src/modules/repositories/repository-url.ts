import { z } from "zod";

const repositoryUrlSchema = z.string().url();

export class RepositoryUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryUrlValidationError";
  }
}

const ALLOWED_GIT_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org"
]);

export function validateRemoteRepositoryUrl(value: string): URL {
  const parsed = repositoryUrlSchema.parse(value);
  const url = new URL(parsed);

  if (url.protocol !== "https:") {
    throw new RepositoryUrlValidationError("Only HTTPS repository URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();

  if (!ALLOWED_GIT_HOSTS.has(hostname)) {
    throw new RepositoryUrlValidationError("Repository host is not supported.");
  }

  let segments: string[];
  try {
    segments = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);
  } catch {
    throw new RepositoryUrlValidationError("Repository path contains invalid URL encoding.");
  }

  const expectedMinimumSegments = 2;

  if (segments.length < expectedMinimumSegments) {
    throw new RepositoryUrlValidationError("Repository URL must include an owner/group and repository name.");
  }

  if ((hostname === "github.com" || hostname === "bitbucket.org") && segments.length !== 2) {
    throw new RepositoryUrlValidationError("Repository URL has an invalid path for its Git provider.");
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new RepositoryUrlValidationError("Repository URL contains an invalid path segment.");
  }

  if (url.username || url.password) {
    throw new RepositoryUrlValidationError(
      "Repository credentials must not be embedded in the repository URL."
    );
  }

  if (url.search || url.hash) {
    throw new RepositoryUrlValidationError(
      "Repository URLs must not contain query parameters or fragments."
    );
  }

  url.hostname = hostname;
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url;
}
