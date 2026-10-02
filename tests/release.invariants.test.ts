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
    "AUTOPSY_BOOTSTRAP_EMAIL",
    "AUTOPSY_BOOTSTRAP_PASSWORD",
    '"/health"',
    '"/ready"',
    '"/api/auth/login"',
    '"/api/auth/me"',
    '"/api/repositories/00000000-0000-0000-0000-000000000000"',
    "AUTH_REQUIRED",
    "REPOSITORY_NOT_FOUND",
    "autopsy_session=",
    "autopsy_csrf=",
    'redirect: "manual"',
    "AbortSignal.timeout(15_000)"
  ]) {
    assert.ok(
      script.includes(marker) || workflow.includes(marker),
      "missing production smoke invariant: " + marker
    );
  }

  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(workflow.includes("secrets.AUTOPSY_BOOTSTRAP_EMAIL"));
  assert.ok(workflow.includes("secrets.AUTOPSY_BOOTSTRAP_PASSWORD"));
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


test("frontend product surface stays guided, progressive and evidence-readable", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  for (const marker of [
    "Understand",
    "Validate",
    "Outputs",
    "Explore",
    "Insights",
    "class=\"getting-started\"",
    "Advanced connection settings",
    "data-view=\"operations\"",
    "Operations",
    "id=\"drawerSummary\"",
    "id=\"drawerRaw\""
  ]) {
    assert.ok(html.includes(marker), "missing product UI marker: " + marker);
  }

  for (const marker of [
    "function loadingPage(title,message)",
    "function errorPage(title,message,actionLabel,action)",
    "function evidenceSummary(payload)",
    "Advanced filters",
    "Advanced identity filters",
    "S.view!=='report'",
    "S.view!=='interview'",
    "S.view!=='interpretation'",
    "e.key==='Escape'",
    "Try again",
    "async function loadOperations(force,silent)",
    "/api/observability/summary",
    "acceptStatuses:[503]",
    "operationalLoadToken",
    "operationalTimer",
    "operationalPollMs",
    "preserveScroll:true",
    "options.preserveScroll",

    "function stopOperationsMonitoring()",
    "function scheduleOperationsMonitoring()",
    "syncOperationsMonitoring();toast('Refresh analysis queued')",
    "visibilitychange",
    "analysisQueue"
  ]) {
    assert.ok(appJs.includes(marker), "missing product interaction marker: " + marker);
  }

  for (const legacyLabel of [
    "Interpret with AI",
    "Generate interpretation",
    "AI interpretation",
    "AI theme"
  ]) {
    assert.equal(
      html.includes(legacyLabel) || appJs.includes(legacyLabel),
      false,
      "legacy AI-first UI label still present: " + legacyLabel
    );
  }

  assert.ok(appJs.includes("if($('drawerSummary'))$('drawerSummary').innerHTML"));
  assert.ok(appJs.includes("if($('drawerRaw'))$('drawerRaw').open=false"));
  const css = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || "";
  assert.ok(css.includes(".drawer-actions{display:flex;gap:7px;align-items:center;flex:0 0 auto}"));
  assert.equal(css.includes("}gap:7px;"), false);

});


test("frontend overview exposes command-center snapshot context", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");
  const surface = html + "\n" + appJs;

  for (const marker of [
    "overview-context",
    "overview-journey",
    "journey-step",
    "overview-insight-grid",
    "posture-list",
    "target-stack",
    "CURRENT SNAPSHOT"
  ]) {
    assert.ok(surface.includes(marker), "missing overview UI marker: " + marker);
  }

  for (const marker of [
    "CURRENT SNAPSHOT",
    "Exact run boundary",
    "Evidence posture",
    "What this snapshot can support",
    "Evidence → analysis → inspection"
  ]) {
    assert.ok(surface.includes(marker), "missing overview command-center marker: " + marker);
  }

  const overviewStart = appJs.indexOf("function overview()");
  const overviewEnd = appJs.indexOf("function historyView()", overviewStart);
  assert.ok(overviewStart >= 0);
  assert.ok(overviewEnd > overviewStart);
  assert.ok(appJs.slice(overviewStart, overviewEnd).includes("currentAnalysisSnapshot()"));
  assert.ok(appJs.slice(overviewStart, overviewEnd).includes("snapshotState()"));
  assert.ok(appJs.slice(overviewStart, overviewEnd).includes("a.targetHeadSha"));
});

test("frontend structure workspace exposes the architecture map surface", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");
  const surface = html + "\n" + appJs;

  for (const marker of [
    "structure-summary",
    "dep-pulse",
    "structure-footnote",
    "ARCHITECTURE MAP",
    "DEPENDENCY PULSE"
  ]) {
    assert.ok(surface.includes(marker), "missing structure UI marker: " + marker);
  }

  const start = appJs.indexOf("function structure()");
  const end = appJs.indexOf("function quality()", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const structure = appJs.slice(start, end);
  assert.ok(structure.includes("architectureMap(ar)"));
  assert.ok(structure.includes("dependencyKinds"));
  assert.ok(structure.includes("complexityDelta"));
});

