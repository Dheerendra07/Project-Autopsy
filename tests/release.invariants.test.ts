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
    "autoDeployTrigger: checksPass"
  ]) {
    assert.ok(render.includes(marker), "missing Render invariant: " + marker);
  }
});

test("quality workflow starts on push and pull requests and uses the pinned Linux runner", () => {
  const workflow = readRepoFile(".github/workflows/quality.yml");

  for (const marker of [
    "push:",
    "pull_request:",
    "runs-on: ubuntu-22.04",
    "permissions:",
    "contents: read",
    "cancel-in-progress: true",
    "timeout-minutes: 45",
    "uses: actions/checkout@v5",
    "uses: actions/setup-node@v5",
    "node-version: 24"
  ]) {
    assert.ok(workflow.includes(marker), "missing workflow invariant: " + marker);
  }
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

test("frontend script remains dependency-free, parseable and key-gated", () => {
  const html = readRepoFile("public/index.html");
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/i)?.[1];

  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.doesNotMatch(html, /<script\s+src=/i);
  assert.ok(html.includes("function storageGet(key)"));
  assert.ok(html.includes("function storageSet(key,value)"));
  assert.ok(html.includes("storageGet('autopsy.key')"));
  assert.ok(html.includes("storageSet('autopsy.aiKey',S.aiKey)"));
  assert.doesNotMatch(
    html,
    /(?:AUTOPSY_API_ACCESS_KEY|AI_INTERPRETATION_ACCESS_KEY)\s*[:=]\s*['"][^'"]{12,}['"]/i
  );
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
    assert.ok(html.includes(marker), "missing inspection hook: " + marker);
  }
});

test("frontend retains failure-safe and stale-analysis controls", () => {
  const html = readRepoFile("public/index.html");

  for (const marker of [
    "function boundedFetch(url,options,timeoutMs)",
    "runtimeEventsPathWithFilter",
    "Repository head differs from the analyzed target.",
    "previousEvents",
    "Request timed out after 20 seconds."
  ]) {
    assert.ok(html.includes(marker), "missing frontend invariant: " + marker);
  }
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
  assert.ok(html.includes("Permanently delete "));
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
  assert.ok(state.includes('SELECT pg_advisory_lock(2147483647)'));
  assert.ok(state.includes('SELECT pg_advisory_unlock(2147483647)'));
  assert.ok(constraints.includes("analysis_runs_status_check"));
  assert.ok(constraints.includes("analysis_runs_terminal_timestamp_check"));
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


test("analysis terminal updates preserve existing failure diagnostics when no replacement message is supplied", () => {
  const persistence = readRepoFile(
    "src/modules/repositories/repository.persistence.ts"
  );

  assert.ok(
    persistence.includes("error_message = COALESCE($3, error_message)")
  );
});


test("frontend health probes do not attach privileged API credentials", () => {
  const html = readRepoFile("public/index.html");
  const start = html.indexOf("async function testConnection()");
  const end = html.indexOf("async function importRepo()", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const probe = html.slice(start, end);
  assert.match(probe, /boundedFetch\(base\+'\/health'/);
  assert.match(probe, /boundedFetch\(base\+'\/ready'/);
  assert.ok(probe.includes("var probeHeaders=new Headers(h)"));
  assert.ok(probe.includes("probeHeaders.set('x-autopsy-api-key',key)"));
  assert.doesNotMatch(
    probe.slice(0, probe.indexOf("var probeHeaders")),
    /x-autopsy-api-key/
  );
});
