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
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  assert.equal(
    pkg.scripts?.build,
    "npm install --include=dev --no-audit --no-fund && tsc"
  );
  assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts?.test, "tsx --test tests/*.test.ts");
});

test("Render blueprint keeps the free combined runtime and health endpoint", () => {
  const render = readRepoFile("render.yaml");

  for (const marker of [
    "type: web",
    "name: project-autopsy",
    "plan: free",
    "healthCheckPath: /health",
    "startCommand: node dist/database/migrate.js && node dist/free-runtime.js",
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
  assert.ok(html.includes("sessionStorage.getItem('autopsy.key')"));
  assert.ok(html.includes("sessionStorage.setItem('autopsy.aiKey'"));
  assert.doesNotMatch(
    html,
    /(?:AUTOPSY_API_ACCESS_KEY|AI_INTERPRETATION_ACCESS_KEY)\\s*[:=]\\s*['"][^'"]{12,}['"]/i
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
