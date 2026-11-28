// End-to-end GitHub sign-in and repository import against the real app and
// database, with a local fake GitHub serving both the OAuth endpoints and the
// REST API. Requires PostgreSQL and Redis like tests/app.contract.test.ts.

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

const run = randomUUID().slice(0, 8);
const ALICE = { id: 900_000_000 + Math.floor(Math.random() * 90_000_000), login: "alice-" + run, email: "alice-" + run + "@example.com" };
const BOB_EMAIL = "bob-" + run + "@example.com";
const BOB = { id: ALICE.id + 1, login: "bob-" + run, email: BOB_EMAIL };

const tokens: Record<string, { profile: typeof ALICE; scope: string }> = {
  "tok-alice": { profile: ALICE, scope: "read:user,user:email,repo" },
  "tok-bob": { profile: BOB, scope: "read:user,user:email" }
};
const codes: Record<string, string> = { "code-alice": "tok-alice", "code-bob": "tok-bob" };
let revoked = false;

function repo(name: string, priv: boolean) {
  return {
    id: name.length,
    name,
    full_name: "octo-" + run + "/" + name,
    private: priv,
    fork: false,
    archived: false,
    description: "Fixture " + name,
    default_branch: "main",
    pushed_at: "2026-11-01T00:00:00Z",
    language: "TypeScript",
    stargazers_count: 3,
    html_url: "https://github.com/octo-" + run + "/" + name,
    owner: { login: "octo-" + run }
  };
}
const REPOS = [repo("public-repo", false), repo("private-repo", true)];

const fakeGitHub: Server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as { code?: string; client_secret?: string };
      const token = body.code ? codes[body.code] : undefined;
      if (!token || body.client_secret !== "test-secret") return send(200, { error: "bad_verification_code" });
      send(200, { access_token: token, token_type: "bearer", scope: tokens[token]!.scope });
    });
    return;
  }
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const account = tokens[token];
  if (!account || revoked) return send(401, { message: "Bad credentials" });
  if (url.pathname === "/user") return send(200, { id: account.profile.id, login: account.profile.login, avatar_url: null, name: null });
  if (url.pathname === "/user/emails") return send(200, [{ email: account.profile.email, primary: true, verified: true }]);
  if (url.pathname === "/user/repos") {
    const visible = account.scope.includes("repo") ? REPOS : REPOS.filter((r) => !r.private);
    return send(200, url.searchParams.get("page") === "1" ? visible : []);
  }
  const match = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (match) {
    const found = REPOS.find((r) => r.full_name === match[1] + "/" + match[2]);
    if (!found || (found.private && !account.scope.includes("repo"))) return send(404, { message: "Not Found" });
    return send(200, found);
  }
  send(404, { message: "Not Found" });
});

let app: Server;
let base = "";
const createdUsers = new Set<string>();

function cookieValue(setCookie: string[], name: string): string {
  for (const c of setCookie) {
    const m = c.match(new RegExp("^" + name + "=([^;]*)"));
    if (m) return m[1]!;
  }
  return "";
}

async function signInWithGitHub(code: string, extraCookie = ""): Promise<{ location: string; cookie: string; csrf: string }> {
  const start = await fetch(base + "/api/auth/github/start?intent=signin&next=%23%2Fprojects", { redirect: "manual", headers: extraCookie ? { cookie: extraCookie } : {} });
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get("location") ?? "");
  const state = authorize.searchParams.get("state") ?? "";
  const stateCookie = cookieValue(start.headers.getSetCookie(), "autopsy_github_oauth");
  assert.ok(state && stateCookie);

  const callback = await fetch(base + "/api/auth/github/callback?code=" + code + "&state=" + encodeURIComponent(state), {
    redirect: "manual",
    headers: { cookie: "autopsy_github_oauth=" + stateCookie + (extraCookie ? "; " + extraCookie : "") }
  });
  assert.equal(callback.status, 302);
  const cookies = callback.headers.getSetCookie();
  const session = cookieValue(cookies, "autopsy_session");
  const csrf = cookieValue(cookies, "autopsy_csrf");
  return {
    location: callback.headers.get("location") ?? "",
    cookie: session ? "autopsy_session=" + session + "; autopsy_csrf=" + csrf : "",
    csrf: decodeURIComponent(csrf)
  };
}

