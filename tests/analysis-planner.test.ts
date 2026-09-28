import assert from "node:assert/strict";
import test from "node:test";

import { planAnalysisRun } from "../src/modules/analysis/analysis-planner.js";

test("returns up-to-date when analyzed and target heads match", () => {
  assert.deepEqual(
    planAnalysisRun("abc1234", "abc1234", true),
    {
      kind: "up_to_date",
      targetHeadSha: "abc1234"
    }
  );
});

test("returns incremental when analyzed head is an ancestor", () => {
  assert.deepEqual(
    planAnalysisRun("def5678", "abc1234", true),
    {
      kind: "run",
      analysisMode: "incremental",
      baseHeadSha: "abc1234",
      targetHeadSha: "def5678"
    }
  );
});

test("returns full when there is no previous completed head", () => {
  assert.deepEqual(
    planAnalysisRun("abc1234", null, false),
    {
      kind: "run",
      analysisMode: "full",
      baseHeadSha: null,
      targetHeadSha: "abc1234"
    }
  );
});

test("returns full when history has diverged", () => {
  assert.deepEqual(
    planAnalysisRun("def5678", "abc1234", false),
    {
      kind: "run",
      analysisMode: "full",
      baseHeadSha: null,
      targetHeadSha: "def5678"
    }
  );
});
