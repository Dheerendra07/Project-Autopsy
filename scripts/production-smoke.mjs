const baseUrl = (process.env.AUTOPSY_PRODUCTION_URL ?? process.argv[2] ?? "").trim().replace(/\/$/, "");
const email = (process.env.AUTOPSY_BOOTSTRAP_EMAIL ?? "").trim();
const password = process.env.AUTOPSY_BOOTSTRAP_PASSWORD ?? "";
const expectedAiProvider = (process.env.AUTOPSY_EXPECTED_AI_PROVIDER ?? "gemini").trim();
const expectedAiModel = (process.env.AUTOPSY_EXPECTED_AI_MODEL ?? "gemini-3.8-flash").trim();
const expectedAiFallbackModel = (process.env.AUTOPSY_EXPECTED_AI_FALLBACK_MODEL ?? "gemini-3.7-flash").trim();
const expectedAiLastResortModel = (process.env.AUTOPSY_EXPECTED_AI_LAST_RESORT_MODEL ?? "gemini-3.5-flash").trim();
const e2eRepositoryUrl = (process.env.AUTOPSY_E2E_REPOSITORY_URL ?? "https://github.com/octocat/Hello-World.git").trim();
const e2eAnalysisTimeoutMs = Number.parseInt(process.env.AUTOPSY_E2E_ANALYSIS_TIMEOUT_MS ?? "240000", 10);

if (!Number.isSafeInteger(e2eAnalysisTimeoutMs) || e2eAnalysisTimeoutMs < 30_000 || e2eAnalysisTimeoutMs > 600_000) {
  throw new Error("AUTOPSY_E2E_ANALYSIS_TIMEOUT_MS must be between 30000 and 600000 milliseconds.");
}

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
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? 30_000;

  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: { Accept: "application/json, text/html", ...(options.headers ?? {}) },
      body: options.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { response, text, body };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `Production smoke request timed out after ${timeoutMs}ms: ${method} ${path}`
      );
    }
    throw error;
  }
}

const PUBLIC_WARMUP_RETRY_STATUSES = new Set([502, 503, 504]);
const PUBLIC_WARMUP_MAX_ATTEMPTS = 7;
const PUBLIC_WARMUP_BASE_DELAY_MS = 1_500;
const PUBLIC_WARMUP_MAX_DELAY_MS = 8_000;

