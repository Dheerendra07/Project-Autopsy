import assert from "node:assert/strict";
import test from "node:test";
import { classifyRefactorSignal } from "../src/modules/refactors/refactor-signals.js";

test("classifies refactor-related commit subjects", () => {
  assert.equal(classifyRefactorSignal("refactor: split repository service"), "refactor");
  assert.equal(classifyRefactorSignal("rewrite worker orchestration"), "rewrite");
  assert.equal(classifyRefactorSignal("cleanup unused middleware"), "cleanup");
  assert.equal(classifyRefactorSignal("rename auth route"), "rename");
  assert.equal(classifyRefactorSignal("fix: handle invalid token"), null);
});
