import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYSIS_RECOVERY_GRACE_MS,
  isExpiredRunningAnalysisRun
} from "../src/modules/analysis/analysis-expiry.js";

const startedAt = Date.parse("2026-11-21T08:00:00.000Z");
const maxExecutionMs = 30 * 60_000;

test("does not expire a running analysis before the deadline and recovery grace", () => {
  assert.equal(
    isExpiredRunningAnalysisRun(
      "running",
      new Date(startedAt),
      startedAt + maxExecutionMs + ANALYSIS_RECOVERY_GRACE_MS,
      maxExecutionMs
    ),
    false
  );
});

test("expires a running analysis after the deadline and recovery grace", () => {
  assert.equal(
    isExpiredRunningAnalysisRun(
      "running",
      new Date(startedAt).toISOString(),
      startedAt + maxExecutionMs + ANALYSIS_RECOVERY_GRACE_MS + 1,
      maxExecutionMs
    ),
    true
  );
});

test("never expires queued or terminal analysis rows through the running deadline path", () => {
  const now = startedAt + maxExecutionMs + ANALYSIS_RECOVERY_GRACE_MS + 1;

  for (const status of ["queued", "completed", "failed"]) {
    assert.equal(
      isExpiredRunningAnalysisRun(
        status,
        new Date(startedAt).toISOString(),
        now,
        maxExecutionMs
      ),
      false,
      status
    );
  }
});

test("does not expire rows with missing, invalid, or future start timestamps", () => {
  const now = startedAt + maxExecutionMs + ANALYSIS_RECOVERY_GRACE_MS + 1;

  for (const timestamp of [null, "not-a-date", new Date(now + 1).toISOString()]) {
    assert.equal(
      isExpiredRunningAnalysisRun(
        "running",
        timestamp,
        now,
        maxExecutionMs
      ),
      false,
      String(timestamp)
    );
  }
});

test("rejects invalid deadline inputs without expiring a run", () => {
  assert.equal(
    isExpiredRunningAnalysisRun("running", new Date(startedAt), startedAt + 1, 0),
    false
  );
  assert.equal(
    isExpiredRunningAnalysisRun("running", new Date(startedAt), Number.NaN, maxExecutionMs),
    false
  );
  assert.equal(
    isExpiredRunningAnalysisRun("running", new Date(startedAt), startedAt + 1, maxExecutionMs, -1),
    false
  );
});
