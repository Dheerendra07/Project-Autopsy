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

test("landing workspace preview keeps all eleven workflow stages visible", () => {
  const html = readRepoFile("public/index.html");
  const appJs = readRepoFile("public/app.js");

  const previewStart = html.indexOf('<div class="preview-nav">');
  const previewEnd = html.indexOf('<div class="preview-main">', previewStart);
  assert.ok(previewStart >= 0, "landing workspace preview nav is missing");
  assert.ok(previewEnd > previewStart, "landing workspace preview main boundary is missing");

  const preview = html.slice(previewStart, previewEnd);

  assert.ok(preview.includes('<span>01</span><strong>Overview</strong>'));
  assert.ok(preview.includes('<span>02</span><strong>History</strong>'));
  assert.ok(preview.includes('<span>03</span><strong>Structure</strong>'));
  assert.ok(preview.includes('<span>04</span><strong>Quality</strong>'));
  assert.ok(preview.includes('<span>05</span><strong>Runtime</strong>'));
  assert.ok(preview.includes('<span>06</span><strong>Report</strong>'));
  assert.ok(preview.includes('<span>07</span><strong>Interview</strong>'));
  assert.ok(preview.includes('<span>08</span><strong>Insights</strong>'));

  assert.equal((appJs.match(/\{number:'(?:01|02|03|04|05|06|07|08|09|10|11)'/g) || []).length, 11);
});
