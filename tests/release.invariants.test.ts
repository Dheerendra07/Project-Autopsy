import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function readRepoFile(path: string): string {
  return readFileSync(
    fileURLToPath(new URL("../" + path, import.meta.url)),
    "utf8"
  );
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



test("production smoke covers public surface and protected API boundaries", () => {
  const script = readRepoFile("scripts/production-smoke.mjs");
  const workflow = readRepoFile(".github/workflows/production-smoke.yml");

  for (const marker of [
    "AUTOPSY_PRODUCTION_URL",
    "AUTOPSY_API_ACCESS_KEY",
    '"/health"',
    '"/ready"',
    '"/api/repositories/00000000-0000-0000-0000-000000000000"',
    "API_ACCESS_UNAUTHORIZED",
    "REPOSITORY_NOT_FOUND",
    'redirect: "error"',
    "AbortSignal.timeout(15_000)"
  ]) {
    assert.ok(
      script.includes(marker) || workflow.includes(marker),
      "missing production smoke invariant: " + marker
    );
  }

  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("secrets.AUTOPSY_API_ACCESS_KEY"));
  assert.ok(workflow.includes("node scripts/production-smoke.mjs"));
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


test("frontend JavaScript is served as a same-origin CSP-compatible asset", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(html.includes('<script src="app.js" defer></script>'));
  assert.doesNotMatch(html, /<script>\s*[\s\S]*?<\/script>/i);
  assert.doesNotThrow(() => new Function(appJs));
  assert.doesNotMatch(html, /<script[^>]+src=["'][a-z]+:\/\//i);
});

test("frontend script remains dependency-free, parseable and key-gated", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.doesNotThrow(() => new Function(appJs));
  assert.ok(html.includes('<script src="app.js" defer></script>'));
  assert.ok(appJs.includes("function storageGet(key)"));
  assert.ok(appJs.includes("function storageSet(key,value)"));
  assert.ok(appJs.includes("storageGet('autopsy.key')"));
  assert.ok(appJs.includes("storageSet('autopsy.aiKey',S.aiKey)"));
  assert.doesNotMatch(
    html + "\n" + appJs,
    /(?:AUTOPSY_API_ACCESS_KEY|AI_INTERPRETATION_ACCESS_KEY)\s*[:=]\s*['"][^'"]{12,}['"]/i
  );
});

test("web service serves the frontend and avoids a hardcoded API origin", () => {
  const app = readRepoFile("src/app.ts");
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(app.includes("express.static(publicDirectory"));
  assert.ok(app.includes('path.dirname(fileURLToPath(import.meta.url))'));
  assert.ok(app.includes('"../public"'));
  assert.ok(appJs.includes("location.origin"));
  assert.doesNotMatch(
    html + "\n" + appJs,
    /https:\/\/project-autopsy\.onrender\.com/
  );
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

test("frontend retains all primary evidence workspace views", () => {
  const html = readRepoFile("public/index.html");

  for (const view of [
    "overview",
    "history",
    "structure",
    "quality",
    "runtime",
    "report",
    "interview",
    "interpretation",
    "evidence",
    "contributors"
  ]) {
    assert.ok(html.includes('data-view="' + view + '"'));
  }
});

test("frontend dedicated evidence tables expose direct inspection hooks", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  for (const marker of [
    'inspectButton("Architecture "',
    'inspectButton("Dependency "',
    'inspectButton("Complexity "',
    'inspectButton("Coupling "',
    'inspectButton("Bug-area signal "',
    'inspectButton("Test evolution "',
    'inspectButton("Repeated file "',
    'inspectButton("Migration "'
  ]) {
    assert.ok(appJs.includes(marker), "missing inspection hook: " + marker);
  }
});

test("frontend quality workspace renders refactor evidence", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("Refactor signals"));
  assert.ok(appJs.includes("Refactor signal"));
  assert.ok(appJs.includes("Commit-subject heuristic signals; not proof of intent"));
});

test("frontend overview exposes direct evidence inspection hooks", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("inspectButton('Commit '"));
  assert.ok(appJs.includes("inspectButton('Hotspot '"));
  assert.ok(appJs.includes("Most touched files"));
});

test("frontend connection test handles invalid API base URLs", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function testConnection()");
  const end = appJs.indexOf("async function importRepo()", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const probe = appJs.slice(start, end);
  assert.ok(probe.includes("var base;"));
  assert.ok(probe.includes("safeApiBase"));
  assert.ok(probe.includes("toast(e.message||'API base URL is invalid.','bad')"));
});

