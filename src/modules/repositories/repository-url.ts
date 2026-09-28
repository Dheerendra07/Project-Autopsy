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

  url.username = "";
  url.password = "";

  return url;
}
