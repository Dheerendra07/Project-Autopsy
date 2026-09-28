import assert from "node:assert/strict";
import test from "node:test";

import { planAnalysisRun } from "../src/modules/analysis/analysis-planner.js";

test("returns up-to-date when the analyzed head equals the target", () => {
  const plan = planAnalysisRun("abc1234", "abc1234", true);

  assert.deepEqual(plan, {
    kind: "up_to_date",
    targetHeadSha: "abc1234"
  });
});

test("returns incremental when the analyzed head is an ancestor", () => {
  const plan = planAnalysisRun("def5678", "abc1234", true);

  assert.deepEqual(plan, {
    kind: "run",
    analysisMode: "incremental",
    baseHeadSha: "abc1234",
    targetHeadSha: "def5678"
  });
});

test("returns full when there is no completed analyzed head", () => {
  const plan = planAnalysisRun("abc1234", null, false);

  assert.deepEqual(plan, {
    kind: "run",
    analysisMode: "full",
    baseHeadSha: null,
    targetHeadSha: "abc1234"
  });
});

test("returns full when history diverged", () => {
  const plan = planAnalysisRun("def5678", "abc1234", false);

  assert.deepEqual(plan, {
    kind: "run",
    analysisMode: "full",
    baseHeadSha: null,
    targetHeadSha: "def5678"
  });
});