async function requestPublicWarmup(path) {
  for (let attempt = 1; attempt <= PUBLIC_WARMUP_MAX_ATTEMPTS; attempt += 1) {
    const result = await request(path);
    if (
      !PUBLIC_WARMUP_RETRY_STATUSES.has(result.response.status) ||
      attempt === PUBLIC_WARMUP_MAX_ATTEMPTS
    ) {
      return result;
    }

    const delayMs = Math.min(
      PUBLIC_WARMUP_MAX_DELAY_MS,
      PUBLIC_WARMUP_BASE_DELAY_MS * 2 ** (attempt - 1)
    );
    console.log(
      `⚠ Public probe ${path} returned HTTP ${result.response.status}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${PUBLIC_WARMUP_MAX_ATTEMPTS}).`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Public warm-up probe for ${path} exhausted its retry window.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForAnalysis(
  repositoryId,
  analysisRunId,
  cookieHeader,
  timeoutMs
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await request(
      `/api/repositories/${repositoryId}/analysis/${analysisRunId}`,
      {
        headers: { Cookie: cookieHeader }
      }
    );

    assert(
      response.response.status === 200,
      `Analysis status returned HTTP ${response.response.status}.`
    );
    assert(
      response.body?.success === true && response.body?.analysis,
      "Analysis status response returned the wrong response contract."
    );

    const analysis = response.body.analysis;
    if (analysis.status === "completed" || analysis.status === "failed") {
      return analysis;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Production E2E analysis did not reach a terminal state within ${timeoutMs}ms.`
  );
}

const home = await requestPublicWarmup("/");
assert(home.response.ok, `Home page returned HTTP ${home.response.status}.`);
assert(home.text.includes("Project Autopsy"), "Home page does not contain the Project Autopsy surface.");
assert(home.text.includes('<script src="app.js" defer></script>'), "Home page is missing the dependency-free app.js asset.");

const appJs = await request("/app.js");
assert(appJs.response.ok, `Frontend asset returned HTTP ${appJs.response.status}.`);
assert(appJs.text.includes("function storageGet(key)"), "Frontend asset is not the expected Autopsy client.");
assert(appJs.text.includes("const COMMAND_DEFS="), "Production frontend is missing the developer command center.");
const uiCss = await request("/ui-product.css");
assert(uiCss.response.ok, `Product UI stylesheet returned HTTP ${uiCss.response.status}.`);
assert(uiCss.text.includes("--pa-bg:#0b0d10"), "Production page is not serving the rebuilt product stylesheet.");
assert(home.text.includes('<script src="theme.js"></script>'), "Production page is missing the CSP-safe theme bootstrap asset.");

const themeJs = await request("/theme.js");
assert(themeJs.response.ok, `Theme bootstrap asset returned HTTP ${themeJs.response.status}.`);
assert(themeJs.text.includes("prefers-color-scheme: light"), "Theme bootstrap asset is not the expected Autopsy implementation.");

for (const assetPath of ["/favicon.svg", "/favicon.ico"]) {
  const asset = await request(assetPath);
  assert(asset.response.status === 200, `${assetPath} returned HTTP ${asset.response.status}.`);
  assert(
    asset.response.headers.get("content-type")?.startsWith("image/svg+xml"),
    `${assetPath} returned an unexpected content type.`
  );
}

const health = await requestPublicWarmup("/health");
assert(health.response.status === 200, `/health returned HTTP ${health.response.status}.`);
assert(health.body?.success === true && health.body?.status === "healthy", "/health did not report healthy.");
assert(
  /^[0-9a-f-]{36}$/i.test(health.response.headers.get("x-request-id") ?? ""),
  "Health response did not expose a valid X-Request-Id."
);

const ready = await requestPublicWarmup("/ready");
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

  let e2eRepositoryId = null;
  let e2eAnalysisRunId = null;
  let e2eCleanupSucceeded = false;

  try {
    const importResponse = await request("/api/repositories/import", {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "x-autopsy-csrf-token": csrfToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: e2eRepositoryUrl
      })
    });

    assert(
      importResponse.response.status === 202,
      `Production E2E repository import returned HTTP ${importResponse.response.status}. Body: ${importResponse.text.slice(0, 500)}`
    );
    assert(
      importResponse.body?.success === true,
      "Production E2E repository import returned the wrong response contract."
    );
    assert(
      importResponse.body?.repository?.id &&
        importResponse.body?.analysis?.id &&
        importResponse.body?.analysis?.status === "queued",
      "Production E2E repository import did not return queued repository/analysis identifiers."
    );

    e2eRepositoryId = importResponse.body.repository.id;
    e2eAnalysisRunId = importResponse.body.analysis.id;

    const analysis = await waitForAnalysis(
      e2eRepositoryId,
      e2eAnalysisRunId,
      cookieHeader,
      e2eAnalysisTimeoutMs
    );

    assert(
      analysis.status === "completed",
      `Production E2E analysis failed: ${String(analysis.errorMessage ?? "no public error message returned.")}`
    );
    assert(
      /^[0-9a-f]{40}$/i.test(analysis.targetHeadSha ?? ""),
      "Production E2E analysis did not produce a valid target head SHA."
    );

    const report = await request(
      `/api/repositories/${e2eRepositoryId}/report?limit=3`,
      {
        headers: { Cookie: cookieHeader }
      }
    );
    assert(
      report.response.status === 200,
      `Production E2E report generation returned HTTP ${report.response.status}. Body: ${report.text.slice(0, 500)}`
    );
    assert(
      report.body?.success === true &&
        report.body?.report?.analysis?.runId === e2eAnalysisRunId &&
        report.body?.report?.analysis?.status === "completed" &&
        Array.isArray(report.body?.report?.sections) &&
        report.body.report.sections.length > 0,
      "Production E2E report did not return the expected completed evidence report."
    );

    const interpretation = await request(
      `/api/repositories/${e2eRepositoryId}/interpretation?limit=3`,
      {
        headers: { Cookie: cookieHeader },
        timeoutMs: 210_000
      }
    );
    assert(
      interpretation.response.status === 200,
      `Production Gemini interpretation returned HTTP ${interpretation.response.status}. Body: ${interpretation.text.slice(0, 500)}`
    );
    assert(
      interpretation.body?.success === true &&
        interpretation.body?.result?.provider === expectedAiProvider &&
        [
          expectedAiModel,
          expectedAiFallbackModel,
          expectedAiLastResortModel
        ].includes(interpretation.body?.result?.model),
      `Production Gemini interpretation returned an unexpected provider/model: provider=${String(interpretation.body?.result?.provider)} model=${String(interpretation.body?.result?.model)}`
    );
    assert(
      interpretation.body?.result?.cacheHit === false,
      "Production Gemini E2E unexpectedly returned a cached interpretation; a fresh provider call was required."
    );
    assert(
      Number.isInteger(interpretation.body?.result?.groundingClaimCount) &&
        interpretation.body.result.groundingClaimCount > 0,
      "Production Gemini interpretation did not contain grounded evidence claims."
    );

    const aiOutput = interpretation.body.result.interpretation;
    assert(
      typeof aiOutput?.executiveSummary === "string" &&
        aiOutput.executiveSummary.trim().length > 0,
      "Production Gemini interpretation returned an empty executive summary."
    );
    assert(
      Array.isArray(aiOutput?.themes) &&
        Array.isArray(aiOutput?.investigationQuestions) &&
        Array.isArray(aiOutput?.uncertainties),
      "Production Gemini interpretation returned an incomplete structured output."
    );

    console.log(
      `✓ Production Gemini E2E passed: fresh import ${e2eRepositoryId}, analysis ${e2eAnalysisRunId}, evidence report, live provider=${expectedAiProvider}, accepted models=${[expectedAiModel, expectedAiFallbackModel, expectedAiLastResortModel].join(", ")}, uncached structured interpretation, and evidence grounding.`
    );
  } finally {
    if (e2eRepositoryId) {
      try {
        const deleteResponse = await request(
          `/api/repositories/${e2eRepositoryId}`,
          {
            method: "DELETE",
            headers: {
              Cookie: cookieHeader,
              "x-autopsy-csrf-token": csrfToken
            }
          }
        );

        assert(
          deleteResponse.response.status === 200 ||
            deleteResponse.response.status === 202,
          `Production E2E cleanup returned HTTP ${deleteResponse.response.status}. Body: ${deleteResponse.text.slice(0, 500)}`
        );
        assert(
          deleteResponse.body?.success === true &&
            deleteResponse.body?.deleted === true,
          "Production E2E cleanup returned the wrong response contract."
        );
        e2eCleanupSucceeded = true;
      } catch (error) {
        console.error(
          "Production E2E cleanup failed:",
          error instanceof Error ? error.message : "unknown cleanup error"
        );
        throw error;
      }
    }
  }

  assert(e2eCleanupSucceeded, "Production E2E did not confirm cleanup of its temporary repository.");

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

console.log("✓ Production smoke passed: frontend, assets, health, readiness, unauthenticated wall, account login/session, /auth/me, session listing, CSRF rejection, protected-route boundary, fresh import→analysis→report→Gemini interpretation E2E, temporary repository cleanup, and smoke-session cleanup.");
