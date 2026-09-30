const baseUrl = (process.env.AUTOPSY_PRODUCTION_URL ?? process.argv[2] ?? "").trim().replace(/\/$/, "");
const apiKey = (process.env.AUTOPSY_API_ACCESS_KEY ?? "").trim();

if (!baseUrl) {
  throw new Error("Usage: AUTOPSY_PRODUCTION_URL=https://... AUTOPSY_API_ACCESS_KEY=... node scripts/production-smoke.mjs");
}

const url = new URL(baseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (url.protocol !== "https:" && !localHosts.has(url.hostname)) {
  throw new Error("Production smoke URL must use HTTPS outside localhost.");
}
if (url.username || url.password || url.search || url.hash) {
  throw new Error("Production smoke URL must not contain credentials, query parameters or fragments.");
}

async function request(path, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { Accept: "application/json, text/html", ...headers },
    redirect: "error",
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

const protectedWithoutKey = await request("/api/repositories/00000000-0000-0000-0000-000000000000");
assert(protectedWithoutKey.response.status === 401, `Unauthenticated API request returned HTTP ${protectedWithoutKey.response.status}.`);
assert(protectedWithoutKey.body?.error?.code === "API_ACCESS_UNAUTHORIZED", "Unauthenticated API response has the wrong error contract.");

const protectedWithBadKey = await request(
  "/api/repositories/00000000-0000-0000-0000-000000000000",
  { "x-autopsy-api-key": "invalid-production-smoke-key" }
);
assert(protectedWithBadKey.response.status === 401, `Invalid API key returned HTTP ${protectedWithBadKey.response.status}.`);

if (!apiKey) {
  throw new Error("AUTOPSY_API_ACCESS_KEY is required for the authenticated production smoke check.");
}

const protectedWithKey = await request(
  "/api/repositories/00000000-0000-0000-0000-000000000000",
  { "x-autopsy-api-key": apiKey }
);
assert(protectedWithKey.response.status === 404, `Valid API key did not reach the protected route; received HTTP ${protectedWithKey.response.status}.`);
assert(protectedWithKey.body?.error?.code === "REPOSITORY_NOT_FOUND", "Authenticated protected-route smoke returned the wrong error contract.");

console.log("✓ Production smoke passed: frontend, asset, health, readiness, unauthenticated wall, invalid-key rejection, and authenticated protected-route boundary.");