test("frontend quality workspace exposes an evidence matrix", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  for (const marker of [
    "quality-map",
    "quality-map-card",
    "quality-mini-list"
  ]) {
    assert.ok(html.includes(marker), "missing quality UI style marker: " + marker);
  }

  const start = appJs.indexOf("function quality()");
  const end = appJs.indexOf("function runtimeFilterDate", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const quality = appJs.slice(start, end);
  assert.ok(quality.includes("HISTORICAL SIGNALS"));
  assert.ok(quality.includes("TEST EVIDENCE"));
  assert.ok(quality.includes("SCHEMA EVIDENCE"));
  assert.ok(quality.includes("signalTotal"));
  assert.ok(quality.includes("migrationOps"));
  assert.ok(quality.includes("testDelta"));
  assert.ok(quality.includes("Subject-based historical bug/fix signal"));
});


test("frontend controls have explicit handlers and every workspace view is wired", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  for (const id of [
    "settings",
    "refresh",
    "new",
    "close",
    "deleteRepository",
    "testConnection",
    "save",
    "confirmCancel",
    "confirmConfirm",
    "drawerCopy",
    "drawerClose"
  ]) {
    assert.ok(
      appJs.includes("$('" + id + "')"),
      "missing handler reference for static control: " + id
    );
  }

  assert.ok(appJs.includes("$('form').onsubmit=function"));
  assert.ok(appJs.includes("$('nav').onclick=function"));
  assert.ok(appJs.includes("$('root').onclick=function"));

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
    "contributors",
    "operations"
  ]) {
    assert.ok(
      html.includes('data-view="' + view + '"'),
      "missing navigation control for view: " + view
    );
    assert.ok(
      appJs.includes("'" + view + "'"),
      "missing frontend contract for view: " + view
    );
  }

  for (const action of [
    "report",
    "interview",
    "interpretation",
    "download",
    "more-commits",
    "more-timeline",
    "analysis-runs-more",
    "reload-data",
    "reload-view",
    "runtime-filter",
    "runtime-clear-filter",
    "runtime-more",
    "historical-filter",
    "historical-clear-filter",
    "operations-refresh",
    "operations-retry"
  ]) {
    assert.ok(
      appJs.includes("===" + "'" + action + "'"),
      "missing delegated action handler: " + action
    );
  }
});


test("frontend JavaScript is served as a same-origin CSP-compatible asset", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(html.includes('<script src="app.js" defer></script>'));
  assert.doesNotMatch(html, /<script>\s*[\s\S]*?<\/script>/i);
  assert.doesNotThrow(() => new Function(appJs));
  assert.doesNotMatch(html, /<script[^>]+src=["'][a-z]+:\/\//i);
});

test("frontend script remains dependency-free, parseable and session-based", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.doesNotThrow(() => new Function(appJs));
  assert.ok(html.includes('<script src="app.js" defer></script>'));
  assert.ok(html.includes('id="authForm"'));
  assert.ok(html.includes('id="authEmail"'));
  assert.ok(html.includes('id="authPassword"'));
  assert.ok(appJs.includes("credentials:'include'"));
  assert.ok(appJs.includes("readCookie('autopsy_csrf')"));
  assert.ok(appJs.includes("x-autopsy-csrf-token"));
  assert.ok(appJs.includes("S.legacyMigrationKey=storageGet('autopsy.key')"));
  assert.ok(appJs.includes("'/api/auth/migrate-legacy'"));
  assert.doesNotMatch(appJs, /storageSet\(['"]autopsy\.(key|aiKey)['"]/);
  assert.doesNotMatch(appJs, /S\.key\b|S\.aiKey\b/);
  assert.doesNotMatch(
    html + "\n" + appJs,
    /(?:AUTOPSY_API_ACCESS_KEY|AI_INTERPRETATION_ACCESS_KEY)\s*[:=]\s*['"][^'"]{12,}['"]/i
  );
});

test("frontend resolves the split Render UI/API deployment without persisting a stale UI origin", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("function defaultApiBase()"));
  assert.ok(appJs.includes("host.endsWith('.onrender.com')"));
  assert.ok(appJs.includes("label.endsWith('-ui')"));
  assert.ok(appJs.includes("function initialApiBase()"));
  assert.ok(appJs.includes("stored===location.origin"));
  assert.ok(appJs.includes("return fallback"));
});

test("frontend recovers from a previously saved split Render UI origin", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("storedHost.endsWith('-ui.onrender.com')"));
  assert.ok(appJs.includes("apiHost=storedHost.slice(0,-'-ui.onrender.com'.length)+'.onrender.com'"));
  assert.ok(appJs.includes("storageSet('autopsy.api',normalized)"));
  assert.ok(appJs.includes("storedHost!==location.hostname.toLowerCase()"));
});

