import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readRepoFile(path: string): string {
  return readFileSync(
    fileURLToPath(new URL("../" + path, import.meta.url)),
    "utf8"
  );
}

test("frontend rebuild exposes the complete authenticated product contract", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");
  const css = readRepoFile("public/ui-product.css");

  assert.doesNotThrow(() => new Function(appJs));
  for (const marker of [
    '<link rel="stylesheet" href="ui-product.css?v=foundation-v1">',
    '<script src="theme.js"></script>',
    '<script src="app.js" defer></script>',
    'id="form"',
    'id="authModal"',
    'class="workspace-shell"',
    'class="settings-sheet"',
    'class="settings-scroll"',
    'id="commandPalette"',
    'id="drawer"',
    'id="drawerSummary"',
    'id="drawerRaw"',
    'id="testConnection"',
    'id="saveRepoAccess"',
    'id="clearRepoAccess"'
  ]) {
    assert.ok(html.includes(marker), "missing product marker: " + marker);
  }

  const views = ["overview","history","structure","quality","runtime","report","interview","interpretation","evidence","contributors","operations"];
  const renderers = {
    overview:"overview",
    history:"historyView",
    structure:"structure",
    quality:"quality",
    runtime:"runtime",
    report:"reportPage",
    interview:"interview",
    interpretation:"interpretation",
    evidence:"evidencePage",
    contributors:"contributors",
    operations:"operations"
  } as const;

  for (const view of views) {
    const renderer = renderers[view as keyof typeof renderers];
    assert.equal((html.match(new RegExp('data-view="' + view + '"','g')) || []).length, 1, "missing unique nav control: " + view);
    assert.equal((appJs.match(new RegExp("function " + renderer + "\\s*\\(","g")) || []).length, 1, "missing unique renderer: " + view);
  }

  for (const marker of [
    "const WORKFLOW_STEPS=[",
    "function viewFlowMarkup()",
    "function viewEndpoints(id)",
    "function loadingPage(title,message)",
    "function errorPage(title,message,actionLabel,action)",
    "function inspectButton(label,basis,payload)",
    "function evidenceSummary(payload)",
    "function currentAnalysisSnapshot()",
    "function snapshotState()",
    "function commandPaletteRun(id)",
    "function refreshVisibleView()",
    "function loadOperations(force,silent)",
    "function closeTransientOverlays()",
    "function closeEvidence(restoreFocus)",
    "credentials:'include'",
    "x-autopsy-csrf-token",
    "runtimeInputDate(value)",
    "historicalSourceContext:'/api/repositories/'+id+'/runtime/historical-correlation/source-context?limit=25'",
    "var familyOk=family==='all'||row.getAttribute('data-family')===family;",
    "var textOk=!term||(row.getAttribute('data-search')||'').indexOf(term)>=0;",
    "document.addEventListener('visibilitychange'",
    "requestAnimationFrame(function(){$('drawerClose').focus()})"
  ]) {
    assert.ok(appJs.includes(marker), "missing frontend interaction contract: " + marker);
  }

  for (const action of [
    "report","interview","interpretation","download","more-commits","more-timeline",
    "analysis-runs-more","reload-data","reload-view","runtime-filter",
    "runtime-clear-filter","runtime-more","historical-filter","historical-clear-filter",
    "operations-refresh","operations-retry","report-jump","copy-story"
  ]) {
    assert.ok(appJs.includes("===" + "'" + action + "'"), "missing delegated action: " + action);
  }

  assert.ok(css.includes('html[data-theme="light"]'));
  assert.ok(css.includes("[hidden]{display:none!important}"));
  assert.ok(css.includes("@media(max-width:760px)"));
  assert.ok(css.includes("@media(max-width:520px)"));
  assert.equal((css.match(/(?:linear|radial)-gradient\s*\(/g) || []).length, 0);
  assert.ok(css.includes("--pa-bg:#0b0d10"));
});

test("frontend keeps evidence outputs truthful and current-snapshot bound", () => {
  const appJs = readRepoFile("public/app.js");

  for (const marker of [
    "currentAnalysisSnapshot()",
    "rep.analysis.runId===S.runId",
    "sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha)",
    "i.result.reportFingerprint===rep.fingerprint",
    "Correlation narrows the historical window; it does not establish causality.",
    "This is interpretation, not a new evidence source.",
    "These are scaffolds for preparation, not proof of personal ownership."
  ]) {
    assert.ok(appJs.includes(marker), "missing evidence-boundary contract: " + marker);
  }
});

test("frontend auth and repository access remain session-based", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(appJs.includes("credentials:'include'"));
  assert.ok(appJs.includes("readCookie('autopsy_csrf')"));
  assert.ok(appJs.includes("x-autopsy-csrf-token"));
  assert.equal(/storageSet\(['"]autopsy\.(repoAccessToken|key|aiKey)['"]/.test(appJs + html), false);
  assert.ok(appJs.includes("S.legacyMigrationKey=storageGet('autopsy.key')"));
  assert.ok(html.includes('id="repoToken"'));
  assert.ok(html.includes('id="saveRepoAccess"'));
  assert.ok(html.includes('id="clearRepoAccess"'));
});

test("frontend navigation and transient overlays remain accessible", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  assert.ok(html.includes('role="listbox"'));
  assert.ok(html.includes('aria-labelledby="commandPaletteTitle"'));
  assert.ok(appJs.includes("(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'"));
  assert.ok(appJs.includes("e.key==='ArrowDown'"));
  assert.ok(appJs.includes("e.key==='ArrowUp'"));
  assert.ok(appJs.includes("document.title='Project Autopsy — '+(VIEW_TITLES[v]||'Workspace')"));
  assert.ok(appJs.includes("b.setAttribute('aria-current','page')"));
  assert.ok(appJs.includes("window.addEventListener('pageshow',function(){closeTransientOverlays()})"));
});
