import { randomUUID } from "node:crypto";
import type { Request } from "express";

import { env } from "../../config/env.js";
import type { StoredUser } from "../auth/auth.persistence.js";
import { GITHUB_PRIVATE_REPO_SCOPES, GITHUB_SIGN_IN_SCOPES } from "./github.client.js";

export const OAUTH_STATE_COOKIE = "autopsy_github_oauth";
export const OAUTH_STATE_TTL_SECONDS = 600;
export const CALLBACK_PATH = "/api/auth/github/callback";

export type OAuthIntent = "signin" | "connect";
export type RepoAccess = "public" | "private";

export interface OAuthState {
  state: string;
  intent: OAuthIntent;
  access: RepoAccess;
  next: string;
  // For "connect": the account that started the flow. The callback must run in
  // the same signed-in session.
  userId: string | null;
  issuedAt: number;
}

export class GitHubFlowError extends Error {
  constructor(
    readonly code:
      | "GITHUB_STATE_INVALID"
      | "GITHUB_EMAIL_UNVERIFIED"
      | "GITHUB_ALREADY_LINKED"
      | "GITHUB_ACCOUNT_DISABLED"
      | "GITHUB_SESSION_REQUIRED",
    message: string
  ) {
    super(message);
    this.name = "GitHubFlowError";
  }
}

// Only in-app hash routes are allowed as post-sign-in destinations.
export function safeNextHash(value: unknown): string {
  const next = typeof value === "string" ? value : "";
  return /^#\/(projects|account|p\/[0-9a-f-]{36}(\/[a-z]+)?)(\?[A-Za-z0-9=&%._-]*)?$/i.test(next) && next.length <= 300
    ? next
    : "";
}

export function scopesFor(access: RepoAccess): readonly string[] {
  return access === "private" ? GITHUB_PRIVATE_REPO_SCOPES : GITHUB_SIGN_IN_SCOPES;
}

export function hasPrivateRepoAccess(scopes: string[]): boolean {
  return scopes.includes("repo");
}

export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeOAuthState(value: string | undefined, now = Date.now()): OAuthState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<OAuthState>;
    if (
      typeof parsed.state !== "string" || parsed.state.length < 32 ||
      (parsed.intent !== "signin" && parsed.intent !== "connect") ||
      (parsed.access !== "public" && parsed.access !== "private") ||
      typeof parsed.issuedAt !== "number" ||
      now - parsed.issuedAt > OAUTH_STATE_TTL_SECONDS * 1000 ||
      parsed.issuedAt > now + 60_000
    ) {
      return null;
    }
    return {
      state: parsed.state,
      intent: parsed.intent,
      access: parsed.access,
      next: safeNextHash(parsed.next),
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      issuedAt: parsed.issuedAt
    };
  } catch {
    return null;
  }
}

function requestOrigin(request: Request): string {
  return request.protocol + "://" + request.get("host");
}

export function callbackUrl(request: Request): string {
  return env.GITHUB_OAUTH_CALLBACK_URL ?? requestOrigin(request) + CALLBACK_PATH;
}

// The browser app is served by the same service; when an explicit callback URL
// is configured, its origin is the public origin of the app.
export function appBaseUrl(request: Request): string {
  return env.GITHUB_OAUTH_CALLBACK_URL
    ? new URL(env.GITHUB_OAUTH_CALLBACK_URL).origin
    : requestOrigin(request);
}

export interface AccountDeps {
  getUserById(id: string): Promise<StoredUser | null>;
  getUserByGitHubId(githubUserId: number): Promise<StoredUser | null>;
  getUserByEmail(email: string): Promise<StoredUser | null>;
  linkGitHubIdentity(userId: string, githubUserId: number): Promise<boolean>;
  createGitHubUser(id: string, email: string, githubUserId: number): Promise<StoredUser>;
}

// Decides which account a GitHub identity signs into:
//   connect → link to the signed-in account (refusing an identity linked elsewhere)
//   signin  → existing GitHub-linked account, else the account with the same
//             GitHub-verified email (linked now), else a new password-less account.
export async function resolveAccount(
  input: {
    intent: OAuthIntent;
    sessionUserId: string | null;
    githubUserId: number;
    verifiedEmail: string | null;
  },
  deps: AccountDeps
): Promise<{ user: StoredUser; created: boolean }> {
  if (input.intent === "connect") {
    if (!input.sessionUserId) {
      throw new GitHubFlowError("GITHUB_SESSION_REQUIRED", "Sign in again, then connect GitHub.");
    }
    const user = await deps.getUserById(input.sessionUserId);
    if (!user || user.disabled_at) {
      throw new GitHubFlowError("GITHUB_SESSION_REQUIRED", "Sign in again, then connect GitHub.");
    }
    const linked = await deps.linkGitHubIdentity(user.id, input.githubUserId);
    if (!linked) {
      throw new GitHubFlowError(
        "GITHUB_ALREADY_LINKED",
        "This GitHub account is already linked to a different Project Autopsy account."
      );
    }
    return { user, created: false };
  }

  const byGitHub = await deps.getUserByGitHubId(input.githubUserId);
  if (byGitHub) {
    if (byGitHub.disabled_at) {
      throw new GitHubFlowError("GITHUB_ACCOUNT_DISABLED", "This account is disabled.");
    }
    return { user: byGitHub, created: false };
  }

  if (!input.verifiedEmail) {
    throw new GitHubFlowError(
      "GITHUB_EMAIL_UNVERIFIED",
      "Your GitHub account has no verified email address. Verify one on GitHub, then try again."
    );
  }

  const byEmail = await deps.getUserByEmail(input.verifiedEmail);
  if (byEmail) {
    if (byEmail.disabled_at) {
      throw new GitHubFlowError("GITHUB_ACCOUNT_DISABLED", "This account is disabled.");
    }
    const linked = await deps.linkGitHubIdentity(byEmail.id, input.githubUserId);
    if (!linked) {
      throw new GitHubFlowError(
        "GITHUB_ALREADY_LINKED",
        "This email's account is already linked to a different GitHub account."
      );
    }
    return { user: byEmail, created: false };
  }

  const user = await deps.createGitHubUser(randomUUID(), input.verifiedEmail, input.githubUserId);
  return { user, created: true };
}

export const FULL_NAME_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