test("frontend interview and refactor views match persisted evidence schemas", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("s.draftAnswer||{}"));
  assert.ok(appJs.includes("s.verification||{}"));
  assert.ok(appJs.includes('inspectButton("Inspect story evidence"'));
  assert.ok(appJs.includes("<th>Commit</th><th>Subject</th><th>Files changed</th><th>When</th>"));
  assert.ok(appJs.includes("x.subject||\"—\""));
  assert.ok(appJs.includes("x.committed_at"));
});

test("frontend AI interpretation keeps validated evidence keys inspectable", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("function grounding(keys)"));
  assert.ok(appJs.includes("s.id===parts[0]"));
  assert.ok(appJs.includes('inspectButton("Inspect supporting evidence"'));
  assert.ok(appJs.includes("Validated report claims referenced by this AI theme."));
});

test("frontend clears runtime filters when the active repository is deleted", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function deleteRepository()");
  const end = appJs.indexOf("$('settings').onclick", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const deletion = appJs.slice(start, end);
  assert.ok(
    deletion.includes(
      "S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''}"
    )
  );
});


test("frontend releases the runtime loading lock when an analysis run changes", () => {
  const appJs = readRepoFile("public/app.js");
  const runtimeStart = appJs.indexOf("async function loadRuntimeEvents");
  const runtimeEnd = appJs.indexOf("async function reloadData", runtimeStart);
  assert.ok(runtimeStart >= 0);
  assert.ok(runtimeEnd > runtimeStart);

  const runtimeBlock = appJs.slice(runtimeStart, runtimeEnd);
  assert.ok(
    runtimeBlock.includes(
      "finally{if(token===S.workspaceToken&&id===S.repoId)S.runtimeLoading=false}"
    )
  );

  const refreshStart = appJs.indexOf("async function refresh()");
  const refreshEnd = appJs.indexOf("function openSettings", refreshStart);
  assert.ok(refreshStart >= 0);
  assert.ok(refreshEnd > refreshStart);
  assert.ok(
    appJs.slice(refreshStart, refreshEnd).includes(
      "S.runtimeLoading=false"
    )
  );
});

test("frontend failure notifications are scoped to the active analysis run", () => {
  const appJs = readRepoFile("public/app.js");
  const functions = [
    ["loadProvenance", "function downloadReport"],
    ["loadReport", "async function loadInterview"],
    ["loadInterview", "async function loadInterpretation"],
    ["loadInterpretation", "function downloadReport"]
  ];

  for (const [name, endMarker] of functions) {
    const start = appJs.indexOf("async function " + name);
    const end = appJs.indexOf(endMarker, start + 1);

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block = appJs.slice(start, end);
    assert.ok(
      block.includes(
        "token===S.workspaceToken&&id===S.repoId&&runId===S.runId"
      )
    );
  }
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

test("frontend hides derived results when the analysis snapshot is stale", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function currentAnalysisSnapshot()"));
  assert.ok(
    appJs.includes(
      "rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId"
    )
  );
  assert.ok(
    appJs.includes(
      "stories&&currentAnalysisSnapshot()&&stories.analysisRunId===S.runId"
    )
  );
  assert.ok(
    appJs.includes(
      "i&&i.result&&i.result.reportFingerprint===rep.fingerprint"
    )
  );
});

test("frontend does not reuse an older run when partial evidence loading fails", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function loadData()");
  const end = appJs.indexOf("function shell(", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const loadData = appJs.slice(start, end);
  assert.ok(loadData.includes("sameSnapshot=S.dataRunId===runId"));
  assert.ok(
    loadData.includes(
      "out[k]=sameSnapshot?(previousData[k]??null):null"
    )
  );
  assert.ok(loadData.includes("S.dataRunId=runId"));
});

test("frontend clears derived results when a refresh analysis is queued", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function refresh()");
  const end = appJs.indexOf("function openSettings()", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const refresh = appJs.slice(start, end);
  assert.ok(refresh.includes("S.data.report=null"));
  assert.ok(refresh.includes("S.data.interview=null"));
  assert.ok(refresh.includes("S.data.interpretation=null"));
  assert.ok(
    refresh.indexOf("S.runId=r.analysis.id") <
      refresh.indexOf("S.data.report=null")
  );
  assert.ok(
    refresh.indexOf("S.data.interpretation=null") <
      refresh.indexOf("persist();poll()")
  );
});

test("frontend refreshes repository metadata after analysis completion", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("if(st==='completed'){");
  const end = appJs.indexOf("if(st==='failed'){", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const completion = appJs.slice(start, end);

  assert.ok(completion.includes("var latestRepo=await getRepo(repoId)"));
  assert.ok(completion.includes("S.repo=latestRepo"));
  assert.ok(completion.includes("await loadData()"));
  assert.ok(
    completion.indexOf("S.repo=latestRepo") <
      completion.indexOf("await loadData()")
  );
});
 
test("frontend connection failures remain actionable and mobile evidence controls fit", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("API access key was rejected. Open Settings and update the key."));
  assert.ok(appJs.includes("Access to this API operation was denied."));
  assert.ok(appJs.includes("Saved workspace could not be restored."));
  assert.ok(html.includes("Connection settings"));
  assert.ok(html.includes(".bar{grid-template-columns:110px 1fr 30px auto;gap:6px}"));
  assert.ok(
    appJs.includes("S.dataErrors.length?'warn':'good'")
  );
});

