import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [html, atlasCss, atlasJs, appJs] = await Promise.all([
  read("public/index.html"),
  read("public/autopsy-atlas.css"),
  read("public/autopsy-atlas.js"),
  read("public/app.js")
]);

for (const id of [
  "landing", "form", "url", "branch", "importButton", "repoAccessToken",
  "formerr", "recentRepositories", "settings", "authModal", "workspace",
  "root", "nav", "repoName", "repoBranch", "repoStatus"
]) {
  assert.ok(html.includes('id="' + id + '"'), "Missing existing frontend contract: " + id);
}

for (const synthetic of [
  "1,840", "Priya Anand", "Marcus Bélanger", "Sofia Marenco",
  "rpt_8f3a2c1e9b4d7f0a", "142 commits", "f4a9c7b2",
  "Idempotent invoice finalization", "Webhook retries with bounded backoff",
  "Collapse invoicing service boundary", "PREVIEW DATA", "ILLUSTRATIVE",
  "CONCEPT PREVIEW", "activityPreviewGrid", "atlasMatrix"
]) {
  assert.ok(!html.includes(synthetic), "Synthetic preview content must not ship: " + synthetic);
}

assert.equal((html.match(/class="preview-nav-item(?: active)?"/g) || []).length, 11,
  "Homepage workspace preview must contain the 11 real navigation views");
assert.ok(html.includes('<div class="preview-nav">') && html.includes('<div class="preview-main">'),
  "The workspace navigation and detail surfaces must retain their existing structural contract");

for (const surface of [
  "Overview", "History", "Structure", "Quality", "Runtime", "Report",
  "Interview", "Insights", "Evidence", "Contributors", "Operations"
]) {
  assert.ok(html.includes(">" + surface + "<"), "Missing real workspace view: " + surface);
}

for (const productFact of [
  "Git history", "Code &amp; dependencies", "Schema &amp; tests",
  "Runtime &amp; releases", "persisted Git dates", "202 Accepted",
  "Dheerendra07/Project-Autopsy"
]) {
  assert.ok(html.includes(productFact), "Missing grounded product fact: " + productFact);
}

for (const guardrail of [
  "Unknown references", "Rejected", "Developer ownership", "Not inferred",
  "Performance claims"
]) {
  assert.ok(html.includes(guardrail), "Missing evidence guardrail: " + guardrail);
}

assert.ok(html.includes('href="https://github.com/Dheerendra07/Project-Autopsy"'),
  "The homepage should link to the actual source repository");
assert.ok(html.indexOf("autopsy-atlas.css") > html.indexOf("ui-chatz.css"),
  "Atlas stylesheet must remain the final primary landing style");
assert.ok(html.includes('href="#import"'), "The evidence empty state must lead to the real repository import form");
assert.match(html, /<div class="pa-hero-console" role="group" aria-label="How repository evidence is organised">/,
  "The labelled hero evidence panel must expose a semantic group to assistive technology");
assert.ok(atlasJs.includes("observeWorkspace()"), "Live workspace observation must remain active");
assert.ok(atlasJs.includes("applyActivityRange"), "Real workspace activity range controls must remain active");
assert.ok(!atlasJs.includes("buildHeroMatrix") && !atlasJs.includes("buildPreviewCalendar"),
  "Synthetic hero and calendar generators must be removed");
assert.ok(appJs.includes("committed_at"), "Live activity must use actual persisted commit timestamps");
assert.ok(appJs.includes("/api/repositories/import"), "Real repository import API wiring must remain present");

new vm.Script(atlasJs, { filename: "public/autopsy-atlas.js" });

for (const selector of [
  ".atlas-source-grid", ".atlas-history-empty", ".atlas-surface-grid",
  ".atlas-report-stages", "@media(max-width:620px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  assert.ok(atlasCss.includes(selector), "Missing responsive Atlas style: " + selector);
}

console.log("Atlas homepage QA passed: no synthetic repository records, all 11 real views, preserved import/auth wiring, truthful contribution history, responsive evidence UI and live workspace heatmap.");


// Visual theme and cat companion regression checks.
assert.ok(atlasCss.includes("--a-accent:#1f883d"), "GitHub-green accent is required");
assert.ok(atlasCss.includes("--a-bg:#ffffff"), "Light canvas must remain white");
assert.ok(atlasCss.includes("html[data-theme=\"dark\"]"), "Dark theme support must remain");
assert.ok(atlasCss.includes(".pa-cat-companion"), "Cat companion styles must exist");
assert.ok(atlasCss.includes("@media(prefers-reduced-motion:reduce)"), "Reduced-motion handling is required");
assert.ok(atlasJs.includes("function mountCatCompanion"), "Cat companion interaction is required");
assert.ok(atlasJs.includes("mountCatCompanion();"), "Cat companion must be initialised");
assert.ok(atlasJs.includes("(pointer: coarse)"), "Touch devices must not run pointer-follow motion");
assert.ok(atlasJs.includes("aria-hidden"), "Decorative cat must be hidden from assistive technology");
