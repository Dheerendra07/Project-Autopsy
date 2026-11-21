import assert from "node:assert/strict";
import test from "node:test";

import {
  isTerminalAnalysisJobFailure
} from "../src/modules/analysis/worker-failure.js";

test("Unrecoverable BullMQ failures are terminal before the normal retry limit", () => {
  const error = Object.assign(new Error("job stalled more than allowable limit"), {
    name: "UnrecoverableError"
  });

  assert.equal(
    isTerminalAnalysisJobFailure(error, 1, 3),
    true
  );
});

test("ordinary analysis failures remain retryable before the configured attempt limit", () => {
  assert.equal(
    isTerminalAnalysisJobFailure(new Error("temporary git failure"), 1, 3),
    false
  );
  assert.equal(
    isTerminalAnalysisJobFailure(new Error("temporary git failure"), 2, 3),
    false
  );
});

test("ordinary analysis failures become terminal on the final configured attempt", () => {
  assert.equal(
    isTerminalAnalysisJobFailure(new Error("git clone failed"), 3, 3),
    true
  );
});

test("missing retry configuration retains the single-attempt default", () => {
  assert.equal(
    isTerminalAnalysisJobFailure(new Error("analysis failed"), 1, undefined),
    true
  );
  assert.equal(
    isTerminalAnalysisJobFailure(new Error("analysis failed"), 0, undefined),
    false
  );
});
