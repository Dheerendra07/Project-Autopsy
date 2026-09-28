import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCorrelationWindow,
  buildRuntimeChangeContext,
  deriveRuntimeCorrelationStatus
} from "../src/modules/runtime/correlation.persistence.js";

const aggregate = {
  sampleCount: 10,
  durationSampleCount: 10,
  errorCount: 1,
  errorRate: 0.1,
  minDurationMs: 1,
  avgDurationMs: 10,
  p50DurationMs: 10,
  p95DurationMs: 20,
  p99DurationMs: 21,
  maxDurationMs: 22,
  firstObservedAt: "2026-09-29T00:00:00.000Z",
  lastObservedAt: "2026-09-29T01:00:00.000Z"
};

test("marks correlation ready only when both windows have enough samples", () => {
  assert.equal(
    deriveRuntimeCorrelationStatus(
      true,
      true,
      true,
      10,
      10,
      10
    ),
    "ready"
  );

  assert.equal(
    deriveRuntimeCorrelationStatus(
      true,
      true,
      true,
      9,
      10,
      10
    ),
    "insufficient_baseline_samples"
  );

  assert.equal(
    deriveRuntimeCorrelationStatus(
      true,
      true,
      true,
      10,
      9,
      10
    ),
    "insufficient_target_samples"
  );
});

test("preserves explicit evidence gaps before sample sufficiency is evaluated", () => {
  assert.equal(
    deriveRuntimeCorrelationStatus(
      false,
      true,
      true,
      100,
      100,
      10
    ),
    "repository_revision_not_found"
  );

  assert.equal(
    deriveRuntimeCorrelationStatus(
      true,
      false,
      true,
      100,
      100,
      10
    ),
    "commit_time_unavailable"
  );

  assert.equal(
    deriveRuntimeCorrelationStatus(
      true,
      true,
      false,
      100,
      100,
      10
    ),
    "missing_parent_revision"
  );
});

test("builds deterministic correlation windows", () => {
  const window = buildCorrelationWindow(
    "target",
    new Date("2026-09-29T00:00:00.000Z"),
    new Date("2026-09-29T01:00:00.000Z"),
    "a".repeat(40),
    aggregate
  );

  assert.deepEqual(window, {
    label: "target",
    from: "2026-09-29T00:00:00.000Z",
    to: "2026-09-29T01:00:00.000Z",
    revisionSha: "a".repeat(40),
    aggregate
  });
});


test("builds deterministic Git change context and reports truncation explicitly", () => {
  const context = buildRuntimeChangeContext({
    targetRevisionSha: "c".repeat(40),
    parentRevisionSha: "d".repeat(40),
    parentRevisionPersisted: true,
    committedAt: "2026-09-29T01:00:00.000Z",
    subject: "refactor: harden runtime path",
    filesChanged: 101,
    additions: 250,
    deletions: 90,
    changedFiles: [
      {
        path: "src/a.ts",
        status: "modified",
        additions: 10,
        deletions: 2
      },
      {
        path: "src/b.ts",
        status: "added",
        additions: 20,
        deletions: 0
      }
    ],
    changedFilesTruncated: true,
    changedFilesComplete: false
  });

  assert.deepEqual(context, {
    commitSha: "c".repeat(40),
    subject: "refactor: harden runtime path",
    committedAt: "2026-09-29T01:00:00.000Z",
    parentRevisionSha: "d".repeat(40),
    filesChanged: 101,
    additions: 250,
    deletions: 90,
    changedFiles: [
      {
        path: "src/a.ts",
        status: "modified",
        additions: 10,
        deletions: 2
      },
      {
        path: "src/b.ts",
        status: "added",
        additions: 20,
        deletions: 0
      }
    ],
    changedFilesTruncated: true,
    changedFilesComplete: false
  });
});