test("web service serves the frontend with dependency-free client routing logic", () => {
  const app = readRepoFile("src/app.ts");
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(app.includes("express.static(publicDirectory"));
  assert.ok(app.includes('path.dirname(fileURLToPath(import.meta.url))'));
  assert.ok(app.includes('"../public"'));
  assert.ok(appJs.includes("location.origin"));
  assert.ok(appJs.includes("defaultApiBase()"));
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
  assert.ok(probe.includes("var base=safeApiBase($('api').value);"));
  assert.ok(probe.includes("safeApiBase"));
  assert.ok(probe.includes("API base URL is invalid."));
  assert.ok(probe.includes("S.connectionState='rejected';"));
  assert.ok(probe.includes("connected('rejected');"));
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
  assert.ok(appJs.includes("Validated report claims referenced by this theme."));
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
      "S.runtimeLoading=false;actionBusy('runtime-filter',false)"
    )
  );

  const refreshStart = appJs.indexOf("async function refresh()");
  const refreshEnd = appJs.indexOf("function openSettings(", refreshStart);
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
  const end = appJs.indexOf("function openSettings(", start);

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

  assert.ok(appJs.includes("Your session has expired. Sign in again."));
  assert.ok(appJs.includes("Access to this API operation was denied."));
  assert.ok(appJs.includes("You are not signed in."));
  assert.ok(html.includes("Account & workspace"));
  assert.ok(html.includes(".bar{grid-template-columns:110px 1fr 30px auto;gap:6px}"));
  assert.ok(appJs.includes("S.connectionState='rejected';"));
  assert.ok(appJs.includes("S.dataErrors.length"));
});

test("frontend workspace keeps the real connection state", () => {
  const appJs = readRepoFile("public/app.js");

  const start = appJs.indexOf("function workspace()");
  const end = appJs.indexOf("function openSettings(trigger)", start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  const workspace = appJs.slice(start, end);
  assert.ok(workspace.includes("connected(S.connectionState)"));
  assert.ok(workspace.includes("syncAnalysisRefreshControl()"));
  assert.doesNotMatch(workspace, /connected\(true\)/);
});

test("frontend distinguishes signed-in state from an unauthenticated session", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("connectionState:'unknown'"));
  assert.ok(appJs.includes("state==='verified'"));
  assert.ok(appJs.includes("state==='rejected'"));
  assert.ok(appJs.includes("Your session has expired. Sign in again."));
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
  assert.match(poll, /Your session has expired\./);
  assert.match(poll, /Access denied/);
  assert.match(poll, /Analysis run unavailable/);
  assert.ok(poll.includes("Your account session has expired"));
  assert.ok(poll.includes("The saved analysis run no longer exists."));
  assert.ok(poll.includes("clearInterval(S.timer);S.timer=null"));
});

test("frontend restores saved work only through the authenticated session", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("async function restoreSavedWorkspace()"));
  assert.ok(appJs.includes("if(!S.user||!S.repoId||!S.runId)return false"));
  assert.ok(appJs.includes("async function loadRecentRepositories()"));
  assert.ok(appJs.includes("api('/api/repositories?limit=20')"));
  assert.ok(appJs.includes("storageRemove('autopsy.key')"));
  assert.ok(appJs.includes("storageRemove('autopsy.aiKey')"));
});


