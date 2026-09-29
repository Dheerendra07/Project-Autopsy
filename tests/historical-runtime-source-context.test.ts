import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoricalRuntimeSourceContextEvidence
} from "../src/modules/runtime/historical-runtime-source-context.service.js";
import type {
  HistoricalRuntimeReconstruction
} from "../src/modules/runtime/historical-correlation.service.js";

function reconstruction(): HistoricalRuntimeReconstruction {
  const repositoryId = "00000000-0000-0000-0000-000000000001";
  const readyCorrelation = {
    status: "ready",
    repositoryId,
    targetRevisionSha: "b".repeat(40),
    parentRevisionSha: "a".repeat(40),
    targetCommitAt: "2026-09-29T01:00:00.000Z",
    changeContext: {
      commitSha: "b".repeat(40),
      subject: "second",
      committedAt: "2026-09-29T01:00:00.000Z",
      parentRevisionSha: "a".repeat(40),
      filesChanged: 2,
      additions: 5,
      deletions: 1,
      changedFiles: [
        { path: "src/a.ts", status: "modified", additions: 4, deletions: 1 },
        { path: "src/b.ts", status: "added", additions: 1, deletions: 0 }
      ],
      changedFilesTruncated: false,
      changedFilesComplete: true
    },
    assessment: {
      status: "ready",
      scope: { environment: null, operationName: null, signalType: null },
      averageDuration: { delta: 5, relativePercent: 5, direction: "increased" },
      p95Duration: { delta: 8, relativePercent: 8, direction: "increased" },
      errorRate: { delta: 0.01, percentagePoints: 1, direction: "increased" },
      sampleComparison: {
        baselineSampleCount: 20,
        targetSampleCount: 30,
        sampleCountDifference: 10,
        targetToBaselineRatio: 1.5,
        absoluteImbalancePercent: 50,
        baselineDurationCoveragePercent: 100,
        targetDurationCoveragePercent: 100
      },
      evidencePolicy: ["observational"]
    },
    windowMinutes: 60,
    minimumSamples: 10,
    filters: {},
    baseline: null,
    target: null,
    observedDelta: { avgDurationMs: 5, p95DurationMs: 8, errorRate: 0.01 },
    evidencePolicy: ["observational"]
  } as const;

  return {
    repositoryId,
    page: 1,
    limit: 2,
    totalCommits: 2,
    windowMinutes: 60,
    minimumSamples: 10,
    filters: {},
    ordering: ["committed_at ASC NULLS LAST", "sha ASC"],
    semantics: {
      timeline: "timeline",
      causality: "no causality",
      evidenceGaps: "explicit gaps"
    },
    coverage: {
      commitsInPage: 2,
      readyCorrelations: 1,
      evidenceGaps: 1,
      statusCounts: {
        ready: 1,
        repository_revision_not_found: 0,
        commit_time_unavailable: 0,
        missing_parent_revision: 0,
        insufficient_baseline_samples: 0,
        insufficient_target_samples: 1
      }
    },
    events: [
      {
        sequence: 1,
        temporalContext: {
          previousCommitSha: null,
          nextCommitSha: "b".repeat(40),
          previousCommitGapMinutes: null,
          nextCommitGapMinutes: 60,
          runtimeWindowOverlapsPrevious: null,
          runtimeWindowOverlapsNext: true
        },
        commit: {
          sha: "a".repeat(40),
          parentRevisionSha: null,
          subject: "first",
          committedAt: "2026-09-29T00:00:00.000Z",
          filesChanged: 1,
          additions: 2,
          deletions: 0
        },
        correlation: {
          ...readyCorrelation,
          status: "insufficient_target_samples",
          targetRevisionSha: "a".repeat(40),
          changeContext: {
            ...readyCorrelation.changeContext,
            commitSha: "a".repeat(40),
            subject: "first",
            parentRevisionSha: null,
            filesChanged: 1,
            additions: 2,
            deletions: 0,
            changedFiles: [
              { path: "src/old.ts", status: "modified", additions: 2, deletions: 0 }
            ],
            changedFilesTruncated: true,
            changedFilesComplete: false
          },
          assessment: null
        }
      },
      {
        sequence: 2,
        temporalContext: {
          previousCommitSha: "a".repeat(40),
          nextCommitSha: null,
          previousCommitGapMinutes: 60,
          nextCommitGapMinutes: null,
          runtimeWindowOverlapsPrevious: true,
          runtimeWindowOverlapsNext: null
        },
        commit: {
          sha: "b".repeat(40),
          parentRevisionSha: "a".repeat(40),
          subject: "second",
          committedAt: "2026-09-29T01:00:00.000Z",
          filesChanged: 2,
          additions: 5,
          deletions: 1
        },
        correlation: readyCorrelation
      }
    ]
  };
}

test("projects exact commit source context alongside runtime evidence without file-level attribution", () => {
  const result = buildHistoricalRuntimeSourceContextEvidence(reconstruction());

  assert.deepEqual(result.coverage, {
    commitsInPage: 2,
    sourceContextAvailable: 2,
    sourceContextComplete: 1,
    sourceContextTruncated: 1,
    sourceContextUnavailable: 0,
    totalChangedFilesReported: 3,
    totalFilesChanged: 3,
    totalAdditions: 7,
    totalDeletions: 1,
    runtimeReadyWithCompleteSourceContext: 1,
    runtimeReadyWithTruncatedSourceContext: 0,
    runtimeEvidenceGapsWithSourceContext: 1
  });

  assert.equal(result.events[0].sourceContext.status, "truncated");
  assert.equal(result.events[1].sourceContext.status, "available");
  assert.equal(result.events[1].runtimeEvidence.status, "ready");
  assert.equal(result.events[1].sourceContext.changedFiles[0]?.path, "src/a.ts");
});

test("rejects mismatched source-context commit identity", () => {
  const value = reconstruction();
  value.events[1].correlation.changeContext!.commitSha = "c".repeat(40);

  assert.throws(
    () => buildHistoricalRuntimeSourceContextEvidence(value),
    /commit identity does not match/
  );
});
