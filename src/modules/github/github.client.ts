import { env } from "../../config/env.js";

// Minimal GitHub OAuth + REST client. Base URLs are configurable so tests (and
// GitHub Enterprise-style hosts) can point at another server; `fetchImpl` is
// injectable for unit tests.

export type FetchLike = typeof fetch;

export const GITHUB_SIGN_IN_SCOPES = ["read:user", "user:email"] as const;
export const GITHUB_PRIVATE_REPO_SCOPES = [...GITHUB_SIGN_IN_SCOPES, "repo"] as const;

const TIMEOUT_MS = 15_000;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | "GITHUB_TOKEN_INVALID"
      | "GITHUB_NOT_FOUND"
      | "GITHUB_RATE_LIMITED"
      | "GITHUB_OAUTH_FAILED"
      | "GITHUB_UNAVAILABLE"
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubProfile {
  id: number;
  login: string;
  avatar_url: string | null;
  name: string | null;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  description: string | null;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  owner: { login: string };
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildAuthorizeUrl(options: {
  state: string;
  redirectUri: string;
  scopes: readonly string[];
}): string {
  const url = new URL(trimSlash(env.GITHUB_OAUTH_BASE_URL) + "/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", options.scopes.join(" "));
  url.searchParams.set("state", options.state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

async function timedFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    throw new GitHubApiError("GitHub could not be reached.", 502, "GITHUB_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  fetchImpl: FetchLike = fetch
): Promise<{ accessToken: string; scopes: string[] }> {
  const response = await timedFetch(
    fetchImpl,
    trimSlash(env.GITHUB_OAUTH_BASE_URL) + "/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "project-autopsy"
      },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
      })
    }
  );

  const body = (await response.json().catch(() => null)) as
    | { access_token?: unknown; scope?: unknown; error?: unknown }
    | null;

  if (!response.ok || !body || typeof body.access_token !== "string" || !body.access_token) {
    throw new GitHubApiError(
      "GitHub did not accept the sign-in request. Try again.",
      400,
      "GITHUB_OAUTH_FAILED"
    );
  }

  const scopes = typeof body.scope === "string"
    ? body.scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];

  return { accessToken: body.access_token, scopes };
}

async function apiGet<T>(
  path: string,
  token: string,
  fetchImpl: FetchLike
): Promise<{ body: T; headers: Headers }> {
  const response = await timedFetch(fetchImpl, trimSlash(env.GITHUB_API_BASE_URL) + path, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: "Bearer " + token,
      "x-github-api-version": "2022-11-28",
      "user-agent": "project-autopsy"
    }
  });

  if (response.status === 401) {
    throw new GitHubApiError(
      "The GitHub connection has expired or was revoked. Reconnect GitHub.",
      401,
      "GITHUB_TOKEN_INVALID"
    );
  }

  if (response.status === 404) {
    throw new GitHubApiError(
      "Repository not found, or this GitHub connection cannot access it.",
      404,
      "GITHUB_NOT_FOUND"
    );
  }

  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || response.status === 429) {
      throw new GitHubApiError(
        "GitHub's API rate limit was reached. Try again in a few minutes.",
        429,
        "GITHUB_RATE_LIMITED"
      );
    }
    throw new GitHubApiError(
      "GitHub denied access to this resource.",
      404,
      "GITHUB_NOT_FOUND"
    );
  }

  if (!response.ok) {
    throw new GitHubApiError("GitHub returned an unexpected error.", 502, "GITHUB_UNAVAILABLE");
  }

  return { body: (await response.json()) as T, headers: response.headers };
}

export async function fetchProfile(token: string, fetchImpl: FetchLike = fetch): Promise<GitHubProfile> {
  return (await apiGet<GitHubProfile>("/user", token, fetchImpl)).body;
}

export async function fetchVerifiedEmail(
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  const { body } = await apiGet<GitHubEmail[]>("/user/emails", token, fetchImpl);
  if (!Array.isArray(body)) return null;
  const verified = body.filter((e) => e && e.verified && typeof e.email === "string");
  const chosen = verified.find((e) => e.primary) ?? verified.find((e) => !/noreply\.github\.com$/i.test(e.email)) ?? verified[0];
  return chosen ? chosen.email.trim().toLowerCase() : null;
}

export async function listRepositories(
  token: string,
  page: number,
  fetchImpl: FetchLike = fetch
): Promise<{ repositories: GitHubRepository[]; hasMore: boolean }> {
  const { body, headers } = await apiGet<GitHubRepository[]>(
    "/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member&page=" +
      String(page),
    token,
    fetchImpl
  );
  const link = headers.get("link") ?? "";
  return {
    repositories: Array.isArray(body) ? body : [],
    hasMore: /rel="next"/.test(link)
  };
}

export async function getRepository(
  token: string,
  fullName: string,
  fetchImpl: FetchLike = fetch
): Promise<GitHubRepository> {
  const [owner, name] = fullName.split("/");
  return (
    await apiGet<GitHubRepository>(
      "/repos/" + encodeURIComponent(owner ?? "") + "/" + encodeURIComponent(name ?? ""),
      token,
      fetchImpl
    )
  ).body;
}
