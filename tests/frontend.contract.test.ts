import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const htmlPath = fileURLToPath(
  new URL("../public/index.html", import.meta.url)
);
const html = readFileSync(htmlPath, "utf8");
const script = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];

test("product frontend contains the core evidence workflow", () => {
  assert.ok(script, "frontend script must exist");
  assert.doesNotThrow(
    () => new Function(script),
    "frontend script must parse as JavaScript"
  );

  for (const marker of [
    'data-view="overview"',
    'data-view="history"',
    'data-view="structure"',
    'data-view="quality"',
    'data-view="runtime"',
    'data-view="report"',
    'data-view="interview"',
    'data-view="interpretation"',
    'data-view="evidence"',
    'data-view="contributors"',
    'id="evidenceSearch"',
    'id="drawer"',
    'id="testConnection"',
    "function architectureMap(ar)",
    "function openEvidence(id)",
    "function loadProvenance(deploymentId)",
    "errorMessage: analysis.error_message",
    "function reportHtml(rep)",
    "async function testConnection()",
    "base+'/ready'",
    "Database or Redis may be unavailable.",
    "elapsed(a.startedAt,a.completedAt)",
    "async function reloadData()",
    "data-action=\"reload-data\"",
    "runtime event explorer",
    "rtDeployment",
    "rtFrom",
    "rtTo",
    "rtRevision",
    "rtEnvironment",
    "rtOperation",
    "rtSignal",
    "runtime-more",
    "Test evolution",
    "Migration ",
    "Deployment ",
    "Observed runtime telemetry event.",
    "Historical repeated-modification evidence."
    "function runtimeFilterDate(value)","\n    "function sameRevision(a,b)",
    "function boundedFetch(url,options,timeoutMs)",
    "function mapLimited(items,limit,worker)",
    "importButton",
    "S.importing=true",
    "if(S.runtimeLoading)return;",
    "await mapLimited(keys,6",
    "previousEvents",
    "runtimeEventsPathWithFilter",
    "Repository head differs from the analyzed target.",
    "function runtimeEventsPath(page,limit)",
    "S.runtimeEvents=arr(out.runtimeEvents,'events')",
    "sessionStorage.getItem('autopsy.key')",
    "sessionStorage.setItem('autopsy.aiKey'",
    "/api/repositories/import"
  ]) {
    assert.ok(html.includes(marker), `missing frontend marker: ${marker}`);
  }
});

test("frontend does not embed an API access secret", () => {
  const secretAssignment = /(?:AUTOPSY_API_ACCESS_KEY|AI_INTERPRETATION_ACCESS_KEY|x-autopsy-api-key)\s*[:=]\s*['"][^'"]{12,}['"]/i;
  assert.equal(secretAssignment.test(html), false);
});
