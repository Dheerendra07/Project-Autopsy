import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function readRepoFile(path: string): string {
  return readFileSync(
    fileURLToPath(new URL("../" + path, import.meta.url)),
    "utf8"
  ).replace(/\r\n/g, "\n");
}

test("package remains private and exposes bounded production commands", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as {
    private?: boolean;
    type?: string;
    version?: string;
    engines?: { node?: string };
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines?.node, ">=24 <25");
  assert.equal(
    pkg.scripts?.build,
    "tsc"
  );
  assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts?.["typecheck:tests"], "tsc -p tsconfig.tests.json --noEmit");
  assert.equal(pkg.scripts?.test, "tsx --test tests/*.test.ts");
});



test("package and lockfile root metadata stay aligned", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as {
    name?: string;
    version?: string;
  };
  const lock = JSON.parse(readRepoFile("package-lock.json")) as {
    name?: string;
    version?: string;
    packages?: {
      "": {
        name?: string;
        version?: string;
      };
    };
  };

  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.[""]?.name, pkg.name);
  assert.equal(lock.packages?.[""]?.version, pkg.version);
});

test("test TypeScript project includes source and test files", () => {
  const tsconfig = JSON.parse(readRepoFile("tsconfig.tests.json")) as { include?: string[]; compilerOptions?: { noEmit?: boolean; rootDir?: string } };
  assert.deepEqual(tsconfig.include, ["src/**/*.ts", "tests/**/*.ts"]);
  assert.equal(tsconfig.compilerOptions?.noEmit, true);
  assert.equal(tsconfig.compilerOptions?.rootDir, ".");
});

test("Render blueprint keeps the free combined runtime and health endpoint", () => {
  const render = readRepoFile("render.yaml");

  for (const marker of [
    "type: web",
    "name: project-autopsy",
    "plan: free",
    "healthCheckPath: /health",
    "startCommand: node dist/database/migrate.js && node dist/free-runtime.js",
    "MAX_ANALYZED_COMMITS",
    'value: "25000"',
    "autoDeployTrigger: commit"
  ]) {
    assert.ok(render.includes(marker), "missing Render invariant: " + marker);
  }
});

test("quality workflow runs automatically for pull requests and main pushes", () => {
  const workflow = readRepoFile(".github/workflows/quality.yml");

  for (const marker of [
    "pull_request:",
    "push:",
    "branches: [main]",
    "runs-on: ubuntu-latest",
    "Prepare PostgreSQL and Redis",
    "permissions:",
    "contents: read",
    "cancel-in-progress: true",
    "timeout-minutes: 45",
    "uses: actions/checkout@v6",
    "uses: actions/setup-node@v7",
    "node-version: 24"
  ]) {
    assert.ok(workflow.includes(marker), "missing workflow invariant: " + marker);
  }

  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("pull_request:\n    branches: [main]"));
  assert.ok(workflow.includes("push:\n    branches: [main]"));
});


test("Git history discovery paginates commit and numstat output", () => {
  const discovery = readRepoFile("src/modules/commits/commit.discovery.ts");

  assert.ok(discovery.includes("const GIT_LOG_PAGE_SIZE = 500"));
  assert.ok(discovery.includes('`--skip=${skip}`'));
  assert.ok(discovery.includes('`--max-count=${GIT_LOG_PAGE_SIZE}`'));
  assert.ok(
    discovery.indexOf("const commits: DiscoveredCommit[] = []") <
      discovery.indexOf("const pageNumstat = await discoverNumstatPage(")
  );
  assert.ok(discovery.includes("const pageNumstat = await discoverNumstatPage("));
});

test("analysis progress reports real worker stages and commit counts", () => {
  const discovery = readRepoFile("src/modules/commits/commit.discovery.ts");
  const queue = readRepoFile("src/modules/analysis/analysis.queue.ts");
  const worker = readRepoFile("src/workers/analysis.worker.ts");
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");

  assert.ok(discovery.includes("await onProgress?.(0, commitCount)"));
  assert.ok(discovery.includes("await onProgress?.(commits.length, commitCount)"));
  assert.ok(queue.includes("export async function getAnalysisJobProgress("));
  assert.ok(worker.includes('stage: "Reading commit history"'));
  assert.ok(worker.includes('stage: "Saving evidence"'));
  assert.ok(routes.includes("progressUnavailable = true"));
  assert.ok(routes.includes("Unable to read analysis progress for run"));
});


test("evidence retention is configured, indexed and shutdown-aware", () => {
  const env = readRepoFile("src/config/env.ts");
  const server = readRepoFile("src/server.ts");
  const retention = readRepoFile("src/modules/evidence-retention.service.ts");
  const migration = readRepoFile(
    "database/migrations/016_evidence_retention_indexes.sql"
  );
  const render = readRepoFile("render.yaml");

  assert.ok(env.includes("EVIDENCE_RETENTION_DAYS"));
  assert.ok(env.includes(".min(30)"));
  assert.ok(env.includes(".max(365)"));
  assert.ok(server.includes("EVIDENCE_RETENTION_INTERVAL_MS = 6 * 60 * 60_000"));
  assert.ok(server.includes("runEvidenceRetentionSweep()"));
  assert.ok(server.includes("clearInterval(evidenceRetentionTimer)"));
  assert.ok(retention.includes("EVIDENCE_RETENTION_BATCH_SIZE = 5_000"));
  assert.ok(retention.includes("EVIDENCE_RETENTION_MAX_DELETIONS_PER_SWEEP = 20_000"));
  assert.ok(retention.includes("runtime_telemetry_events"));
  assert.ok(retention.includes("deployment_evidence_events"));
  assert.ok(migration.includes("idx_runtime_telemetry_retention_observed_at"));
  assert.ok(migration.includes("idx_deployment_evidence_retention_occurred_at"));
  assert.ok(render.includes('key: EVIDENCE_RETENTION_DAYS'));
  assert.ok(render.includes('value: "365"'));
});



