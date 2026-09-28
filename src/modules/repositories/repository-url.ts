import { z } from "zod";

const repositoryUrlSchema = z.string().url();

const ALLOWED_GIT_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org"
]);

export function validateRemoteRepositoryUrl(value: string): URL {
  const parsed = repositoryUrlSchema.parse(value);
  const url = new URL(parsed);

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS repository URLs are allowed.");
  }

  if (!ALLOWED_GIT_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Repository host is not supported.");
  }

  if (url.username || url.password) {
    throw new Error(
      "Repository credentials must not be embedded in the repository URL."
    );
  }

  if (url.search || url.hash) {
    throw new Error(
      "Repository URLs must not contain query parameters or fragments."
    );
  }

  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url;
}