test("frontend retains failure-safe and stale-analysis controls", () => {
  const appJs = readRepoFile("public/app.js");

  for (const marker of [
    "function boundedFetch(url,options,timeoutMs)",
    "runtimeEventsPathWithFilter",
    "previousEvents",
    "Request timed out after 20 seconds.",
    "function workspace()",
    "function landing()"
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
  const appJs = readRepoFile("public/app.js");
  const env = readRepoFile("src/config/env.ts");
  const render = readRepoFile("render.yaml");

  assert.ok(authRoutes.includes('authRouter.post("/migrate-legacy"'));
  assert.ok(authRoutes.includes("x-autopsy-api-key"));
  assert.ok(env.includes("AUTOPSY_API_ACCESS_KEY"));
  assert.ok(render.includes("Temporary compatibility secret used only by the one-time legacy workspace migration."));
  assert.ok(render.includes("key: AUTOPSY_API_ACCESS_KEY"));
  assert.ok(appJs.includes("S.legacyMigrationKey=storageGet('autopsy.key')"));
  assert.ok(appJs.includes("S.authMode==='migrate'"));
  assert.ok(appJs.includes("var migrating=S.authMode==='migrate'"));
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
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

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
  assert.ok(html.includes('id="passwordForm"'));
  assert.ok(html.includes('id="sessionsList"'));
  assert.ok(appJs.includes("async function changePassword()"));
  assert.ok(appJs.includes("async function loadSecuritySessions()"));
  assert.ok(appJs.includes("async function revokeOneSession("));
});




test("account recovery and transactional email contracts remain explicit", () => {
  const env = readRepoFile("src/config/env.ts");
  const migration = readRepoFile("database/migrations/018_auth_email_recovery.sql");
  const email = readRepoFile("src/modules/auth/auth.email.ts");
  const persistence = readRepoFile("src/modules/auth/auth.persistence.ts");
  const routes = readRepoFile("src/modules/auth/auth.routes.ts");
  const bootstrap = readRepoFile("src/modules/auth/auth.bootstrap.ts");
  const server = readRepoFile("src/server.ts");
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");
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

  for (const marker of [
    "authForgotLink",
    "forgotForm",
    "resetForm",
    "verifyPanel",
    "resendVerification",
    "verifySubmit"
  ]) {
    assert.ok(html.includes(marker), "missing recovery UI marker: " + marker);
  }

  for (const marker of [
    "submitForgotPassword",
    "resetPasswordFromLink",
    "verifyEmail",
    "consumeAuthLink",
    "auth-verify=",
    "auth-reset=",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email"
  ]) {
    assert.ok(appJs.includes(marker), "missing recovery client marker: " + marker);
  }

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
  assert.doesNotThrow(() => new Function(appJs));
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
  const html = readRepoFile("public/index.html");

  assert.ok(routes.includes('router.delete("/:repositoryId"'));
  assert.ok(routes.includes("REPOSITORY_DELETE_BLOCKED"));
  assert.ok(service.includes("deleteRepositoryWithStorage"));
  assert.ok(service.includes('FOR UPDATE'));
  assert.ok(html.includes("Delete repository data"));
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function confirmDelete(name)"));
  assert.ok(appJs.includes("This permanently removes the imported repository and its persisted Autopsy evidence."));
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


test("frontend connection verification uses the account session without privileged API keys", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function testConnection()");
  const end = appJs.indexOf("async function importRepo()", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const probe = appJs.slice(start, end);
  assert.match(probe, /boundedFetch\(base\+'\/health'/);
  assert.match(probe, /boundedFetch\(base\+'\/ready'/);
  assert.ok(probe.includes("base+'/api/auth/me'"));
  assert.ok(probe.includes("credentials:'include'"));
  assert.doesNotMatch(probe, /x-autopsy-api-key/);
  assert.doesNotMatch(probe, /x-autopsy-ai-access-key/);
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
  const refreshEnd = appJs.indexOf("function openSettings(", refreshStart);
  assert.ok(refreshStart >= 0);
  assert.ok(refreshEnd > refreshStart);
  const refresh = appJs.slice(refreshStart, refreshEnd);
  assert.ok(refresh.includes("S.historicalFilter=" + defaultFilter));
  assert.ok(refresh.includes("S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''}"));
  assert.ok(appJs.includes("S.historicalLoading=false;"));
  assert.ok(appJs.includes("S.analysisRunsLoading=false;"));
  assert.ok(appJs.includes("S.analysisRunsLoadToken+=1;"));
  assert.ok(appJs.includes("clearWorkspaceState();"));
  assert.ok(appJs.includes("workspace();"));
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
  assert.ok(reload.includes("var token=S.workspaceToken,id=S.repoId,runId=S.runId,view=S.view;"));
  assert.ok(reload.includes("if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return;"));

  const historical = appJs.slice(
    appJs.indexOf("async function loadHistoricalRuntime()"),
    appJs.indexOf("async function loadMoreCommits()")
  );
  assert.ok(historical.includes("loadToken=++S.historicalLoadToken"));
  assert.ok(historical.includes("loadToken!==S.historicalLoadToken"));
  assert.ok(historical.includes("&&loadToken===S.historicalLoadToken)S.historicalLoading=false;"));
});



test("frontend loads evidence by active workspace view", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("const VIEW_DATA="));
  assert.ok(appJs.includes("overview:['commits','analysisRuns','hotspots','contributors']"));
  assert.ok(appJs.includes("history:['commits','timeline']"));
  assert.ok(appJs.includes("structure:['architecture','dependencies','complexity','coupling']"));
  assert.ok(appJs.includes("quality:['bugs','repeated','refactors','migrations','tests','testSummary']"));
  assert.ok(appJs.includes("runtime:['runtime','runtimeEvents','deployments','historicalSummary','historicalCorrelation','historicalSourceContext']"));
  assert.ok(appJs.includes("async function loadViewData(view,options)"));
  assert.ok(appJs.includes("if(!options.skipLoad&&VIEW_DATA[v]&&!hasViewData(v))loadViewData(v)"));
  assert.ok(appJs.includes("await loadViewData(initialView)"));
  assert.ok(appJs.includes("setView(view,{skipLoad:true})"));
});


test("frontend preserves developer navigation state across view changes and refresh", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("const VALID_VIEWS="));
  assert.ok(appJs.includes("function viewFromHash()"));
  assert.ok(appJs.includes("S.viewScroll[previous]=window.scrollY||0"));
  assert.ok(appJs.includes("history.pushState(null,'','#'+v)"));
  assert.ok(appJs.includes("window.addEventListener('hashchange'"));
  assert.ok(appJs.includes("var initialView=viewFromHash()"));
  assert.ok(appJs.includes("requestAnimationFrame(function(){window.scrollTo(0,restore)})"));
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


test("frontend view filters provide local search state without extra API traffic", () => {
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("viewFilter:{}"));
  assert.ok(appJs.includes("function viewFilterMarkup()"));
  assert.ok(appJs.includes("function applyViewFilter()"));
  assert.ok(appJs.includes("function bindViewSearch()"));
  assert.ok(appJs.includes("Filters the already-loaded evidence locally"));
  assert.ok(appJs.includes("S.viewFilter[S.view]=input.value"));
  assert.ok(appJs.includes("e.key==='/'"));
  assert.ok(appJs.includes("document.activeElement===$('viewSearch')"));
  assert.ok(appJs.includes("S.viewFilter={}"));
});


test("frontend validates runtime filter ranges and revision format before requests", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function loadRuntimeEvents(");
  const end = appJs.indexOf("async function loadMoreAnalysisRuns()", start);
  assert.ok(start >= 0 && end > start);
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes("From must be earlier than To."));
  assert.ok(fn.includes("Revision SHA must be exactly 40 or 64 hexadecimal characters."));
  assert.ok(fn.includes("new Date(f.from).getTime()>=new Date(f.to).getTime()"));
  assert.ok(fn.includes("/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/"));
});


test("frontend renders explicit empty states for empty evidence tables", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function ensureTableEmptyStates()"));
  assert.ok(appJs.includes("No evidence is available in this table."));
  assert.ok(appJs.includes("data-empty-state"));
  assert.ok(appJs.includes("if(row.getAttribute('data-empty-state')==='true'){row.hidden=true;return}"));
  assert.ok(appJs.includes("ensureTableEmptyStates();"));
});


test("frontend navigation writes browser history for user-driven view changes", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("if(!options.fromHash&&location.hash!=='#'+v)history.pushState(null,'','#'+v);"));
  assert.ok(appJs.includes("window.addEventListener('hashchange'"));
  assert.doesNotMatch(appJs, /if\(!options\.fromHash&&location\.hash!==\'#\'\+v\)history\.replaceState/);
});


test("frontend marks rejected session state instead of leaving stale verified state", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("var verified=state==='verified',rejected=state==='rejected';"));
  assert.ok(appJs.includes("rejected?'Access rejected'"));
  assert.ok(appJs.includes("S.connectionState='rejected';"));
  assert.ok(appJs.includes("connected('rejected');"));
});

