import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const htmlPath = fileURLToPath(
  new URL("../public/index.html", import.meta.url)
);
const html = readFileSync(htmlPath, "utf8");
const appJsPath = fileURLToPath(
  new URL("../public/app.js", import.meta.url)
);
const appJs = readFileSync(appJsPath, "utf8");

test("product frontend contains the core evidence workflow", () => {
  assert.ok(
    html.includes('<script src="app.js" defer></script>'),
    "frontend must load the external app.js asset"
  );
  assert.doesNotThrow(
    () => new Function(appJs),
    "frontend app.js must parse as JavaScript"
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
    "function openEvidence(id,trigger)",
    "function loadProvenance(deploymentId,trigger)",
    "analysis.errorMessage||'The worker reported a failure; inspect the analysis run for more detail.'",
    "function reportHtml(rep)",
    "async function testConnection()",
    "base+'/ready'",
    "Database or Redis may be unavailable.",
    "elapsed(a.startedAt,a.completedAt)",
    "async function reloadData()",
    "data-action=\"reload-data\"",
    "Runtime event explorer",
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
    "Historical repeated-modification evidence.",
    "Historical source-change context",
    "data-action=\"historical-clear-filter\"",
    "data-action=\"historical-filter\"",
    "histSamples",
    "histWindow",
    "historical-clear-filter",
    "historical-filter",
    "loadHistoricalRuntime",
    "historicalRuntimePath('source-context'",
    "historicalRuntimePath('correlation'",
    "historicalRuntimePath('summary'",
    "function historicalRuntimePath",
    "Load older analysis runs",
    "analysis-runs-more",
    "loadMoreAnalysisRuns",
    "historicalSourceContext:'/api/repositories/'+id+'/runtime/historical-correlation/source-context?limit=25'",
    "function runtimeFilterDate(value)",
    "function sameRevision(a,b)",
    "function safeApiBase(value)",
    "API base URL must use HTTPS outside localhost.",
    "function storageGet(key)",
    "function storageSet(key,value)",
    "function boundedFetch(url,options,timeoutMs)",
    "API returned an invalid JSON response",
    "API returned an invalid response body",
    "r.status===429",
    "Retry after '+retrySeconds+' seconds.'",
    "function mapLimited(items,limit,worker)",
    "importButton",
    "S.importing=true",
    "S.workspaceToken",
    "S.commitLoading",
    "S.commitLoadToken",
    "if(S.runtimeLoading)return;",
    "await mapLimited(keys,6",
    "previousEvents",
    "runtimeEventsPathWithFilter",
    "Repository head differs from this snapshot.",
    "runId!==S.runId",
    "loadToken!==S.commitLoadToken",
    "function runtimeEventsPath(page,limit)",
    "S.runtimeEvents=arr(out.runtimeEvents,'events')",
    "function storageGet(key)",
    "function storageSet(key,value)",
    "/api/repositories/import"
  ]) {
    assert.ok(
      (html + "\n" + appJs).includes(marker),
      `missing frontend marker: ${marker}`
    );
  }
});
test("product frontend supports persistent dark and light themes without inline script", () => {
  const themePath = fileURLToPath(
    new URL("../public/theme.js", import.meta.url)
  );
  const themeJs = readFileSync(themePath, "utf8");

  assert.ok(
    html.includes('<script src="theme.js"></script>'),
    "frontend must bootstrap the theme from an external same-origin asset"
  );
  assert.doesNotMatch(
    html,
    /<script>\s*[\s\S]*?<\/script>/i,
    "frontend must not embed inline executable scripts"
  );
  assert.ok(
    themeJs.includes("localStorage.getItem('autopsy.theme')"),
    "theme preference must persist locally"
  );
  assert.ok(
    themeJs.includes("prefers-color-scheme: light"),
    "theme bootstrap must respect the system preference when no saved choice exists"
  );
  assert.ok(
    themeJs.includes("document.documentElement.dataset.theme"),
    "theme bootstrap must set the root theme state"
  );
  assert.ok(appJs.includes("function applyTheme(theme,announce,persistPreference)"));
  assert.ok(appJs.includes("if(persistPreference!==false)themeStorageSet(mode);"));
  assert.ok(appJs.includes("var storedTheme=themeStorageGet();"));
  assert.ok(appJs.includes("applyTheme(storedTheme||document.documentElement.dataset.theme||'dark',false,!!storedTheme)"));
  assert.ok(appJs.includes("window.addEventListener('storage',function(e)"));
  assert.ok(appJs.includes("applyTheme(e.newValue,false,false)"));
  assert.ok(appJs.includes("$('themeToggle').onclick"));
  assert.ok(appJs.includes("light?'☾':'☀'"));
  assert.ok(html.includes('html[data-theme="light"]'));
  assert.ok(html.includes("--ui-accent:#6366f1"));
  assert.ok(html.includes("--ui-bg:#0a0f17"));
  assert.ok(html.includes("color-scheme:light"));
});


test("frontend does not embed an API access secret", () => {
  const secretAssignment = /(?:AUTOPSY_API_ACCESS_KEY|AI_INTERPRETATION_ACCESS_KEY|x-autopsy-api-key)\s*[:=]\s*['"][^'"]{12,}['"]/i;
  assert.equal(secretAssignment.test(html), false);
});