before(async () => {
  await new Promise<void>((resolve) => fakeGitHub.listen(0, "127.0.0.1", resolve));
  const ghBase = "http://127.0.0.1:" + (fakeGitHub.address() as AddressInfo).port;

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://autopsy:autopsy_dev_password@127.0.0.1:5432/project_autopsy";
  process.env.REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
  process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
  process.env.API_RATE_LIMIT_MAX_REQUESTS = "1000";
  process.env.API_RATE_LIMIT_HEAVY_MAX_REQUESTS = "1000";
  process.env.GITHUB_OAUTH_CLIENT_ID = "test-client";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "test-secret";
  process.env.GITHUB_OAUTH_BASE_URL = ghBase;
  process.env.GITHUB_API_BASE_URL = ghBase;
  process.env.REPOSITORY_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  const { app: expressApp } = await import("../src/app.js");
  app = await new Promise<Server>((resolve, reject) => {
    const instance = expressApp.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  base = "http://127.0.0.1:" + (app.address() as AddressInfo).port;
});

after(async () => {
  const [{ db }, { redis }] = await Promise.all([import("../src/config/database.js"), import("../src/config/redis.js")]);
  const ids = [...createdUsers];
  const byEmail = await db.query<{ id: string }>("SELECT id FROM users WHERE email = ANY($1)", [[ALICE.email, BOB_EMAIL]]);
  byEmail.rows.forEach((r) => ids.push(r.id));
  if (ids.length) {
    await db.query("DELETE FROM repositories WHERE owner_user_id = ANY($1)", [ids]);
    await db.query("DELETE FROM users WHERE id = ANY($1)", [ids]);
  }
  app.closeAllConnections();
  await new Promise<void>((resolve) => app.close(() => resolve()));
  fakeGitHub.closeAllConnections();
  await new Promise<void>((resolve) => fakeGitHub.close(() => resolve()));
  await Promise.allSettled([db.end(), redis.quit()]);
});

test("providers endpoint reports GitHub as enabled", async () => {
  const body = await (await fetch(base + "/api/auth/providers")).json() as { providers: { github: { enabled: boolean } } };
  assert.equal(body.providers.github.enabled, true);
});

test("start redirects to GitHub with a state cookie and only the sign-in scopes", async () => {
  const response = await fetch(base + "/api/auth/github/start?intent=signin", { redirect: "manual" });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.pathname, "/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "test-client");
  assert.equal(location.searchParams.get("scope"), "read:user user:email");
  assert.match(location.searchParams.get("redirect_uri") ?? "", /\/api\/auth\/github\/callback$/);
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith("autopsy_github_oauth="));
  assert.ok(cookie && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\/api\/auth\/github/.test(cookie));
});

test("a callback with a forged or missing state is rejected without a session", async () => {
  const response = await fetch(base + "/api/auth/github/callback?code=code-alice&state=forged", { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /#\/signin\?oauth=GITHUB_STATE_INVALID$/);
  assert.equal(cookieValue(response.headers.getSetCookie(), "autopsy_session"), "");
});

test("a denied authorization returns to sign-in with a clear code", async () => {
  const start = await fetch(base + "/api/auth/github/start", { redirect: "manual" });
  const stateCookie = cookieValue(start.headers.getSetCookie(), "autopsy_github_oauth");
  const response = await fetch(base + "/api/auth/github/callback?error=access_denied&state=x", {
    redirect: "manual",
    headers: { cookie: "autopsy_github_oauth=" + stateCookie }
  });
  assert.match(response.headers.get("location") ?? "", /oauth=GITHUB_CANCELLED$/);
});

test("GitHub sign-in creates one account, lists repositories and imports in one click", async () => {
  const first = await signInWithGitHub("code-alice");
  assert.match(first.location, /\/#\/projects\?github=connected$/);
  assert.ok(first.cookie, "a session is started");

  const me = await (await fetch(base + "/api/auth/me", { headers: { cookie: first.cookie } })).json() as { user: { id: string; email: string } };
  assert.equal(me.user.email, ALICE.email);
  createdUsers.add(me.user.id);

  const again = await signInWithGitHub("code-alice");
  const me2 = await (await fetch(base + "/api/auth/me", { headers: { cookie: again.cookie } })).json() as { user: { id: string } };
  assert.equal(me2.user.id, me.user.id, "signing in again reuses the same account");

  const status = await (await fetch(base + "/api/github/status", { headers: { cookie: first.cookie } })).json() as {
    connected: boolean; hasPassword: boolean; github: { login: string; privateRepositories: boolean };
  };
  assert.equal(status.connected, true);
  assert.equal(status.hasPassword, false);
  assert.equal(status.github.login, ALICE.login);
  assert.equal(status.github.privateRepositories, true);
  assert.equal(JSON.stringify(status).includes("tok-alice"), false, "the token is never returned");

  const repos = await (await fetch(base + "/api/github/repos?page=1", { headers: { cookie: first.cookie } })).json() as {
    repositories: Array<{ fullName: string; private: boolean; importedRepositoryId: string | null }>;
  };
  assert.deepEqual(repos.repositories.map((r) => r.fullName), REPOS.map((r) => r.full_name));
  assert.ok(repos.repositories.every((r) => r.importedRepositoryId === null));

  const headers = { cookie: first.cookie, "x-autopsy-csrf-token": first.csrf, "content-type": "application/json" };
  const imported = await fetch(base + "/api/github/import", { method: "POST", headers, body: JSON.stringify({ fullName: REPOS[0]!.full_name }) });
  assert.equal(imported.status, 202);
  const importBody = await imported.json() as { repository: { id: string; source: string; accessConfigured: boolean }; analysis: { status: string } };
  assert.equal(importBody.repository.source, "https://github.com/" + REPOS[0]!.full_name);
  assert.equal(importBody.repository.accessConfigured, false, "public repositories are cloned without a token");
  assert.equal(importBody.analysis.status, "queued");

  const privateImport = await (await fetch(base + "/api/github/import", { method: "POST", headers, body: JSON.stringify({ fullName: REPOS[1]!.full_name }) })).json() as {
    repository: { accessConfigured: boolean };
  };
  assert.equal(privateImport.repository.accessConfigured, true, "private repositories store the connection token encrypted");

  const duplicate = await fetch(base + "/api/github/import", { method: "POST", headers, body: JSON.stringify({ fullName: REPOS[0]!.full_name }) });
  assert.equal(duplicate.status, 409);
  const dupBody = await duplicate.json() as { error: { code: string; repositoryId: string } };
  assert.equal(dupBody.error.code, "REPOSITORY_ALREADY_IMPORTED");
  assert.equal(dupBody.error.repositoryId, importBody.repository.id);

  const missing = await fetch(base + "/api/github/import", { method: "POST", headers, body: JSON.stringify({ fullName: "octo-" + run + "/nope" }) });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json() as { error: { code: string } }).error.code, "GITHUB_NOT_FOUND");

  const invalid = await fetch(base + "/api/github/import", { method: "POST", headers, body: JSON.stringify({ fullName: "../etc/passwd" }) });
  assert.equal(invalid.status, 400);

  const noCsrf = await fetch(base + "/api/github/import", { method: "POST", headers: { cookie: first.cookie, "content-type": "application/json" }, body: JSON.stringify({ fullName: REPOS[0]!.full_name }) });
  assert.equal(noCsrf.status, 403, "import requires the CSRF token");

  const listed = await (await fetch(base + "/api/github/repos?page=1", { headers: { cookie: first.cookie } })).json() as {
    repositories: Array<{ importedRepositoryId: string | null }>;
  };
  assert.equal(listed.repositories[0]!.importedRepositoryId, importBody.repository.id, "imported repositories are marked");

  revoked = true;
  const stale = await fetch(base + "/api/github/repos?page=1", { headers: { cookie: first.cookie } });
  revoked = false;
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as { error: { code: string } }).error.code, "GITHUB_RECONNECT_REQUIRED");

  const disconnect = await fetch(base + "/api/github/connection", { method: "DELETE", headers });
  assert.equal(disconnect.status, 200);
  const afterDisconnect = await fetch(base + "/api/github/repos?page=1", { headers: { cookie: first.cookie } });
  assert.equal(afterDisconnect.status, 409);
  assert.equal((await afterDisconnect.json() as { error: { code: string } }).error.code, "GITHUB_NOT_CONNECTED");
});

test("GitHub sign-in links to an existing password account with the same verified email", async () => {
  const register = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: BOB_EMAIL, password: "Integration-pass-123456" })
  });
  assert.equal(register.status, 201);
  const registered = await register.json() as { user: { id: string } };
  createdUsers.add(registered.user.id);

  const viaGitHub = await signInWithGitHub("code-bob");
  const me = await (await fetch(base + "/api/auth/me", { headers: { cookie: viaGitHub.cookie } })).json() as { user: { id: string } };
  assert.equal(me.user.id, registered.user.id);

  const status = await (await fetch(base + "/api/github/status", { headers: { cookie: viaGitHub.cookie } })).json() as {
    hasPassword: boolean; github: { privateRepositories: boolean };
  };
  assert.equal(status.hasPassword, true);
  assert.equal(status.github.privateRepositories, false, "public sign-in does not grant private repository access");
});

test("GitHub routes require a signed-in account", async () => {
  for (const path of ["/api/github/status", "/api/github/repos"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401, path);
  }
});