test("frontend connection verification preserves explicit rejected session state", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function testConnection()");
  const end = appJs.indexOf("async function api(", start);
  assert.ok(start >= 0 && end > start);
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes("message==='You are not signed in.'"));
  assert.ok(fn.includes("S.connectionState='unknown';"));
  assert.ok(fn.includes("S.connectionState='rejected';"));
  assert.ok(fn.includes("connected('rejected');"));
});

test("frontend history renders full loaded pages and paginates timeline evidence", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("t.slice(0,50).map(function(x)"));
  assert.ok(appJs.includes("c.slice(0,50).map(function(x)"));
  assert.ok(appJs.includes("async function loadMoreTimeline()"));
  assert.ok(appJs.includes("/timeline?page="));
  assert.ok(appJs.includes("more-timeline"));
  assert.ok(appJs.includes("Load next 50 timeline events"));
  assert.ok(appJs.includes("timelineLoadToken"));
});


test("frontend labels snapshot freshness consistently across workspace views", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function snapshotState()"));
  assert.ok(appJs.includes("Snapshot current"));
  assert.ok(appJs.includes("Snapshot stale"));
  assert.ok(appJs.includes("Analysis updating"));
  assert.ok(appJs.includes("function shell(title,desc,actions){var toolbar=viewFilterMarkup(),snap=snapshotState()"));
  assert.ok(appJs.includes("snapshot-pill"));
});


