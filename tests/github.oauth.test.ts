import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubFlowError,
  decodeOAuthState,
  encodeOAuthState,
  hasPrivateRepoAccess,
  resolveAccount,
  safeNextHash,
  scopesFor,
  type AccountDeps
} from "../src/modules/github/github.service.js";
import type { StoredUser } from "../src/modules/auth/auth.persistence.js";
import { parseEnvironment } from "../src/config/env.js";

test("GitHub OAuth settings validate as a pair and require encryption in production", () => {
  const base = { DATABASE_URL: "postgresql://a:b@localhost/x" } as NodeJS.ProcessEnv;
  const ok = parseEnvironment({ ...base, GITHUB_OAUTH_CLIENT_ID: "", GITHUB_OAUTH_CLIENT_SECRET: "", GITHUB_OAUTH_CALLBACK_URL: "" });
  assert.equal(ok.GITHUB_OAUTH_CLIENT_ID, undefined, "empty values mean not configured");
  assert.equal(ok.GITHUB_API_BASE_URL, "https://api.github.com");

  assert.throws(() => parseEnvironment({ ...base, GITHUB_OAUTH_CLIENT_ID: "id" }), /configured together/);
  assert.throws(() => parseEnvironment({ ...base, GITHUB_OAUTH_CLIENT_SECRET: "secret" }), /configured together/);
  assert.throws(
    () => parseEnvironment({ ...base, NODE_ENV: "production", GITHUB_OAUTH_CLIENT_ID: "id", GITHUB_OAUTH_CLIENT_SECRET: "secret" }),
    /REPOSITORY_CREDENTIAL_ENCRYPTION_KEY is required when GitHub sign-in is configured/
  );
  assert.throws(() => parseEnvironment({ ...base, GITHUB_OAUTH_CALLBACK_URL: "not a url" }));
});

function user(id: string, email: string, disabled = false): StoredUser {
  return {
    id,
    email,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_login_at: null,
    disabled_at: disabled ? "2026-01-02T00:00:00.000Z" : null,
    email_verified_at: "2026-01-01T00:00:00.000Z"
  };
}

function deps(state: {
  users: StoredUser[];
  links: Map<string, number>;
}): AccountDeps & { created: StoredUser[] } {
  const created: StoredUser[] = [];
  return {
    created,
    async getUserById(id) { return state.users.find((u) => u.id === id) ?? null; },
    async getUserByGitHubId(gh) {
      for (const [userId, linked] of state.links) if (linked === gh) return state.users.find((u) => u.id === userId) ?? null;
      return null;
    },
    async getUserByEmail(email) { return state.users.find((u) => u.email === email) ?? null; },
    async linkGitHubIdentity(userId, gh) {
      for (const [other, linked] of state.links) if (linked === gh && other !== userId) return false;
      const current = state.links.get(userId);
      if (current !== undefined && current !== gh) return false;
      state.links.set(userId, gh);
      return true;
    },
    async createGitHubUser(id, email, gh) {
      const u = user(id, email);
      state.users.push(u);
      state.links.set(id, gh);
      created.push(u);
      return u;
    }
  };
}

const STATE = "s".repeat(43);

test("OAuth state round-trips and rejects tampering, expiry and bad shapes", () => {
  const now = Date.now();
  const encoded = encodeOAuthState({ state: STATE, intent: "signin", access: "public", next: "#/projects", userId: null, issuedAt: now });
  assert.deepEqual(decodeOAuthState(encoded, now), { state: STATE, intent: "signin", access: "public", next: "#/projects", userId: null, issuedAt: now });

  assert.equal(decodeOAuthState(encoded, now + 11 * 60_000), null, "state expires after ten minutes");
  assert.equal(decodeOAuthState(undefined), null);
  assert.equal(decodeOAuthState("not-base64-json"), null);
  assert.equal(decodeOAuthState(encodeOAuthState({ state: "short", intent: "signin", access: "public", next: "", userId: null, issuedAt: now }), now), null);
  const badIntent = Buffer.from(JSON.stringify({ state: STATE, intent: "admin", access: "public", issuedAt: now })).toString("base64url");
  assert.equal(decodeOAuthState(badIntent, now), null);

  const unsafeNext = encodeOAuthState({ state: STATE, intent: "signin", access: "public", next: "https://evil.example/", userId: null, issuedAt: now });
  assert.equal(decodeOAuthState(unsafeNext, now)?.next, "", "external redirect targets are dropped");
});

