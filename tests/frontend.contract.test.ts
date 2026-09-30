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
    "async function reloadData()",
    "data-action="reload-data""
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