test("frontend evidence inspector supports copy and returns focus to the invoking control", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("currentEvidence:null"));
  assert.ok(appJs.includes("function copyEvidence()"));
  assert.ok(appJs.includes("navigator.clipboard.writeText(JSON.stringify(x.payload,null,2))"));
  assert.ok(appJs.includes("openEvidence(ev.getAttribute('data-evidence-id'),ev)"));
  assert.ok(appJs.includes("S.focusReturn=trigger||document.activeElement"));
  assert.ok(appJs.includes("requestAnimationFrame(function(){try{focus.focus()}catch(e){}})"));
  assert.ok(indexHtml.includes('id="drawerCopy"'));
  assert.ok(indexHtml.includes('role="dialog" aria-modal="true"'));
});


test("frontend deployment provenance participates in evidence inspector copy and focus restoration", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("async function loadProvenance(deploymentId,trigger)"));
  assert.ok(appJs.includes("S.currentEvidence={label:'Provenance · '+deploymentId"));
  assert.ok(appJs.includes("loadProvenance(pd.getAttribute('data-deployment-id'),pd)"));
});


test("frontend loaded evidence tables support stable keyboard-accessible sorting", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("tableSort:{}"));
  assert.ok(appJs.includes("function sortableValue(text)"));
  assert.ok(appJs.includes("function sortTable(table,index,direction)"));
  assert.ok(appJs.includes("function bindTableSorts()"));
  assert.ok(appJs.includes("aria-sort"));
  assert.ok(appJs.includes("th.onkeydown"));
  assert.ok(appJs.includes("sortTable(table,column,next)"));
  assert.ok(appJs.includes("S.tableSort={};"));
});


test("frontend runtime datetime filters round-trip between local inputs and API-safe timestamps", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function runtimeInputDate(value)"));
  assert.ok(appJs.includes("esc(runtimeInputDate(S.runtimeFilter.from))"));
  assert.ok(appJs.includes("esc(runtimeInputDate(S.runtimeFilter.to))"));
  assert.ok(appJs.includes("['rtFrom','rtTo','rtDeployment','rtRevision','rtEnvironment','rtOperation']"));
});


test("frontend destructive actions use an in-product confirmation flow", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("function confirmDelete(name)"));
  assert.ok(appJs.includes("if(!await confirmDelete(name))return;"));
  assert.doesNotMatch(appJs, /window\.confirm\('Permanently delete/);
  assert.ok(appJs.includes("finishConfirm(false)"));
  assert.ok(appJs.includes("confirmResolver:null"));
  assert.ok(indexHtml.includes('id="confirmModal"'));
  assert.ok(indexHtml.includes('id="confirmCancel"'));
  assert.ok(indexHtml.includes('id="confirmConfirm"'));
});


test("frontend navigation exposes accessible active state and deterministic browser titles", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("const VIEW_TITLES="));
  assert.ok(appJs.includes("b.setAttribute('aria-current','page')"));
  assert.ok(appJs.includes("document.title='Project Autopsy — '+(VIEW_TITLES[v]||'Workspace')"));
  assert.ok(appJs.includes("document.title='Project Autopsy — Engineering Evidence'"));
  assert.ok(indexHtml.includes('href="#overview" aria-label="Project Autopsy overview"'));
  assert.ok(indexHtml.includes('class="skip-link" href="#root"'));
  assert.ok(indexHtml.includes('id="root" tabindex="-1"'));
});


test("frontend evidence explorer exposes an evidence-family index", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("var families=["));
  assert.ok(appJs.includes("loaded sample"));
  assert.ok(appJs.includes("Counts describe the loaded UI sample, not repository totals."));
  assert.ok(indexHtml.includes(".evidence-overview"));
  assert.ok(indexHtml.includes(".evidence-families"));
});

test("frontend contributors surface exposes a descriptive activity pulse", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("var pulse=items.slice().sort"));
  assert.ok(appJs.includes("Activity pulse"));
  assert.ok(appJs.includes("Ownership / effort / intent"));
  assert.ok(indexHtml.includes(".contributor-overview"));
  assert.ok(indexHtml.includes(".contrib-track"));
});

test("frontend runtime surface exposes an explicit provenance posture", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("var runtimePosture=["));
  assert.ok(appJs.includes("provenance kept explicit"));
  assert.ok(appJs.includes("direct runtime samples"));
  assert.ok(indexHtml.includes(".runtime-posture"));
  assert.ok(indexHtml.includes(".runtime-posture-grid"));
});


test("frontend report surface exposes a claim and evidence posture", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("var sections=Array.isArray(rep.sections)?rep.sections:[],claims=0,evidenceRefs=0,limited=0"));
  assert.ok(appJs.includes("Evidence posture"));
  assert.ok(appJs.includes("Report map"));
  assert.ok(indexHtml.includes(".report-posture"));
  assert.ok(indexHtml.includes(".report-index-row"));
});

test("frontend interview surface exposes evidence and verification posture", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("var evidenceLinked=0,verificationNotes=0"));
  assert.ok(appJs.includes("Interview evidence map"));
  assert.ok(appJs.includes("truth-first"));
  assert.ok(indexHtml.includes(".interview-posture"));
  assert.ok(indexHtml.includes(".story-topline"));
});