test("production Gemini smoke retries bounded HTML gateway failures only", () => {
  const script = readRepoFile("scripts/production-smoke.mjs");

  assert.ok(script.includes("async function requestInterpretationWithGatewayRetry("));
  assert.ok(script.includes("INTERPRETATION_GATEWAY_MAX_ATTEMPTS = 3"));
  assert.ok(script.includes("PUBLIC_WARMUP_RETRY_STATUSES.has(result.response.status)"));
  assert.ok(script.includes('contentType.includes("text/html")'));
  assert.ok(script.includes('await requestPublicWarmup("/ready")'));
  assert.ok(script.includes("await requestInterpretationWithGatewayRetry("));
});

test("production smoke waits for active analysis before deleting its temporary repository", () => {
  const script = readRepoFile("scripts/production-smoke.mjs");

  assert.ok(script.includes("async function deleteRepositoryAfterActiveAnalysis("));
  assert.ok(script.includes('deletion.body?.error?.code === "REPOSITORY_DELETE_BLOCKED"'));
  assert.ok(script.includes("deletion.body?.error?.analysisRunId"));
  assert.ok(script.includes("await waitForAnalysis("));
  assert.ok(script.includes("maxDeleteAttempts = 3"));
});

test("analysis worker recovers from transient stalls and persists terminal failures", () => {
  const worker = readRepoFile("src/workers/analysis.worker.ts");
  const failurePolicy = readRepoFile("src/modules/analysis/worker-failure.ts");

  assert.ok(worker.includes("ANALYSIS_WORKER_LOCK_DURATION_MS = 300_000"));
  assert.ok(worker.includes("ANALYSIS_WORKER_LOCK_RENEW_TIME_MS = 60_000"));
  assert.ok(worker.includes("ANALYSIS_WORKER_MAX_STALLED_COUNT = 2"));
  assert.ok(worker.includes('analysisWorker.on("stalled"'));
  assert.ok(worker.includes("isTerminalAnalysisJobFailure("));
  assert.ok(worker.includes('updateAnalysisRun(job.data.analysisRunId, "failed"'));
  assert.ok(worker.includes("getAnalysisRunById("));
  assert.ok(worker.includes("job.data.analysisRunId"));
  assert.ok(failurePolicy.includes('errorName === "UnrecoverableError"'));
  assert.ok(failurePolicy.includes("attemptsMade >= maxAttempts"));
});

test("re-analysis reconciles a BullMQ failed job before blocking on stale active state", () => {
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const recovery = readRepoFile("src/modules/repositories/active-analysis-recovery.ts");
  const queueState = readRepoFile("src/modules/analysis/queue-job-state.ts");

  assert.ok(routes.includes("await reconcileFailedActiveAnalysisRun(activeRun)"));
  assert.ok(recovery.includes("analysisQueue.getJob(jobId)"));
  assert.ok(recovery.includes("job.failedReason"));
  assert.ok(recovery.includes('updateAnalysisRun(current.id, "failed"'));
  assert.ok(recovery.includes('const candidateJobIds = ['));
  assert.ok(queueState.includes('return state === "failed"'));
});

test("production smoke covers public surface and protected API boundaries", () => {
  const script = readRepoFile("scripts/production-smoke.mjs");
  const workflow = readRepoFile(".github/workflows/production-smoke.yml");

  for (const marker of [
    "AUTOPSY_PRODUCTION_URL",
    "AUTOPSY_BOOTSTRAP_EMAIL",
    "AUTOPSY_BOOTSTRAP_PASSWORD",
    "AUTOPSY_EXPECTED_AI_PROVIDER",
    "AUTOPSY_EXPECTED_AI_MODEL",
    "AUTOPSY_EXPECTED_AI_FALLBACK_MODEL",
    '"/favicon.svg"',
    '"/favicon.ico"',
    '"/health"',
    '"/ready"',
    "x-request-id",
    "image/svg+xml",
    '"/api/auth/login"',
    '"/api/auth/me"',
    '"/api/auth/sessions"',
    '"/api/auth/logout"',
    "CSRF_INVALID",
    "x-autopsy-csrf-token",
    "sessionClosed",
    "Production smoke session cleanup failed:",
    '"/api/repositories/00000000-0000-0000-0000-000000000000"',
    "AUTH_REQUIRED",
    "REPOSITORY_NOT_FOUND",
    "autopsy_session=",
    "autopsy_csrf=",
    'redirect: "manual"',
    "const timeoutMs = options.timeoutMs ?? 30_000;",
    "signal: AbortSignal.timeout(timeoutMs)",
    "timeoutMs: 210_000"
  ]) {
    assert.ok(
      script.includes(marker) || workflow.includes(marker),
      "missing production smoke invariant: " + marker
    );
  }

  assert.ok(workflow.includes("schedule:"));
  assert.ok(workflow.includes('cron: "17 */6 * * *"'));
  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("default: \"https://project-autopsy.onrender.com\""));
  assert.ok(workflow.includes("secrets.AUTOPSY_BOOTSTRAP_EMAIL"));
  assert.ok(workflow.includes("secrets.AUTOPSY_BOOTSTRAP_PASSWORD"));
  assert.ok(workflow.includes("node scripts/production-smoke.mjs"));
  assert.ok(workflow.includes("AUTOPSY_EXPECTED_AI_FALLBACK_MODEL: gemini-3.7-flash"));
  assert.ok(workflow.includes("AUTOPSY_EXPECTED_AI_LAST_RESORT_MODEL: gemini-3.5-flash"));
  assert.ok(script.includes("const expectedAiFallbackModel"));
  assert.ok(script.includes("const expectedAiLastResortModel"));
  assert.ok(
    script.includes("[") &&
      script.includes("expectedAiLastResortModel") &&
      script.includes("includes(interpretation.body?.result?.model)")
  );
});
test("Operations queue health checks are bounded by the operational timeout", () => {
  const service = readRepoFile("src/modules/observability/observability.service.ts");

  assert.ok(service.includes("async function timedQueueCheck("));
  assert.ok(service.includes("OPERATIONAL_CHECK_TIMEOUT_MS"));
  assert.ok(
    service.includes("timedQueueCheck(") &&
      service.includes("dependencies.getQueueCounts")
  );
  assert.ok(
    service.includes("Operational queue check timed out.")
  );
});

