import assert from "node:assert/strict";
import test from "node:test";

import {
  isFailedQueueJobState
} from "../src/modules/analysis/queue-job-state.js";

test("only a failed BullMQ job can reconcile an active database analysis run", () => {
  assert.equal(isFailedQueueJobState("failed"), true);
  for (const state of [
    "waiting",
    "active",
    "delayed",
    "completed",
    "waiting-children",
    "unknown"
  ]) {
    assert.equal(isFailedQueueJobState(state), false, state);
  }
});