test("frontend insights surface exposes explicit grounding posture", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("var themeRefs=themes.reduce"));
  assert.ok(appJs.includes("Grounding posture"));
  assert.ok(appJs.includes("limitations kept visible"));
  assert.ok(indexHtml.includes(".insight-posture"));
  assert.ok(indexHtml.includes(".insight-posture-grid"));
});


test("frontend distinguishes evidence refresh from full analysis reruns", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("const RELOADABLE_VIEWS=['overview','history','structure','quality','evidence','contributors'];"));
  assert.ok(appJs.includes("async function reloadCurrentView()"));
  assert.ok(appJs.includes("await loadViewData(view,{force:true})"));
  assert.ok(appJs.includes("data-action=\"reload-view\""));
  assert.ok(appJs.includes("a.getAttribute('data-action')==='reload-view'"));
  assert.ok(appJs.includes("Refresh data"));
  assert.ok(appJs.includes("!options.force&&hasViewData(view)"));
  assert.doesNotMatch(appJs, /RELOADABLE_VIEWS=\[.*runtime/);
});


test("frontend view loading is single-flight and workspace-safe", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("viewLoading:{}"));
  assert.ok(appJs.includes("||S.viewLoading[view])return"));
  assert.ok(appJs.includes("S.viewLoading[view]=loadToken"));
  assert.ok(appJs.includes("if(S.viewLoading[view]===loadToken)delete S.viewLoading[view]"));
  assert.ok(appJs.includes("S.viewFilter={};S.tableSort={};S.viewLoading={};"));
});


test("frontend keeps the newly queued analysis run visible during refresh", () => {
  const appJs = readRepoFile("public/app.js");
  const importStart = appJs.indexOf("async function importRepo()");
  const importEnd = appJs.indexOf("async function getRepo", importStart);
  const refreshStart = appJs.indexOf("async function refresh()");
  const refreshEnd = appJs.indexOf("function openSettings(", refreshStart);
  assert.ok(importStart >= 0 && importEnd > importStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  assert.ok(appJs.slice(importStart, importEnd).includes("S.analysis=r.analysis"));
  assert.ok(appJs.slice(refreshStart, refreshEnd).includes("S.runId=r.analysis.id;S.analysis=r.analysis;"));
  assert.doesNotMatch(appJs.slice(refreshStart, refreshEnd), /S\.analysis=null;/);
});


test("frontend provides lightweight evidence refresh and a safe source-repository shortcut", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("const RELOADABLE_VIEWS=['overview','history','structure','quality','evidence','contributors'];"));
  assert.ok(appJs.includes("function safeExternalUrl(value)"));
  assert.ok(appJs.includes("Open repository ↗"));
  assert.ok(appJs.includes("target=\"_blank\" rel=\"noopener noreferrer\""));
});


test("frontend shows targeted evidence refresh progress and disables duplicate reload interaction", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("loading=!!S.viewLoading[S.view]"));
  assert.ok(appJs.includes("disabled aria-busy=\"true\""));
  assert.ok(appJs.includes("loading?'Refreshing…':'Refresh data'"));
  assert.ok(indexHtml.includes("button:disabled{opacity:.55;cursor:wait"));
});

test("frontend clears targeted refresh state before rerendering the completed view", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function loadViewData(view,options)");
  const end = appJs.indexOf("function metric(", start);
  assert.ok(start >= 0 && end > start);
  const fn = appJs.slice(start, end);
  assert.ok(
    fn.indexOf(
      "if(S.viewLoading[view]===loadToken)delete S.viewLoading[view];setView(view,{skipLoad:true})"
    ) >= 0
  );
  assert.ok(fn.includes("actionBusy('reload-view',false)"));
});

test("frontend gives generated evidence actions single-flight busy feedback", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("reportLoading:false"));
  assert.ok(appJs.includes("interviewLoading:false"));
  assert.ok(appJs.includes("interpretationLoading:false"));
  assert.ok(appJs.includes("actionBusy('report',true,'Generating…')"));
  assert.ok(appJs.includes("actionBusy('interview',true,'Loading…')"));
  assert.ok(appJs.includes("actionBusy('interpretation',true,'Generating…')"));
});

test("frontend restores settings focus and moves evidence inspector focus on open", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("settingsFocus:null"));
  assert.ok(appJs.includes("function openSettings(trigger)"));
  assert.ok(appJs.includes("requestAnimationFrame(function(){$('drawerClose').focus()})"));
  assert.ok(appJs.includes("$('settings').onclick=function(){S.user?openSettings(this):openAuth('login')};"));
});

test("frontend keeps browser history API unshadowed by the History view renderer", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function historyView()"));
  assert.ok(appJs.includes("history.pushState(null,'','#'+v)"));
  assert.doesNotMatch(appJs, /function history\(\)\{/);
});

