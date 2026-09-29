import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYSIS_JOB_BACKOFF_DELAY_MS,
  ANALYSIS_JOB_MAX_ATTEMPTS,
  ANALYSIS_JOB_RETRY_POLICY
} from "../src/modules/analysis/queue-policy.js";

test("analysis jobs use bounded retries", () => {
  assert.equal(ANALYSIS_JOB_MAX_ATTEMPTS, 3);
  assert.equal(ANALYSIS_JOB_BACKOFF_DELAY_MS, 2_000);
  assert.deepEqual(ANALYSIS_JOB_RETRY_POLICY, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2_000
    }
  });
});
