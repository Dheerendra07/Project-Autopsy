import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const app = readFileSync(
  path.join(process.cwd(), "public", "app.js"),
  "utf8"
);

test("interview stories expose a copy-ready evidence-backed draft action", () => {
  assert.match(app, /async function copyInterviewStory\(storyId\)/);
  assert.ok(app.includes("navigator.clipboard.writeText(lines.join('\\n'))"));
  assert.ok(app.includes("data-action==='copy-story'"));
  assert.ok(app.includes("data-story-id"));
  assert.ok(app.includes(">Copy draft</button>"));
});
