import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readRepoFile(path: string): string {
  return readFileSync(
    fileURLToPath(new URL("../" + path, import.meta.url)),
    "utf8"
  );
}

test("landing exposes the complete eleven-surface product map", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  const start = html.indexOf('class="surface-list"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0, "landing capability surface list is missing");
  assert.ok(end > start, "landing capability surface boundary is missing");

  const surface = html.slice(start, end);
  assert.equal((surface.match(/class="surface"/g) || []).length, 11);

  for (const view of [
    "Overview","History","Structure","Quality","Runtime","Report",
    "Interview","Insights","Evidence","Contributors","Operations"
  ]) {
    assert.ok(surface.includes(">" + view + "<"), "missing landing surface: " + view);
  }

  assert.equal((surface.match(/<button|<a /g) || []).length, 0);
  assert.ok(appJs.includes("const WORKFLOW_STEPS=["));
  assert.equal((appJs.match(/\{number:'(?:01|02|03|04|05|06|07|08|09|10|11)'/g) || []).length, 11);
});
