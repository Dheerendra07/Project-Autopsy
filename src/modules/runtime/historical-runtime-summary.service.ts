import type {
  HistoricalRuntimeReconstruction,
  HistoricalRuntimeReconstructionEvent
} from "./historical-correlation.service.js";

export interface HistoricalRuntimeEvidenceSummary {
  repositoryId: string;
  page: number;
  limit: number;
  totalCommits: number;
  pageCoverage: {
    commits: number;
    ready: number;
    evidenceGaps: number;
    readyPercent: number | null;
  };
  metricDirections: {
    averageDuration: Record<"increased" | "decreased" | "unchanged" | "unavailable", number>;
    p95Duration: Record<"increased" | "decreased" | "unchanged" | "unavailable", number>;
    errorRate: Record<"increased" | "decreased" | "unchanged" | "unavailable", number>;
  };
  sampleCoverage: {
    readyComparisons: number;
    baselineSamples: number;
    targetSamples: number;
    comparisonsWithTargetMoreSamples: number;
    comparisonsWithTargetFewerSamples: number;
  };
  temporalCoverage: {
    adjacentCommitPairs: number;
    overlappingAdjacentWindows: number;
    overlapPercent: number | null;
  };
  semantics: {
    interpretation: string;
    directionCounts: string;
    overlap: string;
  };
}

const DIRECTIONS = ["increased", "decreased", "unchanged", "unavailable"] as const;
type Direction = (typeof DIRECTIONS)[number];

function directionCounts(): Record<Direction, number> {
  return { increased: 0, decreased: 0, unchanged: 0, unavailable: 0 };
}

function increment(counts: Record<Direction, number>, direction: Direction | undefined): void {
  counts[direction && DIRECTIONS.includes(direction) ? direction : "unavailable"] += 1;
}

export function summarizeHistoricalRuntimeEvidence(
  reconstruction: HistoricalRuntimeReconstruction
): HistoricalRuntimeEvidenceSummary {
  const averageDuration = directionCounts();
  const p95Duration = directionCounts();
  const errorRate = directionCounts();
  let ready = 0;
  let baselineSamples = 0;
  let targetSamples = 0;
  let comparisonsWithTargetMoreSamples = 0;
  let comparisonsWithTargetFewerSamples = 0;
  let adjacentCommitPairs = 0;
  let overlappingAdjacentWindows = 0;

  reconstruction.events.forEach((event, index) => {
    const assessment = event.correlation.assessment;

    if (event.correlation.status === "ready" && assessment) {
      ready += 1;
      increment(averageDuration, assessment.averageDuration.direction);
      increment(p95Duration, assessment.p95Duration.direction);
      increment(errorRate, assessment.errorRate.direction);

      const baseline = assessment.sampleComparison.baselineSampleCount;
      const target = assessment.sampleComparison.targetSampleCount;
      baselineSamples += baseline;
      targetSamples += target;

      if (target > baseline) comparisonsWithTargetMoreSamples += 1;
      else if (target < baseline) comparisonsWithTargetFewerSamples += 1;
    } else {
      increment(averageDuration, "unavailable");
      increment(p95Duration, "unavailable");
      increment(errorRate, "unavailable");
    }

    if (index < reconstruction.events.length - 1) {
      adjacentCommitPairs += 1;
      if (event.temporalContext.runtimeWindowOverlapsNext === true) {
        overlappingAdjacentWindows += 1;
      }
    }
  });

  return {
    repositoryId: reconstruction.repositoryId,
    page: reconstruction.page,
    limit: reconstruction.limit,
    totalCommits: reconstruction.totalCommits,
    pageCoverage: {
      commits: reconstruction.coverage.commitsInPage,
      ready,
      evidenceGaps: reconstruction.coverage.evidenceGaps,
      readyPercent:
        reconstruction.coverage.commitsInPage > 0
          ? Number(((ready / reconstruction.coverage.commitsInPage) * 100).toFixed(6))
          : null
    },
    metricDirections: { averageDuration, p95Duration, errorRate },
    sampleCoverage: {
      readyComparisons: ready,
      baselineSamples,
      targetSamples,
      comparisonsWithTargetMoreSamples,
      comparisonsWithTargetFewerSamples
    },
    temporalCoverage: {
      adjacentCommitPairs,
      overlappingAdjacentWindows,
      overlapPercent:
        adjacentCommitPairs > 0
          ? Number(((overlappingAdjacentWindows / adjacentCommitPairs) * 100).toFixed(6))
          : null
    },
    semantics: {
      interpretation:
        "This is a descriptive summary of the selected historical reconstruction page. It does not identify regressions, causes, or preferred revisions.",
      directionCounts:
        "Metric direction counts describe observed before/after measurements among ready comparisons; unavailable includes evidence-gap events.",
      overlap:
        "Adjacent-window overlap describes temporal evidence overlap only and does not establish deployment order or causality."
    }
  };
}
