import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoricalRuntimeReconstruction
} from "../src/modules/runtime/historical-correlation.service.js";
import type {
  RuntimeCorrelationEvidence
} from "../src/modules/runtime/correlation.types.js";
import type { StoredCommit } from "../src/modules/repositories/repository.persistence.js";

function commit(
  sha: string,
  committedAt: string,
  parentSha: string | null = null
): StoredCommit {
  return {
    sha,
    parent_shas: parentSha ? [parentSha] : [],
    author_name: "Test",
    author_email: "test@example.test",
    authored_at: committedAt,
    committer_name: "Test",
    committer_email: "test@example.test",
    committed_at: committedAt,
    subject: "change",
    files_changed: 1,
    additions: 2,
    deletions: 1
  };
}

function evidence(
  repositoryId: string,
  sha: string,
  status: RuntimeCorrelationEvidence["status"]
): RuntimeCorrelationEvidence {
  return {
    status,
    repositoryId,
    targetRevisionSha: sha,
    parentRevisionSha: null,
    targetCommitAt: null,
    changeContext: null,
    assessment: null,
    windowMinutes: 60,
    minimumSamples: 10,
    filters: {},
    baseline: null,
    target: null,
    observedDelta: {
      avgDurationMs: null,
      p95DurationMs: null,
      errorRate: null
    },
    evidencePolicy: [
      "Measurements are observational and do not establish causality."
    ]
  };
}

test("builds a deterministic chronological runtime reconstruction", () => {
  const repositoryId = "00000000-0000-0000-0000-000000000001";
  const commits = [
    commit(
      "a".repeat(40),
      "2026-09-28T00:00:00.000Z"
    ),
    commit(
      "b".repeat(40),
      "2026-09-28T01:00:00.000Z",
      "a".repeat(40)
    )
  ];
  const correlations = [
    evidence(repositoryId, commits[0]!.sha, "missing_parent_revision"),
    evidence(repositoryId, commits[1]!.sha, "ready")
  ];

  const result = buildHistoricalRuntimeReconstruction(
    repositoryId,
    1,
    25,
    2,
    60,
    10,
    {},
    commits,
    correlations
  );

  assert.deepEqual(
    result.events.map((event) => ({
      sequence: event.sequence,
      sha: event.commit.sha,
      status: event.correlation.status
    })),
    [
      {
        sequence: 1,
        sha: "a".repeat(40),
        status: "missing_parent_revision"
      },
      {
        sequence: 2,
        sha: "b".repeat(40),
        status: "ready"
      }
    ]
  );

  assert.deepEqual(result.events[0]!.temporalContext, {
    previousCommitSha: null,
    nextCommitSha: "b".repeat(40),
    previousCommitGapMinutes: null,
    nextCommitGapMinutes: 60,
    runtimeWindowOverlapsPrevious: null,
    runtimeWindowOverlapsNext: true
  });
  assert.deepEqual(result.events[1]!.temporalContext, {
    previousCommitSha: "a".repeat(40),
    nextCommitSha: null,
    previousCommitGapMinutes: 60,
    nextCommitGapMinutes: null,
    runtimeWindowOverlapsPrevious: true,
    runtimeWindowOverlapsNext: null
  });

  assert.equal(result.coverage.commitsInPage, 2);
  assert.equal(result.coverage.readyCorrelations, 1);
  assert.equal(result.coverage.evidenceGaps, 1);
  assert.equal(
    result.coverage.statusCounts.missing_parent_revision,
    1
  );
  assert.equal(result.coverage.statusCounts.ready, 1);
  assert.deepEqual(result.ordering, [
    "committed_at ASC NULLS LAST",
    "sha ASC"
  ]);
});

test("rejects correlation arrays that do not preserve one-to-one ordering", () => {
  assert.throws(
    () =>
      buildHistoricalRuntimeReconstruction(
        "00000000-0000-0000-0000-000000000001",
        1,
        25,
        1,
        60,
        10,
        {},
        [commit("a".repeat(40), "2026-09-28T00:00:00.000Z")],
        []
      ),
    /one correlation result per commit/i
  );
});



test("preserves adjacent commits across paginated reconstruction boundaries", () => {
  const first = commit(
    "a".repeat(40),
    "2026-09-01T00:00:00.000Z"
  );
  const middle = commit(
    "b".repeat(40),
    "2026-09-01T01:00:00.000Z"
  );
  const last = commit(
    "c".repeat(40),
    "2026-09-01T02:00:00.000Z"
  );

  const result = buildHistoricalRuntimeReconstruction(
    "repo",
    2,
    1,
    3,
    60,
    10,
    {},
    [middle],
    [evidence("repo", middle.sha, "insufficient_target_samples")],
    {
      previousCommit: first,
      nextCommit: last
    }
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.temporalContext.previousCommitSha, first.sha);
  assert.equal(result.events[0]?.temporalContext.nextCommitSha, last.sha);
  assert.equal(result.events[0]?.temporalContext.previousCommitGapMinutes, 60);
  assert.equal(result.events[0]?.temporalContext.nextCommitGapMinutes, 60);
  assert.equal(result.events[0]?.temporalContext.runtimeWindowOverlapsPrevious, true);
  assert.equal(result.events[0]?.temporalContext.runtimeWindowOverlapsNext, true);
});
