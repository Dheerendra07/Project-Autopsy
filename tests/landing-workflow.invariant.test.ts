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
  const previewEnd = html.indexOf("</div>", previewStart);
  assert.ok(previewStart >= 0, "landing workspace preview nav is missing");

  const preview = html.slice(previewStart, previewEnd + 6);

  for (const [number, label] of [
    ["01", "Overview"],
    ["02", "History"],
    ["03", "Structure"],
    ["04", "Quality"],
    ["05", "Runtime"],
    ["06", "Report"],
    ["07", "Interview"],
    ["08", "Insights"],
    ["09", "Evidence"],
    ["10", "Contributors"],
    ["11", "Operations"]
  ]) {
    assert.ok(
      preview.includes(`<span>${number}</span><strong>${label}</strong>`) ||
        appJs.includes(`{number:'${number}',id:'${label === "Insights" ? "interpretation" : label.toLowerCase()}'`),
      `missing workflow stage ${number} ${label}`
    );
  }

  assert.ok(preview.includes('<span>07</span><strong>Interview</strong>'));
});