test("API CORS allows credentialed browser sessions for the split UI origin", () => {
  const app = readRepoFile("src/app.ts");

  assert.ok(
    app.includes("cors({") &&
      app.includes("credentials: true,")
  );
});

test("Render production CORS contract includes both canonical and dedicated UI origins", () => {
  const render = readRepoFile("render.yaml");

  assert.ok(
    render.includes('key: AUTOPSY_CORS_ORIGINS') &&
      render.includes('value: "https://project-autopsy.onrender.com,https://project-autopsy-ui.onrender.com"')
  );
});

test("quality workflow retains the full validation gate", () => {
  const workflow = readRepoFile(".github/workflows/quality.yml");

  for (const marker of [
    "npm ci",
    "npm run typecheck",
    "npm run typecheck:tests",
    "npm run build",
    "npm run db:migrate",
    "npm test",
    "AUTOPSY_E2E=1",
    "Server startup smoke test",
    "Combined API and worker startup smoke test",
    "Worker startup smoke test"
  ]) {
    assert.ok(workflow.includes(marker), "missing quality gate: " + marker);
  }
});

test("history ordering matches the user-facing timeline semantics", () => {
  const persistence = readRepoFile("src/modules/repositories/repository.persistence.ts");
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const report = readRepoFile("src/modules/reports/report.service.ts");

  assert.ok(persistence.includes('export type CommitListOrder = "asc" | "desc";'));
  assert.ok(persistence.includes('const sortDirection = order === "desc" ? "DESC" : "ASC";'));
  assert.ok(
    routes.includes(
      'query.limit,\n      "desc"\n    );'
    )
  );
  assert.ok(
    routes.includes(
      'query.limit,\n      "asc"\n    );'
    )
  );
  assert.ok(
    report.includes(
      'listRepositoryCommits(repositoryId, 1, sampleLimit, "desc")'
    )
  );
});


test("404 responses do not reflect query strings", () => {
  const middleware = readRepoFile("src/middleware/notFound.middleware.ts");

  assert.ok(middleware.includes("req.path"));
  assert.doesNotMatch(middleware, /req\.originalUrl/);
});


test("web service serves the favicon alongside the public workspace", () => {

  const app = readRepoFile("src/app.ts");
  assert.ok(app.includes('app.get("/favicon.ico"'));

});

test("web service serves the browser workspace from the public directory", () => {
  const app = readRepoFile("src/app.ts");

  assert.ok(app.includes("express.static(publicDirectory"));
  assert.ok(app.includes('path.dirname(fileURLToPath(import.meta.url))'));
  assert.ok(app.includes('"../public"'));
});

test("Render deployment keeps the free single-service delivery contract", () => {
  const render = readRepoFile("render.yaml");
  const readme = readRepoFile("README.md");
  const architecture = readRepoFile("docs/architecture.md");

  assert.ok(render.includes("name: project-autopsy"));
  assert.ok(render.includes("plan: free"));
  assert.ok(render.includes("autoDeployTrigger: commit"));
  assert.ok(render.includes("startCommand: node dist/database/migrate.js && node dist/free-runtime.js"));
  assert.ok(readme.includes("same service serves the browser workspace from public/index.html"));
  assert.ok(architecture.includes("serves the browser workspace from public/index.html"));
  assert.ok(architecture.includes("single free web service"));
});

test("dependency analysis bounds package.json reads before loading content", () => {
  const discovery = readRepoFile("src/modules/dependencies/dependency.discovery.ts");

  assert.ok(
    discovery.includes("const MAX_PACKAGE_MANIFEST_BYTES = 2_000_000")
  );
  assert.ok(
    discovery.includes('git.raw(["cat-file", "-s", objectSpec])')
  );
  assert.ok(
    discovery.includes("throw new DependencyManifestTooLargeError()")
  );
});

test("telemetry and deployment JSON metadata reject excessive nesting before serialization", () => {
  const runtimeTypes = readRepoFile("src/modules/runtime/runtime.types.ts");
  const deploymentTypes = readRepoFile("src/modules/deployments/deployment.types.ts");

  assert.ok(runtimeTypes.includes("const MAX_JSON_NESTING_DEPTH = 20"));
  assert.ok(runtimeTypes.includes("exceedsJsonNestingDepth(value)"));
  assert.ok(
    runtimeTypes.includes(
      "attributes nesting depth exceeds the 20 level limit."
    )
  );
  assert.ok(deploymentTypes.includes("const MAX_JSON_NESTING_DEPTH = 20"));
  assert.ok(deploymentTypes.includes("exceedsJsonNestingDepth(value)"));
  assert.ok(
    deploymentTypes.includes(
      "metadata nesting depth exceeds the 20 level limit."
    )
  );
});

test("source-analysis readers bound test and migration Git objects before reading content", () => {
  const testDiscovery = readRepoFile("src/modules/tests/test-evolution.discovery.ts");
  const migrationDiscovery = readRepoFile("src/modules/schema/schema.discovery.ts");

  assert.ok(testDiscovery.includes("const MAX_TEST_SOURCE_BYTES = 2_000_000"));
  assert.ok(testDiscovery.includes('git.raw(["cat-file", "-s", objectSpec])'));
  assert.ok(
    testDiscovery.includes("sourceBytes > MAX_TEST_SOURCE_BYTES")
  );
  assert.ok(migrationDiscovery.includes("const MAX_MIGRATION_SOURCE_BYTES = 2_000_000"));
  assert.ok(migrationDiscovery.includes('git.raw(["cat-file", "-s", objectSpec])'));
  assert.ok(
    migrationDiscovery.includes(
      "sourceBytes > MAX_MIGRATION_SOURCE_BYTES"
    )
  );
});

test("Helmet keeps HTTPS upgrades production-only", () => {
  const app = readRepoFile("src/app.ts");

  assert.ok(app.includes("upgradeInsecureRequests:"));
  assert.ok(app.includes("env.NODE_ENV === " + '"production"'));
  assert.ok(app.includes("? [] : null"));
});