test("frontend prevents duplicate analysis refresh and connection probes", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("refreshLoading:false"));
  assert.ok(appJs.includes("if(S.refreshLoading)return"));
  assert.ok(appJs.includes("refreshButton.disabled=true"));
  assert.ok(appJs.includes("connectionTesting:false"));
  assert.ok(appJs.includes("if(S.connectionTesting)return"));
  assert.ok(appJs.includes("verifyButton.disabled=true"));
});

test("frontend prevents duplicate destructive confirmation requests", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("if(S.confirmResolver)return Promise.resolve(false);"));
});

test("frontend evidence explorer search has an explicit accessible name", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes('id="evidenceSearch" class="search" aria-label="Filter evidence records"'));
});

test("frontend gates output actions against the current evidence snapshot", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("actions=current?'<button class=\"btn\" data-action=\"download\">Download JSON</button><button class=\"btn\" data-action=\"interpretation\">Generate insights</button>':''"));
  assert.ok(appJs.includes("data-action=\"interview\""));
  assert.ok(appJs.includes("data-action=\"interpretation\""));
});

test("frontend releases historical filter controls on success and failure", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function loadHistoricalRuntime()");
  const end = appJs.indexOf("async function loadMoreTimeline()", start);
  assert.ok(start >= 0 && end > start);
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes("actionBusy('historical-filter',false);"));
  assert.ok(fn.includes("actionBusy('historical-clear-filter',false);"));
});

test("frontend locks runtime and historical reset controls during active filters", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("actionBusy('runtime-clear-filter',true,'Clear')"));
  assert.ok(appJs.includes("actionBusy('runtime-clear-filter',false)"));
  assert.ok(appJs.includes("actionBusy('historical-clear-filter',true,'Reset')"));
  assert.ok(appJs.includes("actionBusy('historical-clear-filter',false)"));
});

test("frontend releases the insights action state on early failure", () => {
  const appJs = readRepoFile("public/app.js");
  const start = appJs.indexOf("async function loadInterpretation()");
  const end = appJs.indexOf("function downloadReport()", start);
  assert.ok(start >= 0 && end > start);
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes("actionBusy('interpretation',true,'Generating…');"));
  assert.ok(fn.includes("actionBusy('interpretation',false);"));
  assert.ok(fn.includes("S.interpretationLoading=false;"));
});

test("frontend preserves generated-action busy state across rerenders", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("S.reportLoading?'Generating…'"));
  assert.ok(appJs.includes("S.interviewLoading?'Loading…'"));
  assert.ok(appJs.includes("S.interpretationLoading?'Generating…'"));
  assert.ok(appJs.includes("disabled aria-busy=\"true\""));
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
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");
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
  assert.equal(
    html.includes("storageSet('autopsy.repoAccessToken'"),
    false
  );
  assert.equal(
    appJs.includes("storageSet('autopsy.repoAccessToken'"),
    false
  );
  assert.ok(html.includes('id="repoAccessToken"'));
  assert.ok(html.includes('id="saveRepoAccess"'));
  assert.ok(html.includes('id="clearRepoAccess"'));
  assert.ok(appJs.includes("/access"));
  assert.ok(render.includes("REPOSITORY_CREDENTIAL_ENCRYPTION_KEY"));
  assert.ok(
    errorMiddleware.includes("REPOSITORY_ACCESS_NOT_CONFIGURED")
  );
});


test("frontend runtime workspace exposes an explicit provenance chain", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("Provenance chain"));
  assert.ok(appJs.includes("Correlation narrows the historical window; it does not establish causality."));
  assert.ok(appJs.includes("ANALYSIS TARGET"));
  assert.ok(indexHtml.includes(".runtime-lineage-grid"));
  assert.ok(indexHtml.includes(".runtime-lineage-step"));
});


test("frontend Operations workspace exposes live posture and evidence boundary", () => {
  const appJs = readRepoFile("public/app.js");
  const indexHtml = readRepoFile("public/index.html");
  assert.ok(appJs.includes("Operational posture"));
  assert.ok(appJs.includes("Auto refresh active"));
  assert.ok(appJs.includes("does not change, reinterpret or overwrite persisted repository evidence"));
  assert.ok(indexHtml.includes(".ops-posture-grid"));
  assert.ok(indexHtml.includes(".ops-health-card"));
});


test("frontend clears transient overlays when a page is restored", () => {
  const appJs = readRepoFile("public/app.js");
  assert.ok(appJs.includes("function closeTransientOverlays()"));
  assert.ok(appJs.includes("window.addEventListener('pageshow',function(){closeTransientOverlays()})"));
  assert.ok(appJs.includes("if($('drawer'))$('drawer').hidden=true"));
});
