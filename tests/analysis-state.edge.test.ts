import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidAnalysisTransition
} from "../src/modules/analysis/analysis-state.js";

test("analysis state machine allows only forward terminal transitions", () => {
  const allowed: Array<[string, string]> = [
    ["queued", "queued"],
    ["queued", "running"],
    ["queued", "failed"],
    ["running", "running"],
    ["running", "completed"],
    ["running", "failed"],
    ["completed", "completed"],
    ["failed", "failed"]
  ];

  for (const [current, next] of allowed) {
    assert.equal(
      isValidAnalysisTransition(
        current as Parameters<typeof isValidAnalysisTransition>[0],
        next as Parameters<typeof isValidAnalysisTransition>[1]
      ),
      true,
      current + " -> " + next
    );
  }
});

test("analysis state machine rejects resurrection and backward transitions", () => {
  const rejected: Array<[string, string]> = [
    ["completed", "queued"],
    ["completed", "running"],
    ["completed", "failed"],
    ["failed", "queued"],
    ["failed", "running"],
    ["failed", "completed"],
    ["running", "queued"],
    ["queued", "completed"]
  ];

  for (const [current, next] of rejected) {
    assert.equal(
      isValidAnalysisTransition(
        current as never,
        next as never
      ),
      false,
      current + " -> " + next
    );
  }
});
