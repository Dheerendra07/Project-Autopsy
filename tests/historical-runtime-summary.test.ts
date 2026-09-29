import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeHistoricalRuntimeEvidence
} from "../src/modules/runtime/historical-runtime-summary.service.js";
import type {
  HistoricalRuntimeReconstruction
} from "../src/modules/runtime/historical-correlation.service.js";

function reconstruction(): HistoricalRuntimeReconstruction {
  const base = {
    repositoryId: "00000000-0000-0000-0000-000000000001",
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
    }
  } as const;

  const ready = {
    status: "ready",
    repositoryId: base.repositoryId,
    targetRevisionSha: "b".repeat(40),
    parentRevisionSha: "a".repeat(40),
    targetCommitAt: "2026-09-29T01:00:00.000Z",
    changeContext: null,
    windowMinutes: 60,
    minimumSamples: 10,
    filters: {},
    baseline: null,
    target: null,
    observedDelta: {
      avgDurationMs: 5,
      p95DurationMs: 8,
      errorRate: 0.01
    },
    assessment: {
      status: "ready",
      scope: {
        environment: null,
        operationName: null,
        signalType: null
      },
      averageDuration: {
        delta: 5,
        relativePercent: 5,
        direction: "increased"
      },
      p95Duration: {
        delta: 8,
        relativePercent: 8,
        direction: "increased"
      },
      errorRate: {
        delta: 0.01,
        percentagePoints: 1,
        direction: "increased"
      },
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
    evidencePolicy: []
  } as const;

  return {
    ...base,
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
          additions: 1,
          deletions: 0
        },
        correlation: {
          ...ready,
          status: "insufficient_target_samples",
          assessment: null,
          targetRevisionSha: "a".repeat(40)
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
          filesChanged: 1,
          additions: 2,
          deletions: 1
        },
        correlation: ready
      }
    ]
  };
}

test("summarizes ready evidence, gaps, directions, samples, and overlap deterministically", () => {
  const result = summarizeHistoricalRuntimeEvidence(reconstruction());

  assert.equal(result.pageCoverage.commits, 2);
  assert.equal(result.pageCoverage.ready, 1);
  assert.equal(result.pageCoverage.evidenceGaps, 1);
  assert.equal(result.pageCoverage.readyPercent, 50);

  assert.deepEqual(result.metricDirections.averageDuration, {
    increased: 1,
    decreased: 0,
    unchanged: 0,
    unavailable: 1
  });
  assert.deepEqual(result.metricDirections.p95Duration, {
    increased: 1,
    decreased: 0,
    unchanged: 0,
    unavailable: 1
  });
  assert.deepEqual(result.metricDirections.errorRate, {
    increased: 1,
    decreased: 0,
    unchanged: 0,
    unavailable: 1
  });

  assert.deepEqual(result.sampleCoverage, {
    readyComparisons: 1,
    baselineSamples: 20,
    targetSamples: 30,
    comparisonsWithTargetMoreSamples: 1,
    comparisonsWithTargetFewerSamples: 0
  });

  assert.deepEqual(result.temporalCoverage, {
    adjacentCommitPairs: 1,
    overlappingAdjacentWindows: 1,
    overlapPercent: 100
  });
});