test("frontend workspace keeps the real connection state", () => {
  const appJs = readRepoFile("public/app.js");

  const start = appJs.indexOf("function workspace()");
  const end = appJs.indexOf("function banner(", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const workspace = appJs.slice(start, end);
  assert.ok(workspace.includes("connected(S.connectionState)"));
  assert.doesNotMatch(workspace, /connected\(true\)/);
});

test("frontend distinguishes configured credentials from verified connectivity", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("connectionState:'unknown'"));
  assert.ok(appJs.includes("state==='verified'"));
  assert.ok(appJs.includes("state==='configured'"));
  assert.ok(appJs.includes("Connection settings saved. Test the connection to verify the credentials."));
  assert.ok(appJs.includes("S.connectionState='verified'"));
  assert.ok(appJs.includes("connected('verified')"));
});

test("frontend stops polling on terminal analysis access errors", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("function poll()");
  const end = appJs.indexOf("async function mapLimited", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const poll = appJs.slice(start, end);
  assert.match(poll, /API access key was rejected\./);
  assert.match(poll, /Access denied/);
  assert.match(poll, /Analysis run unavailable/);
  assert.ok(poll.includes("The saved API access key was rejected"));
  assert.ok(poll.includes("The saved analysis run no longer exists."));
  assert.ok(poll.includes("clearInterval(S.timer);S.timer=null"));
});

test("frontend clears stale saved workspace state after a missing repository or analysis run", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function boot()");
  const end = appJs.indexOf("\n  boot()\n})();", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const boot = appJs.slice(start, end);
  assert.ok(boot.includes("message.indexOf('Request failed (404).')===0"));
  assert.ok(boot.includes("S.repoId=''"));
  assert.ok(boot.includes("S.runId=''"));
  assert.ok(boot.includes("S.data={}"));
  assert.ok(
    boot.includes(
      "S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''}"
    )
  );
  assert.ok(
    boot.includes("Saved workspace no longer exists. Start a new repository analysis.")
  );
  assert.ok(boot.includes("persist()"));
});


test("frontend retains failure-safe and stale-analysis controls", () => {
  const appJs = readRepoFile("public/app.js");

  for (const marker of [
    "function boundedFetch(url,options,timeoutMs)",
    "runtimeEventsPathWithFilter",
    "Repository head differs from the analyzed target.",
    "previousEvents",
    "Request timed out after 20 seconds."
  ]) {
    assert.ok(appJs.includes(marker), "missing frontend invariant: " + marker);
  }
});


test("Helmet keeps HTTPS upgrades production-only", () => {
  const app = readRepoFile("src/app.ts");

  assert.ok(app.includes("upgradeInsecureRequests:"));
  assert.ok(app.includes("env.NODE_ENV === " + '"production"'));
  assert.ok(app.includes("? [] : null"));
});

test("API authentication is mounted before JSON body parsing", () => {
  const app = readRepoFile("src/app.ts");
  const authIndex = app.indexOf("isApiAccessAuthorized(");
  const jsonParserIndex = app.indexOf('app.use(express.json({ limit: "1mb" }))');
  const routerIndex = app.indexOf('app.use("/api", router);');
  const authMountEnd = app.indexOf("});", authIndex);

  assert.ok(authIndex >= 0);
  assert.ok(jsonParserIndex >= 0);
  assert.ok(routerIndex >= 0);
  assert.ok(authMountEnd >= 0);
  assert.ok(authIndex < authMountEnd);
  assert.ok(authMountEnd < jsonParserIndex);
  assert.ok(jsonParserIndex < routerIndex);
  assert.equal(
    (app.match(/app\.use\("\/api", router\);/g) ?? []).length,
    1
  );
  assert.doesNotMatch(
    app.slice(Math.max(0, authIndex - 80), authMountEnd + 3),
    /,\s*router\)/
  );
});