test("account session authentication is mounted before the protected API router", () => {
  const app = readRepoFile("src/app.ts");

  const authRouterIndex = app.indexOf('app.use("/api/auth", authRouter);');
  const sessionIndex = app.indexOf('app.use("/api", requireApiSessionOrMachineIngest);');
  const csrfIndex = app.indexOf('app.use("/api", requireApiCsrfOrMachineIngest);');
  const routerIndex = app.indexOf('app.use("/api", router);');

  assert.ok(authRouterIndex >= 0);
  assert.ok(sessionIndex >= 0);
  assert.ok(csrfIndex >= 0);
  assert.ok(routerIndex >= 0);
  assert.ok(authRouterIndex < sessionIndex);
  assert.ok(sessionIndex < csrfIndex);
  assert.ok(csrfIndex < routerIndex);
  assert.equal(
    (app.match(/app\.use\("\/api", router\);/g) ?? []).length,
    1
  );
  assert.doesNotMatch(app, /isApiAccessAuthorized\(/);
});


test("legacy migration is explicitly one-time and separate from normal session auth", () => {
  const authRoutes = readRepoFile("src/modules/auth/auth.routes.ts");
  const env = readRepoFile("src/config/env.ts");
  const render = readRepoFile("render.yaml");

  assert.ok(authRoutes.includes('authRouter.post("/migrate-legacy"'));
  assert.ok(authRoutes.includes("x-autopsy-api-key"));
  assert.ok(env.includes("AUTOPSY_API_ACCESS_KEY"));
  assert.ok(render.includes("Temporary compatibility secret used only by the one-time legacy workspace migration."));
  assert.ok(render.includes("key: AUTOPSY_API_ACCESS_KEY"));
});

test("session lifecycle is bounded and cleaned up on a schedule", () => {
  const persistence = readRepoFile("src/modules/auth/auth.persistence.ts");
  const routes = readRepoFile("src/modules/auth/auth.routes.ts");
  const server = readRepoFile("src/server.ts");

  assert.ok(persistence.includes("ACTIVE_SESSION_LIMIT = 10"));
  assert.ok(persistence.includes("revokeExcessUserSessions"));
  assert.ok(persistence.includes("purgeStaleSessions"));
  assert.ok(persistence.includes("INTERVAL '30 days'"));
  assert.ok(routes.includes("revokeExcessUserSessions(user.id)"));
  assert.ok(server.includes("SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60_000"));
  assert.ok(server.includes("SESSION_CLEANUP_BATCH_SIZE"));
  assert.ok(server.includes("clearInterval(sessionCleanupTimer)"));
  assert.ok(server.includes("purgeStaleSessions()"));
});

test("account security exposes password rotation and individual session revocation", () => {
  const routes = readRepoFile("src/modules/auth/auth.routes.ts");
  const persistence = readRepoFile("src/modules/auth/auth.persistence.ts");

  assert.ok(routes.includes('authRouter.get("/sessions"'));
  assert.ok(routes.includes('authRouter.delete('));
  assert.ok(routes.includes('"/sessions/:sessionId"'));
  assert.ok(routes.includes('authRouter.post('));
  assert.ok(routes.includes('"/password"'));
  assert.ok(routes.includes("changeUserPassword"));
  assert.ok(routes.includes("revokeSessionForUser"));
  assert.ok(routes.includes("revokeAllUserSessions"));
  assert.ok(persistence.includes("LIMIT 25"));
  assert.ok(persistence.includes("AND user_id = $2"));
});




test("account recovery and transactional email contracts remain explicit", () => {
  const env = readRepoFile("src/config/env.ts");
  const migration = readRepoFile("database/migrations/018_auth_email_recovery.sql");
  const email = readRepoFile("src/modules/auth/auth.email.ts");
  const persistence = readRepoFile("src/modules/auth/auth.persistence.ts");
  const routes = readRepoFile("src/modules/auth/auth.routes.ts");
  const bootstrap = readRepoFile("src/modules/auth/auth.bootstrap.ts");
  const server = readRepoFile("src/server.ts");
  const render = readRepoFile("render.yaml");
  const readme = readRepoFile("README.md");

  for (const marker of [
    "BREVO_API_KEY",
    "AUTOPSY_EMAIL_FROM",
    "AUTOPSY_PUBLIC_URL",
    "transactional email is configured"
  ]) {
    assert.ok(env.includes(marker), "missing email configuration invariant: " + marker);
  }

  for (const marker of [
    "email_verified_at",
    "auth_action_tokens",
    "email_verification",
    "password_reset"
  ]) {
    assert.ok(migration.includes(marker), "missing recovery migration marker: " + marker);
  }

  for (const marker of [
    "isAuthEmailConfigured",
    "BREVO_TRANSACTIONAL_EMAIL_ENDPOINT",
    "AUTH_EMAIL_VERIFICATION_TTL_MS",
    "AUTH_PASSWORD_RESET_TTL_MS",
    "#auth-verify=",
    "#auth-reset="
  ]) {
    assert.ok(email.includes(marker), "missing transactional email marker: " + marker);
  }

  for (const marker of [
    "createAuthActionToken",
    "consumeAuthActionToken",
    "markEmailVerified",
    "invalidateAuthActionTokens",
    "purgeStaleAuthActionTokens"
  ]) {
    assert.ok(persistence.includes(marker), "missing recovery persistence marker: " + marker);
  }

  for (const marker of [
    '"/resend-verification"',
    '"/verify-email"',
    '"/forgot-password"',
    '"/reset-password"',
    "EMAIL_VERIFICATION_REQUIRED",
    "requiresEmailVerification"
  ]) {
    assert.ok(routes.includes(marker), "missing recovery route marker: " + marker);
  }

  assert.ok(bootstrap.includes("markEmailVerified"));
  assert.ok(server.includes("purgeStaleAuthActionTokens"));
  assert.ok(server.includes("Session/auth-token cleanup sweep failed"));

  assert.ok(render.includes("BREVO_API_KEY"));
  assert.ok(render.includes("AUTOPSY_EMAIL_FROM"));
  assert.ok(render.includes("AUTOPSY_PUBLIC_URL"));
  assert.ok(readme.includes("Transactional email recovery is supported through Brevo"));
  assert.ok(persistence.includes("AUTH_EMAIL_TOKEN_RESEND_COOLDOWN_MS"));
  assert.ok(persistence.includes("pg_advisory_xact_lock"));
  assert.ok(persistence.includes("FOR UPDATE"));
  assert.ok(persistence.includes('await client.query("BEGIN")'));
  assert.ok(routes.includes("resetPasswordWithToken"));
  assert.ok(routes.includes("verifyEmailWithToken"));
  assert.ok(routes.includes('invalidateAuthActionTokens(user.id, "email_verification")'));
  assert.ok(routes.includes('invalidateAuthActionTokens(user.id, "password_reset")'));
});

test("repository resources are tenant-scoped to authenticated accounts", () => {
  const routes = readRepoFile("src/routes/index.ts");
  const middleware = readRepoFile("src/middleware/repository-access.middleware.ts");
  const persistence = readRepoFile("src/modules/auth/auth.persistence.ts");
  const repositoryRoutes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const migration = readRepoFile("database/migrations/016_user_auth_and_repository_ownership.sql");

  assert.ok(routes.includes('router.use("/repositories/:repositoryId", requireRepositoryAccess);'));
  assert.ok(middleware.includes("getOwnedRepository(repositoryId, userId)"));
  assert.ok(middleware.includes('code: "REPOSITORY_NOT_FOUND"'));
  assert.ok(persistence.includes("WHERE id = $1"));
  assert.ok(persistence.includes("AND owner_user_id = $2"));
  assert.ok(repositoryRoutes.includes("ownerUserId: req.auth?.userId"));
  assert.ok(migration.includes("owner_user_id UUID"));
});

test("machine evidence ingestion remains separately authenticated", () => {
  const middleware = readRepoFile("src/middleware/repository-access.middleware.ts");
  const runtime = readRepoFile("src/modules/runtime/runtime.auth.ts");
  const deployment = readRepoFile("src/modules/deployments/deployment.auth.ts");

  assert.ok(middleware.includes("isRuntimeTelemetryAuthorized"));
  assert.ok(middleware.includes("isDeploymentEvidenceAuthorized"));
  assert.ok(runtime.includes("RUNTIME_TELEMETRY_INGEST_KEY"));
  assert.ok(deployment.includes("DEPLOYMENT_EVIDENCE_INGEST_KEY"));
});

test("repository deletion keeps an explicit lifecycle guard in the API and client", () => {
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const service = readRepoFile("src/modules/repositories/repository.service.ts");

  assert.ok(routes.includes('router.delete("/:repositoryId"'));
  assert.ok(routes.includes("REPOSITORY_DELETE_BLOCKED"));
  assert.ok(service.includes("deleteRepositoryWithStorage"));
  assert.ok(service.includes('FOR UPDATE'));
});


test("repository storage cleanup is retryable and startup-wired", () => {
  const service = readRepoFile("src/modules/repositories/repository.service.ts");
  const server = readRepoFile("src/server.ts");
  const migration = readRepoFile("database/migrations/014_repository_storage_cleanup.sql");

  assert.ok(service.includes("retryRepositoryStorageCleanup"));
  assert.ok(service.includes("repository_storage_cleanup"));
  assert.ok(server.includes("retryRepositoryStorageCleanup(20)"));
  assert.ok(migration.includes("repository_storage_cleanup"));
  assert.ok(migration.includes("completed_at"));
});


test("analysis state policy and migration serialization remain explicit", () => {
  const state = readRepoFile("src/modules/analysis/analysis-state.ts");
  const migration = readRepoFile("src/database/migrate.ts");
  const constraints = readRepoFile(
    "database/migrations/015_analysis_run_state_constraints.sql"
  );

  assert.ok(state.includes('queued: ["running", "failed"]'));
  assert.ok(state.includes("completed: []"));
  assert.ok(migration.includes('SELECT pg_advisory_lock(2147483647)'));
  assert.ok(migration.includes('SELECT pg_advisory_unlock(2147483647)'));
  assert.ok(constraints.includes("analysis_runs_status_check"));
  assert.ok(constraints.includes("analysis_runs_terminal_timestamp_check"));
});


test("public analysis errors are bounded and sanitized", () => {
  const sanitizer = readRepoFile("src/modules/analysis/analysis-error.ts");
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const worker = readRepoFile("src/workers/analysis.worker.ts");

  assert.ok(
    sanitizer.includes("MAX_PUBLIC_ANALYSIS_ERROR_LENGTH = 1_000")
  );
  assert.ok(sanitizer.includes("<managed-path>"));
  assert.ok(
    sanitizer.includes(
      ".slice(0, MAX_PUBLIC_ANALYSIS_ERROR_LENGTH - 1)"
    )
  );
  assert.ok(routes.includes("sanitizePublicAnalysisErrorMessage("));
  assert.ok(worker.includes("sanitizePublicAnalysisErrorMessage("));
});


test("AI provider transport remains bounded and redirect-safe", () => {
  const source = readRepoFile("src/modules/interpretation/interpretation.service.ts");

  assert.ok(source.includes("const MAX_AI_RESPONSE_BYTES = 256 * 1024;"));
  assert.ok(source.includes('"redirect": "error"'));
  assert.ok(
    source.includes(
      "AI provider response exceeded the configured size limit."
    )
  );
});


test("private API responses remain non-cacheable", () => {
  const app = readRepoFile("src/app.ts");
  assert.ok(app.includes('res.setHeader("Cache-Control", "no-store")'));
});


test("analysis-state migration keeps executable PostgreSQL dollar quoting", () => {
  const migration = readRepoFile(
    "database/migrations/015_analysis_run_state_constraints.sql"
  );

  assert.ok(migration.includes("DO $$\nBEGIN"));
  assert.ok(migration.includes("\nEND $$;"));
  assert.doesNotMatch(migration, /DO \$\nBEGIN/);
});


test("repository cleanup retry loop is bounded and shutdown-aware", () => {
  const server = readRepoFile("src/server.ts");

  assert.ok(
    server.includes("REPOSITORY_STORAGE_CLEANUP_INTERVAL_MS = 5 * 60_000")
  );
  assert.ok(server.includes("repositoryCleanupTimer = setInterval"));
  assert.ok(server.includes("clearInterval(repositoryCleanupTimer)"));
  assert.ok(server.includes("repositoryCleanupTimer.unref()"));
});


test("analysis discovery finishes before current evidence is mutated", () => {
  const worker = readRepoFile("src/workers/analysis.worker.ts");

  const discoveryStart = worker.indexOf(
    "const fileChurn = await discoverFileChurn("
  );
  const persistenceStart = worker.indexOf(
    "const persistedCount ="
  );
  const complexityStart = worker.indexOf(
    "const complexityEvolution ="
  );

  assert.ok(discoveryStart >= 0);
  assert.ok(persistenceStart > discoveryStart);
  assert.ok(complexityStart > discoveryStart);

  for (const marker of [
    "const dependencyEvolution =",
    "const architectureEvolution =",
    "const databaseMigrationEvolution =",
    "const testEvolution = await discoverTestEvolution("
  ]) {
    assert.ok(
      persistenceStart > worker.indexOf(marker),
      "discovery must complete before persistence marker: " + marker
    );
  }

  const couplingStart = worker.indexOf(
    "const couplingPairs = await rebuildFileChangeCoupling("
  );
  const completionStart = worker.lastIndexOf(
    'await updateAnalysisRun(analysisRunId, "completed")'
  );

  assert.ok(couplingStart > persistenceStart);
  assert.ok(completionStart > couplingStart);
});


test("analysis terminal updates preserve existing failure diagnostics when no replacement message is supplied", () => {
  const persistence = readRepoFile(
    "src/modules/repositories/repository.persistence.ts"
  );

  assert.ok(
    persistence.includes("error_message = COALESCE($3, error_message)")
  );
});


test("production-smoke workflow validates its production credential before checkout", () => {
  const workflow = readRepoFile(".github/workflows/production-smoke.yml");
  const validation = workflow.indexOf("Validate production credential");
  const checkout = workflow.indexOf("name: Checkout");
  assert.ok(validation >= 0);
  assert.ok(checkout > validation);
  assert.ok(workflow.includes('test -n "$AUTOPSY_BOOTSTRAP_EMAIL"'));
  assert.ok(workflow.includes('test -n "$AUTOPSY_BOOTSTRAP_PASSWORD"'));
  assert.ok(workflow.includes('test "${#AUTOPSY_BOOTSTRAP_PASSWORD}" -ge 12'));
});


test("analysis run history endpoint is bounded and release-visible", () => {
  const persistence = readRepoFile("src/modules/repositories/repository.persistence.ts");
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const migration = readRepoFile("database/migrations/017_analysis_run_history_index.sql");

  assert.ok(persistence.includes("export async function listAnalysisRuns("));
  assert.ok(persistence.includes("ORDER BY created_at DESC, id DESC"));
  assert.ok(routes.includes('router.get("/:repositoryId/analysis-runs"'));
  assert.ok(routes.includes("max(50)"));
  assert.ok(routes.includes("sanitizePublicAnalysisErrorMessage"));
  assert.ok(migration.includes("idx_analysis_runs_repository_created_at"));
});


test("E2E child processes receive isolated generous rate limits", () => {
  const e2e = readRepoFile("tests/e2e.import-analysis-report.test.ts");

  assert.ok(
    e2e.includes(
      'const E2E_API_RATE_LIMIT_MAX_REQUESTS = "1000";'
    )
  );
  assert.ok(
    e2e.includes(
      'const E2E_API_RATE_LIMIT_HEAVY_MAX_REQUESTS = "1000";'
    )
  );
  assert.ok(
    e2e.includes(
      "API_RATE_LIMIT_MAX_REQUESTS: E2E_API_RATE_LIMIT_MAX_REQUESTS"
    )
  );
  assert.ok(
    e2e.includes(
      "API_RATE_LIMIT_HEAVY_MAX_REQUESTS: E2E_API_RATE_LIMIT_HEAVY_MAX_REQUESTS"
    )
  );
  assert.ok(e2e.includes("delete childEnv.E2E_PORT;"));
});


test("API rate limiter remains bounded and fail-open", () => {
  const env = readRepoFile("src/config/env.ts");
  const middleware = readRepoFile("src/middleware/rate-limit.middleware.ts");
  const app = readRepoFile("src/app.ts");
  const example = readRepoFile(".env.example");

  assert.ok(env.includes("API_RATE_LIMIT_WINDOW_SECONDS"));
  assert.ok(env.includes("API_RATE_LIMIT_MAX_REQUESTS"));
  assert.ok(env.includes("API_RATE_LIMIT_HEAVY_MAX_REQUESTS"));
  assert.ok(middleware.includes("API_RATE_LIMIT_MAX_REQUESTS = 120"));
  assert.ok(middleware.includes("API_RATE_LIMIT_HEAVY_MAX_REQUESTS = 12"));
  assert.ok(middleware.includes("RATE_LIMIT_EXCEEDED"));
  assert.ok(middleware.includes("API rate limiter failed open"));
  assert.ok(app.includes('app.set("trust proxy", 1)'));
  assert.ok(app.includes('app.use("/api", rateLimitMiddleware)'));
  assert.ok(middleware.includes("resolveRateLimitCategory"));
  assert.ok(example.includes("API_RATE_LIMIT_WINDOW_SECONDS=60"));
});


test("environment example stays synchronized with the runtime configuration", () => {
  const env = readRepoFile("src/config/env.ts");
  const example = readRepoFile(".env.example");
  const names = [...env.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
  assert.ok(env.includes("AI_FALLBACK_MODEL"));
  assert.ok(example.includes("AI_FALLBACK_MODEL=gemini-3.7-flash"));
  for (const name of names) {
    assert.ok(
      new RegExp("^" + name + "=", "m").test(example),
      "missing environment example entry: " + name
    );
  }
});


test("file churn discovery paginates full Git history and uses NUL-delimited numstat", () => {
  const churn = readRepoFile("src/modules/metrics/churn.discovery.ts");
  assert.ok(churn.includes("export const GIT_LOG_PAGE_SIZE = 500"));
  assert.ok(churn.includes("const countOutput = await git.raw(["));
  assert.ok(churn.includes('"rev-list",'));
  assert.ok(churn.includes('"--all",'));
  assert.ok(churn.includes('"--count"'));
  assert.ok(churn.includes("--skip=${skip}"));
  assert.ok(churn.includes("--max-count=${GIT_LOG_PAGE_SIZE}"));
  assert.ok(churn.includes('"--format=",'));
  assert.ok(churn.includes('"-z",'));
  assert.ok(churn.includes('output.split("\\0")'));
  assert.ok(churn.includes("[\\s\\S]+"));
});


test("architecture discovery reads only bounded directory trees", () => {
  const architecture = readRepoFile("src/modules/architecture/architecture.discovery.ts");
  assert.ok(architecture.includes('"ls-tree",'));
  assert.ok(architecture.includes('"--name-only",'));
  assert.ok(architecture.includes('"-d",'));
  assert.ok(architecture.includes('const treeish = rootPath ? sha + ":" + rootPath : sha;'));
  assert.doesNotMatch(architecture, /"ls-tree", "-r"/);
});


test("complexity cache avoids recursive tree scans for blob identity", () => {
  const complexity = readRepoFile("src/modules/complexity/complexity.discovery.ts");
  assert.ok(complexity.includes("async function readBlobSha("));
  assert.ok(complexity.includes('"rev-parse",'));
  assert.ok(complexity.includes('"--verify",'));
  assert.ok(complexity.includes('objectSpec'));
  assert.doesNotMatch(complexity, /function readBlobShas\(/);
});


test("numstat evidence is merged per history page", () => {
  const discovery = readRepoFile("src/modules/commits/commit.discovery.ts");
  assert.ok(discovery.includes("const pageNumstat = await discoverNumstatPage("));
  assert.ok(discovery.includes("applyNumstat(commit, pageNumstat.get(commit.sha))"));
  assert.ok(discovery.includes("async function discoverNumstatPage("));
  assert.doesNotMatch(
    discovery,
    /const numstat = await discoverNumstat\(git, range\)/
  );
});


test("storage readiness performs real Git integrity probes", () => {
  const service = readRepoFile("src/modules/repositories/repository.service.ts");
  assert.ok(service.includes('git.raw(["rev-parse", "--is-inside-work-tree"])'));
  assert.ok(service.includes('git.raw(["rev-parse", "--git-dir"])'));
  assert.ok(service.includes('insideWorkTree.trim() === "true"'));
});


test("operational observability remains authenticated and bounded", () => {
  const routes = readRepoFile("src/routes/index.ts");
  const service = readRepoFile("src/modules/observability/observability.service.ts");
  const route = readRepoFile("src/modules/observability/observability.routes.ts");

  assert.ok(routes.includes('router.use("/observability", observabilityRouter);'));
  assert.ok(route.includes('observabilityRouter.get("/summary"'));
  assert.ok(route.includes("collectOperationalSnapshot()"));
  assert.ok(service.includes("OPERATIONAL_CHECK_TIMEOUT_MS = 2_000"));
  assert.ok(service.includes("process.uptime"));
  assert.ok(service.includes("analysisQueue"));
  assert.ok(service.includes('status: "healthy" | "degraded"'));
  assert.ok(service.includes('"degraded"'));
});

test("optional production evidence ingestion keys do not block service startup", () => {
  const env = readRepoFile("src/config/env.ts");
  const render = readRepoFile("render.yaml");

  assert.ok(env.includes("RUNTIME_TELEMETRY_INGEST_KEY"));
  assert.ok(env.includes("DEPLOYMENT_EVIDENCE_INGEST_KEY"));
  assert.doesNotMatch(
    env,
    /RUNTIME_TELEMETRY_INGEST_KEY is required in production/
  );
  assert.doesNotMatch(
    env,
    /DEPLOYMENT_EVIDENCE_INGEST_KEY is required in production/
  );
  assert.ok(render.includes("RUNTIME_TELEMETRY_INGEST_KEY"));
  assert.ok(render.includes("DEPLOYMENT_EVIDENCE_INGEST_KEY"));
});


test("private repository access stays encrypted, server-side and outside queue payloads", () => {
  const env = readRepoFile("src/config/env.ts");
  const credentials = readRepoFile("src/modules/repositories/repository-credentials.ts");
  const credentialPersistence = readRepoFile(
    "src/modules/repositories/repository-credentials.persistence.ts"
  );
  const repositoryRoutes = readRepoFile(
    "src/modules/repositories/repository.routes.ts"
  );
  const repositoryService = readRepoFile(
    "src/modules/repositories/repository.service.ts"
  );
  const gitAuth = readRepoFile(
    "src/modules/repositories/repository-git-auth.ts"
  );
  const analysisGit = readRepoFile("src/modules/analysis/analysis-git.ts");
  const worker = readRepoFile("src/workers/analysis.worker.ts");
  const queue = readRepoFile("src/modules/analysis/analysis.queue.ts");
  const migration = readRepoFile(
    "database/migrations/017_repository_access_credentials.sql"
  );
  const render = readRepoFile("render.yaml");
  const errorMiddleware = readRepoFile("src/middleware/error.middleware.ts");

  assert.ok(env.includes("REPOSITORY_CREDENTIAL_ENCRYPTION_KEY"));
  assert.ok(credentials.includes("aes-256-gcm"));
  assert.ok(credentials.includes("createCipheriv"));
  assert.ok(credentials.includes("createDecipheriv"));
  assert.ok(credentialPersistence.includes("repository_access_credentials"));
  assert.ok(migration.includes("ON DELETE CASCADE"));
  assert.ok(repositoryRoutes.includes('router.put("/:repositoryId/access"'));
  assert.ok(repositoryRoutes.includes('router.delete("/:repositoryId/access"'));
  assert.ok(repositoryRoutes.includes("encryptRepositoryAccessToken(input.accessToken)"));
  assert.ok(repositoryService.includes("withRepositoryAccess"));
  assert.ok(gitAuth.includes("GIT_ASKPASS"));
  assert.ok(gitAuth.includes("AUTOPSY_GIT_ACCESS_TOKEN"));
  assert.ok(analysisGit.includes("allowEnvironment"));
  assert.ok(worker.includes("getRepositoryAccessCredential"));
  assert.ok(worker.includes("decryptRepositoryAccessToken"));
  assert.equal(queue.includes("accessToken"), false);
  assert.ok(render.includes("REPOSITORY_CREDENTIAL_ENCRYPTION_KEY"));
  assert.ok(
    errorMiddleware.includes("REPOSITORY_ACCESS_NOT_CONFIGURED")
  );
});


test("repository access middleware reconstructs mounted paths before machine-ingest matching", () => {
  const middleware = readRepoFile("src/middleware/repository-access.middleware.ts");

  assert.ok(
    middleware.includes("const path = request.baseUrl + request.path;")
  );
  assert.ok(
    middleware.includes("runtime\\/telemetry")
  );
  assert.ok(
    middleware.includes("x-autopsy-telemetry-key")
  );
  assert.ok(
    middleware.includes("x-autopsy-deployment-key")
  );
});


test("split-origin auth exposes only csrfToken bootstrap data", () => {
  const routes = readRepoFile("src/modules/auth/auth.routes.ts");

  assert.match(routes, /Promise<string>/);
  assert.match(routes, /const csrfToken = await startSession\(request, response, user\)/);
  assert.match(routes, /csrfToken,\n\s+user: publicUser/);
  assert.match(routes, /csrfToken: getCsrfCookie\(request\) \?\? ""/);
  assert.ok(!routes.includes("sessionToken,\n      user:"));
});

test("production smoke proves the deployed product shell is current", () => {
  const smoke = readRepoFile("scripts/production-smoke.mjs");

  for (const marker of [
    'assert(home.text.includes(\'<script type="module" src="js/main.js"></script>\')',
    '["/js/main.js", "renderWorkspace"]',
    '["/js/core/api.js", "x-autopsy-csrf-token"]',
    '["/js/phases/report.js", "export function searchReport"]',
    '["/js/phases/interview.js", "REPORT_NOT_READY"]',
    '["/css/app.css", "color-scheme: light"]',
    "assert(asset.text.includes(marker)"
  ]) {
    assert.ok(smoke.includes(marker), "missing production UI smoke guardrail: " + marker);
  }
});

test("workspace views stay backed by mounted API contracts", () => {
  const router = readRepoFile("src/routes/index.ts");
  const repositories = readRepoFile("src/modules/repositories/repository.routes.ts");
  const runtime = readRepoFile("src/modules/runtime/runtime.routes.ts");
  const deployments = readRepoFile("src/modules/deployments/deployment.routes.ts");
  const report = readRepoFile("src/modules/reports/report.routes.ts");
  const interview = readRepoFile("src/modules/interview/interview.routes.ts");
  const interpretation = readRepoFile("src/modules/interpretation/interpretation.routes.ts");
  const contributors = readRepoFile("src/modules/contributors/contributor-evolution.routes.ts");
  const observability = readRepoFile("src/modules/observability/observability.routes.ts");

  for (const marker of [
    'router.use("/repositories/:repositoryId", requireRepositoryAccess);',
    'router.use("/repositories/:repositoryId/runtime", runtimeRouter);',
    'router.use("/repositories/:repositoryId/deployments", deploymentRouter);',
    'router.use("/repositories/:repositoryId/report", reportRouter);',
    'router.use("/repositories/:repositoryId/interview-stories", interviewRouter);',
    'router.use("/repositories/:repositoryId/interpretation", interpretationRouter);',
    'router.use("/repositories/:repositoryId/contributors", contributorEvolutionRouter);',
    'router.use("/observability", observabilityRouter);'
  ]) {
    assert.ok(router.includes(marker), "missing route mount: " + marker);
  }

  for (const marker of [
    'router.get("/:repositoryId/commits"',
    'router.get("/:repositoryId/timeline"',
    'router.get("/:repositoryId/architecture"',
    'router.get("/:repositoryId/dependencies"',
    'router.get("/:repositoryId/complexity"',
    'router.get("/:repositoryId/coupling"',
    'router.get("/:repositoryId/repeated-bug-areas"',
    'router.get("/:repositoryId/repeatedly-modified-files"',
    'router.get("/:repositoryId/refactors"',
    'router.get("/:repositoryId/database-migrations"',
    'router.get("/:repositoryId/test-evolution"',
    'router.get("/:repositoryId/hotspots"'
  ]) {
    assert.ok(repositories.includes(marker), "missing repository evidence route: " + marker);
  }

  for (const marker of [
    'runtimeRouter.get("/telemetry"',
    'runtimeRouter.get("/telemetry/summary"',
    'runtimeRouter.get("/historical-correlation"',
    'runtimeRouter.get("/historical-correlation/summary"',
    'runtimeRouter.get("/historical-correlation/source-context"'
  ]) {
    assert.ok(runtime.includes(marker), "missing runtime route: " + marker);
  }

  assert.ok(deployments.includes('get("/", async'));
  assert.ok(deployments.includes('deploymentRouter.get("/provenance"'));
  assert.ok(report.includes('get("/", async'));
  assert.ok(interview.includes('get("/", async'));
  assert.ok(interpretation.includes('get("/", async'));
  assert.ok(contributors.includes('get("/", async'));
  assert.ok(observability.includes('observabilityRouter.get("/summary"'));
});
