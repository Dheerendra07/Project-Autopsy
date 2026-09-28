import assert from "node:assert/strict";
import test from "node:test";

import { planAnalysisRun } from "../src/modules/analysis/analysis-planner.js";

test("returns up-to-date when the analyzed head matches the target", () => {
  assert.deepEqual(
    planAnalysisRun("abc1234", "abc1234", true),
    {
      kind: "up_to_date",
      targetHeadSha: "abc1234"
    }
  );
});

test("selects incremental mode when the analyzed head is an ancestor", () => {
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

test("falls back to full mode when history diverged", () => {
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

test("uses full mode when no previous analyzed head exists", () => {
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


test("plans a full analysis when no completed run exists", () => {
  assert.deepEqual(
    planAnalysisRun("same-head", null, true),
    {
      kind: "run",
      analysisMode: "full",
      baseHeadSha: null,
      targetHeadSha: "same-head"
    }
  );
});