test("post-sign-in destinations are limited to in-app routes", () => {
  assert.equal(safeNextHash("#/projects"), "#/projects");
  assert.equal(safeNextHash("#/projects?url=https%3A%2F%2Fgithub.com%2Fa%2Fb"), "#/projects?url=https%3A%2F%2Fgithub.com%2Fa%2Fb");
  assert.equal(safeNextHash("#/p/11111111-2222-3333-4444-555555555555/report"), "#/p/11111111-2222-3333-4444-555555555555/report");
  for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "#/p/not-a-uuid", "#/projects?x=<script>", 42, null]) {
    assert.equal(safeNextHash(bad), "", String(bad));
  }
});

test("public access requests only profile and email scopes; private adds repo", () => {
  assert.deepEqual([...scopesFor("public")], ["read:user", "user:email"]);
  assert.deepEqual([...scopesFor("private")], ["read:user", "user:email", "repo"]);
  assert.equal(hasPrivateRepoAccess(["read:user", "repo"]), true);
  assert.equal(hasPrivateRepoAccess(["read:user", "public_repo"]), false);
});

test("sign-in reuses the GitHub-linked account", async () => {
  const state = { users: [user("u1", "a@example.com")], links: new Map([["u1", 7]]) };
  const d = deps(state);
  const result = await resolveAccount({ intent: "signin", sessionUserId: null, githubUserId: 7, verifiedEmail: "other@example.com" }, d);
  assert.equal(result.user.id, "u1");
  assert.equal(result.created, false);
  assert.equal(d.created.length, 0);
});

test("sign-in links an existing account with the same GitHub-verified email", async () => {
  const state = { users: [user("u1", "a@example.com")], links: new Map<string, number>() };
  const result = await resolveAccount({ intent: "signin", sessionUserId: null, githubUserId: 7, verifiedEmail: "a@example.com" }, deps(state));
  assert.equal(result.user.id, "u1");
  assert.equal(state.links.get("u1"), 7);
});

test("sign-in creates a password-less account for a new GitHub identity", async () => {
  const state = { users: [] as StoredUser[], links: new Map<string, number>() };
  const d = deps(state);
  const result = await resolveAccount({ intent: "signin", sessionUserId: null, githubUserId: 9, verifiedEmail: "new@example.com" }, d);
  assert.equal(result.created, true);
  assert.equal(result.user.email, "new@example.com");
  assert.equal(d.created.length, 1);
});

test("sign-in refuses identities without a verified email and disabled accounts", async () => {
  await assert.rejects(
    resolveAccount({ intent: "signin", sessionUserId: null, githubUserId: 9, verifiedEmail: null }, deps({ users: [], links: new Map() })),
    (e: unknown) => e instanceof GitHubFlowError && e.code === "GITHUB_EMAIL_UNVERIFIED"
  );
  await assert.rejects(
    resolveAccount({ intent: "signin", sessionUserId: null, githubUserId: 7, verifiedEmail: "a@example.com" }, deps({ users: [user("u1", "a@example.com", true)], links: new Map([["u1", 7]]) })),
    (e: unknown) => e instanceof GitHubFlowError && e.code === "GITHUB_ACCOUNT_DISABLED"
  );
});

test("an email already linked to another GitHub identity is not silently re-linked", async () => {
  const state = { users: [user("u1", "a@example.com")], links: new Map([["u1", 1]]) };
  await assert.rejects(
    resolveAccount({ intent: "signin", sessionUserId: null, githubUserId: 2, verifiedEmail: "a@example.com" }, deps(state)),
    (e: unknown) => e instanceof GitHubFlowError && e.code === "GITHUB_ALREADY_LINKED"
  );
  assert.equal(state.links.get("u1"), 1);
});

test("connect links to the signed-in account and refuses identities owned elsewhere", async () => {
  const state = { users: [user("u1", "a@example.com"), user("u2", "b@example.com")], links: new Map([["u2", 5]]) };
  const ok = await resolveAccount({ intent: "connect", sessionUserId: "u1", githubUserId: 8, verifiedEmail: null }, deps(state));
  assert.equal(ok.user.id, "u1");
  assert.equal(state.links.get("u1"), 8);

  await assert.rejects(
    resolveAccount({ intent: "connect", sessionUserId: "u1", githubUserId: 5, verifiedEmail: null }, deps(state)),
    (e: unknown) => e instanceof GitHubFlowError && e.code === "GITHUB_ALREADY_LINKED"
  );
  await assert.rejects(
    resolveAccount({ intent: "connect", sessionUserId: null, githubUserId: 8, verifiedEmail: null }, deps(state)),
    (e: unknown) => e instanceof GitHubFlowError && e.code === "GITHUB_SESSION_REQUIRED"
  );
});