test("repository deletion keeps an explicit lifecycle guard in the API and client", () => {
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const service = readRepoFile("src/modules/repositories/repository.service.ts");
  const html = readRepoFile("public/index.html");

  assert.ok(routes.includes('router.delete("/:repositoryId"'));
  assert.ok(routes.includes("REPOSITORY_DELETE_BLOCKED"));
  assert.ok(service.includes("deleteRepositoryWithStorage"));
  assert.ok(service.includes('FOR UPDATE'));
  assert.ok(html.includes("Delete repository data"));
  assert.ok(readRepoFile("public/app.js").includes("Permanently delete "));
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


test("frontend health probes do not attach privileged API credentials", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function testConnection()");
  const end = appJs.indexOf("async function importRepo()", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const probe = appJs.slice(start, end);
  assert.match(probe, /boundedFetch\(base\+'\/health'/);
  assert.match(probe, /boundedFetch\(base\+'\/ready'/);
  assert.ok(probe.includes("var probeHeaders=new Headers(h)"));
  assert.ok(probe.includes("probeHeaders.set('x-autopsy-api-key',key)"));
  assert.doesNotMatch(
    probe.slice(0, probe.indexOf("var probeHeaders")),
    /x-autopsy-api-key/
  );
});


test("production-smoke workflow validates its production credential before checkout", () => {
  const workflow = readRepoFile(".github/workflows/production-smoke.yml");
  const validation = workflow.indexOf("Validate production credential");
  const checkout = workflow.indexOf("name: Checkout");
  assert.ok(validation >= 0);
  assert.ok(checkout > validation);
  assert.ok(workflow.includes('test -n "$AUTOPSY_API_ACCESS_KEY"'));
  assert.ok(workflow.includes('test "${#AUTOPSY_API_ACCESS_KEY}" -ge 32'));
});


test("analysis run history endpoint is bounded and release-visible", () => {
  const persistence = readRepoFile("src/modules/repositories/repository.persistence.ts");
  const routes = readRepoFile("src/modules/repositories/repository.routes.ts");
  const migration = readRepoFile("database/migrations/017_analysis_run_history_index.sql");
  const appJs = readRepoFile("public/app.js");

  assert.ok(persistence.includes("export async function listAnalysisRuns("));
  assert.ok(persistence.includes("ORDER BY created_at DESC, id DESC"));
  assert.ok(routes.includes('router.get("/:repositoryId/analysis-runs"'));
  assert.ok(routes.includes("max(50)"));
  assert.ok(routes.includes("sanitizePublicAnalysisErrorMessage"));
  assert.ok(migration.includes("idx_analysis_runs_repository_created_at"));
  assert.ok(appJs.includes("analysisRuns:'/api/repositories/'+id+'/analysis-runs?page=1&limit=20'"));
  assert.ok(appJs.includes("analysisRuns"));
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
  for (const name of names) {
    assert.ok(
      new RegExp("^" + name + "=", "m").test(example),
      "missing environment example entry: " + name
    );
  }
});

test("frontend gives an actionable response for API rate limiting", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("if(r.status===429)"));
  assert.ok(appJs.includes("retry-after"));
  assert.ok(appJs.includes("Retry after '+retrySeconds+' seconds."));
});


test("historical source-context UI stays wired to the bounded backend projection", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(
    appJs.includes(
      "historicalSourceContext:'/api/repositories/'+id+'/runtime/historical-correlation/source-context?limit=25'"
    )
  );
  assert.ok(appJs.includes("Historical source-change context"));
  assert.ok(appJs.includes("sourceContextComplete"));
  assert.ok(appJs.includes("changedFilesTruncated"));
});


test("historical filter state resets when repository or analysis context changes", () => {
  const appJs = readRepoFile("public/app.js");
  const defaultFilter = "{windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''}";
  assert.ok(appJs.includes("S.historicalFilter=" + defaultFilter));
  const refreshStart = appJs.indexOf("async function refresh()");
  const refreshEnd = appJs.indexOf("function openSettings()", refreshStart);
  assert.ok(refreshStart >= 0);
  assert.ok(refreshEnd > refreshStart);
  const refresh = appJs.slice(refreshStart, refreshEnd);
  assert.ok(refresh.includes("S.historicalFilter=" + defaultFilter));
  assert.ok(refresh.includes("S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''}"));
  assert.ok(appJs.includes("$('new').onclick=function(){"));
  assert.ok(appJs.includes("S.historicalLoading=false;"));
  assert.ok(appJs.includes("S.analysisRunsLoading=false;"));
  assert.ok(appJs.includes("S.analysisRunsLoadToken+=1;"));
  assert.ok(appJs.includes("Saved workspace no longer exists"));
});


test("analysis run history load token resets on repository context changes", () => {
  const appJs = readRepoFile("public/app.js");
  const importStart = appJs.indexOf("async function importRepo()");
  const importEnd = appJs.indexOf("async function getRepo", importStart);
  const deleteStart = appJs.indexOf("async function deleteRepository()");
  const deleteEnd = appJs.indexOf("$('settings').onclick", deleteStart);
  assert.ok(importStart >= 0 && importEnd > importStart);
  assert.ok(deleteStart >= 0 && deleteEnd > deleteStart);
  assert.ok(appJs.slice(importStart, importEnd).includes("S.analysisRunsLoadToken+=1"));
  assert.ok(appJs.slice(deleteStart, deleteEnd).includes("S.analysisRunsLoadToken+=1"));
  assert.ok(appJs.includes("S.analysisRunsLoading=false;S.analysisRunsLoadToken+=1;"));
});


test("historical runtime numeric inputs are normalized before API requests", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function loadHistoricalRuntime()");
  const end = appJs.indexOf("async function loadMoreCommits()", start);
  assert.ok(start >= 0 && end > start);
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes("Number.isInteger(windowMinutes)"));
  assert.ok(fn.includes("Number.isInteger(minSamples)"));
  assert.ok(fn.includes("windowMinutes=60"));
  assert.ok(fn.includes("minSamples=10"));
});


