import assert from "node:assert/strict";
import test from "node:test";

import { classifyAnalysisJobRecovery } from "../src/modules/analysis/job-recovery.js";

const targetHeadSha = "a".repeat(40);

test("completed jobs are treated as already completed", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "analyze",
      attemptsMade: 0,
      status: "completed",
      analysisMode: "full",
      targetHeadSha
    }),
    { action: "already_completed" }
  );
});

test("failed jobs are terminal and are not automatically resumed", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "refresh",
      attemptsMade: 2,
      status: "failed",
      analysisMode: "incremental",
      targetHeadSha
    }),
    { action: "terminal_failed" }
  );
});

test("a retried import with a target resumes analysis instead of cloning again", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "import",
      attemptsMade: 1,
      status: "running",
      analysisMode: "full",
      targetHeadSha
    }),
    {
      action: "resume_import_analysis",
      analysisMode: "full",
      targetHeadSha
    }
  );
});

test("a retried refresh check completes without re-running analysis", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "refresh",
      attemptsMade: 1,
      status: "running",
      analysisMode: "check",
      targetHeadSha
    }),
    {
      action: "resume_refresh_check",
      targetHeadSha
    }
  );
});

test("a retried incremental refresh resumes the persisted analysis plan", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "refresh",
      attemptsMade: 1,
      status: "running",
      analysisMode: "incremental",
      targetHeadSha
    }),
    {
      action: "resume_refresh_analysis",
      analysisMode: "incremental",
      targetHeadSha
    }
  );
});

test("a retried full refresh resumes the persisted analysis plan", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "refresh",
      attemptsMade: 1,
      status: "running",
      analysisMode: "full",
      targetHeadSha
    }),
    {
      action: "resume_refresh_analysis",
      analysisMode: "full",
      targetHeadSha
    }
  );
});

test("a fresh analysis starts normally", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "analyze",
      attemptsMade: 0,
      status: "queued",
      analysisMode: "full",
      targetHeadSha: null
    }),
    { action: "start" }
  );
});

test("a retried analysis job restarts the analysis pipeline using its persisted run state", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "analyze",
      attemptsMade: 1,
      status: "running",
      analysisMode: "incremental",
      targetHeadSha
    }),
    { action: "start" }
  );
});

test("refresh recovery does not trigger without a persisted target head", () => {
  assert.deepEqual(
    classifyAnalysisJobRecovery({
      kind: "refresh",
      attemptsMade: 1,
      status: "running",
      analysisMode: "incremental",
      targetHeadSha: null
    }),
    { action: "start" }
  );
});
