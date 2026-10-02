const baseUrl = (process.env.AUTOPSY_PRODUCTION_URL ?? process.argv[2] ?? "").trim().replace(/\/$/, "");
const email = (process.env.AUTOPSY_BOOTSTRAP_EMAIL ?? "").trim();
const password = process.env.AUTOPSY_BOOTSTRAP_PASSWORD ?? "";

if (!baseUrl) {
  throw new Error("Usage: AUTOPSY_PRODUCTION_URL=https://... AUTOPSY_BOOTSTRAP_EMAIL=... AUTOPSY_BOOTSTRAP_PASSWORD=... node scripts/production-smoke.mjs");
}

const url = new URL(baseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (url.protocol !== "https:" && !localHosts.has(url.hostname)) {
  throw new Error("Production smoke URL must use HTTPS outside localhost.");
}
if (url.username || url.password || url.search || url.hash) {
  throw new Error("Production smoke URL must not contain credentials, query parameters or fragments.");
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method ?? "GET",
    headers: { Accept: "application/json, text/html", ...(options.headers ?? {}) },
    body: options.body,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { response, text, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const home = await request("/");
assert(home.response.ok, `Home page returned HTTP ${home.response.status}.`);
assert(home.text.includes("Project Autopsy"), "Home page does not contain the Project Autopsy surface.");
assert(home.text.includes('<script src="app.js" defer></script>'), "Home page is missing the dependency-free app.js asset.");

const appJs = await request("/app.js");
assert(appJs.response.ok, `Frontend asset returned HTTP ${appJs.response.status}.`);
assert(appJs.text.includes("function storageGet(key)"), "Frontend asset is not the expected Autopsy client.");

const health = await request("/health");
assert(health.response.status === 200, `/health returned HTTP ${health.response.status}.`);
assert(health.body?.success === true && health.body?.status === "healthy", "/health did not report healthy.");

const ready = await request("/ready");
assert(ready.response.status === 200, `/ready returned HTTP ${ready.response.status}. Body: ${ready.text.slice(0, 500)}`);
assert(ready.body?.success === true && ready.body?.status === "ready", "/ready did not report ready.");
assert(ready.body?.checks?.database === "ready", "PostgreSQL is not ready.");
assert(ready.body?.checks?.redis === "ready", "Redis is not ready.");

const protectedWithoutSession = await request("/api/repositories/00000000-0000-0000-0000-000000000000");
assert(protectedWithoutSession.response.status === 401, `Unauthenticated API request returned HTTP ${protectedWithoutSession.response.status}.`);
assert(protectedWithoutSession.body?.error?.code === "AUTH_REQUIRED", "Unauthenticated API response has the wrong error contract.");

if (!email || !password) {
  throw new Error("AUTOPSY_BOOTSTRAP_EMAIL and AUTOPSY_BOOTSTRAP_PASSWORD are required for the authenticated production smoke check.");
}

const login = await request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
assert(login.response.status === 200, `Login returned HTTP ${login.response.status}. Body: ${login.text.slice(0, 500)}.`);
assert(login.body?.success === true && login.body?.user?.email === email.toLowerCase(), "Login did not return the expected account.");
const setCookie = login.response.headers.getSetCookie?.() ?? [];
const sessionCookie = setCookie.find((value) => value.startsWith("autopsy_session="));
const csrfCookie = setCookie.find((value) => value.startsWith("autopsy_csrf="));
assert(sessionCookie && csrfCookie, "Login did not establish both required session cookies.");
const cookieHeader = [sessionCookie, csrfCookie].map((value) => value.split(";")[0]).join("; ");

const csrfToken = decodeURIComponent(
  csrfCookie.split(";")[0].slice("autopsy_csrf=".length)
);
let sessionClosed = false;

try {
  const me = await request("/api/auth/me", {
    headers: { Cookie: cookieHeader }
  });
  assert(me.response.status === 200 && me.body?.user?.email === email.toLowerCase(), "Authenticated /auth/me check failed.");

  const sessions = await request("/api/auth/sessions", {
    headers: { Cookie: cookieHeader }
  });
  assert(sessions.response.status === 200, `Authenticated session list returned HTTP ${sessions.response.status}.`);
  assert(sessions.body?.success === true && Array.isArray(sessions.body?.sessions), "Authenticated session list returned the wrong response contract.");
  assert(sessions.body.sessions.some((session) => session.isCurrent === true), "Authenticated session list did not identify the current session.");

  const csrfRejectedLogout = await request("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookieHeader }
  });
  assert(csrfRejectedLogout.response.status === 403, `Logout without CSRF protection returned HTTP ${csrfRejectedLogout.response.status}.`);
  assert(csrfRejectedLogout.body?.error?.code === "CSRF_INVALID", "Logout without CSRF protection returned the wrong error contract.");

  const protectedWithSession = await request(
    "/api/repositories/00000000-0000-0000-0000-000000000000",
    { headers: { Cookie: cookieHeader } }
  );
  assert(protectedWithSession.response.status === 404, `Authenticated protected route returned HTTP ${protectedWithSession.response.status}.`);
  assert(protectedWithSession.body?.error?.code === "REPOSITORY_NOT_FOUND", "Authenticated protected-route smoke returned the wrong error contract.");

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "x-autopsy-csrf-token": csrfToken
    }
  });
  assert(logout.response.status === 200, `Authenticated logout cleanup returned HTTP ${logout.response.status}.`);
  assert(logout.body?.success === true, "Authenticated logout cleanup returned the wrong response contract.");
  sessionClosed = true;
} finally {
  if (!sessionClosed) {
    try {
      await request("/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: cookieHeader,
          "x-autopsy-csrf-token": csrfToken
        }
      });
    } catch (error) {
      console.warn("Production smoke session cleanup failed:", error);
    }
  }
}

console.log("✓ Production smoke passed: frontend, asset, health, readiness, unauthenticated wall, account login/session, /auth/me, session listing, CSRF rejection, protected-route boundary, and smoke-session cleanup.");