test("analysis history pagination UI uses the bounded backend page", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("async function loadMoreAnalysisRuns()"));
  assert.ok(appJs.includes("/analysis-runs?page="));
  assert.ok(appJs.includes("analysis-runs-more"));
  assert.ok(appJs.includes("Load older analysis runs"));
});

test("historical runtime filters stay aligned across summary, correlation and source context", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function historicalRuntimePath(kind,page,limit,filter)"));
  assert.ok(appJs.includes("async function loadHistoricalRuntime()"));
  assert.ok(appJs.includes("Number.isInteger(windowMinutes)"));
  assert.ok(appJs.includes("Number.isInteger(minSamples)"));
  assert.ok(appJs.includes("historicalRuntimePath('summary',1,25,f)"));
  assert.ok(appJs.includes("historicalRuntimePath('correlation',1,25,f)"));
  assert.ok(appJs.includes("historicalRuntimePath('source-context',1,25,f)"));
  assert.ok(appJs.includes("historical-filter"));
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
test("frontend lifecycle invalidation prevents stale refresh and historical loads", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("historicalLoadToken:0"));

  const refresh = appJs.slice(
    appJs.indexOf("async function refresh()"),
    appJs.indexOf("function openSettings")
  );
  assert.ok(refresh.includes("S.workspaceToken+=1;"));
  assert.ok(refresh.includes("clearInterval(S.timer);S.timer=null;"));
  assert.ok(
    refresh.indexOf("S.workspaceToken+=1;") <
      refresh.indexOf("var token=S.workspaceToken,id=S.repoId;")
  );

  const reload = appJs.slice(
    appJs.indexOf("async function reloadData()"),
    appJs.indexOf("function historicalRuntimePath")
  );
  assert.ok(reload.includes("var token=S.workspaceToken,id=S.repoId,runId=S.runId;"));
  assert.ok(reload.includes("if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return;"));

  const historical = appJs.slice(
    appJs.indexOf("async function loadHistoricalRuntime()"),
    appJs.indexOf("async function loadMoreCommits()")
  );
  assert.ok(historical.includes("loadToken=++S.historicalLoadToken"));
  assert.ok(historical.includes("loadToken!==S.historicalLoadToken"));
  assert.ok(historical.includes("&&loadToken===S.historicalLoadToken)S.historicalLoading=false;"));
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
