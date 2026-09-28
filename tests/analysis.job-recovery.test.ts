import assert from "node:assert/strict";
import test from "node:test";

import { classifyAnalysisJobRecovery } from "../src/modules/analysis/job-recovery.js";

const base = {
  kind: "refresh" as const,
  attemptsMade: 0,
  status: "queued" as const,
  analysisMode: "check" as const,
  targetHeadSha: null
};

test("does not mutate a completed run during job redelivery", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      ...base,
      attemptsMade: 1,
      status: "completed",
      targetHeadSha: "a".repeat(40)
    }),
    { action: "already_completed" }
  );
});

test("resumes import after clone checkpoint without recloning", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      ...base,
      kind: "import",
      attemptsMade: 1,
      status: "running",
      analysisMode: "full",
      targetHeadSha: "a".repeat(40)
    }),
    {
      action: "resume_import_analysis",
      analysisMode: "full",
      targetHeadSha: "a".repeat(40)
    }
  );
});

test("completes an up-to-date refresh after a crash at the final checkpoint", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      ...base,
      attemptsMade: 1,
      status: "running",
      analysisMode: "check",
      targetHeadSha: "b".repeat(40)
    }),
    {
      action: "resume_refresh_check",
      targetHeadSha: "b".repeat(40)
    }
  );
});

test("resumes a planned refresh without repeating the remote fetch", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      ...base,
      attemptsMade: 1,
      status: "running",
      analysisMode: "incremental",
      targetHeadSha: "c".repeat(40)
    }),
    {
      action: "resume_refresh_analysis",
      analysisMode: "incremental",
      targetHeadSha: "c".repeat(40)
    }
  );
});

test("fresh jobs still start normally", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery(base),
    { action: "start" }
  );
});

test("terminally failed runs are never revived by a retry", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      ...base,
      attemptsMade: 1,
      status: "failed",
      analysisMode: "full",
      targetHeadSha: "d".repeat(40)
    }),
    { action: "terminal_failed" }
  );
});
