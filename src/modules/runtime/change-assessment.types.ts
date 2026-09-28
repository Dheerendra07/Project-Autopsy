import type { RuntimeCorrelationStatus, RuntimeCorrelationWindow } from "./correlation.types.js";
import type { RuntimeTelemetryFilters } from "./runtime.types.js";

export type RuntimeMeasurementDirection =
  | "increased"
  | "decreased"
  | "unchanged"
  | "unavailable";

export interface RuntimeDeltaMeasurement {
  delta: number | null;
  relativePercent: number | null;
  direction: RuntimeMeasurementDirection;
}

export interface RuntimeErrorRateMeasurement {
  delta: number | null;
  percentagePoints: number | null;
  direction: RuntimeMeasurementDirection;
}

export interface RuntimeSampleComparison {
  baselineSampleCount: number;
  targetSampleCount: number;
  sampleCountDifference: number;
  targetToBaselineRatio: number | null;
  absoluteImbalancePercent: number | null;
  baselineDurationCoveragePercent: number | null;
  targetDurationCoveragePercent: number | null;
}

export interface RuntimeChangeAssessment {
  status: Extract<RuntimeCorrelationStatus, "ready">;
  scope: {
    environment: string | null;
    operationName: string | null;
    signalType: string | null;
  };
  averageDuration: RuntimeDeltaMeasurement;
  p95Duration: RuntimeDeltaMeasurement;
  errorRate: RuntimeErrorRateMeasurement;
  sampleComparison: RuntimeSampleComparison;
  evidencePolicy: string[];
}

export interface RuntimeAssessmentInput {
  baseline: RuntimeCorrelationWindow;
  target: RuntimeCorrelationWindow;
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">;
}

export function compareRuntimeMeasurement(
  baselineValue: number | null,
  targetValue: number | null
): RuntimeDeltaMeasurement {
  if (baselineValue === null || targetValue === null) {
    return {
      delta: null,
      relativePercent: null,
      direction: "unavailable"
    };
  }

  const delta = targetValue - baselineValue;

  return {
    delta,
    relativePercent:
      baselineValue === 0
        ? null
        : (delta / Math.abs(baselineValue)) * 100,
    direction:
      delta > 0
        ? "increased"
        : delta < 0
          ? "decreased"
          : "unchanged"
  };
}

export function compareRuntimeErrorRate(
  baselineValue: number | null,
  targetValue: number | null
): RuntimeErrorRateMeasurement {
  if (baselineValue === null || targetValue === null) {
    return {
      delta: null,
      percentagePoints: null,
      direction: "unavailable"
    };
  }

  const delta = targetValue - baselineValue;

  return {
    delta,
    percentagePoints: delta * 100,
    direction:
      delta > 0
        ? "increased"
        : delta < 0
          ? "decreased"
          : "unchanged"
  };
}

function percentage(
  numerator: number,
  denominator: number
): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

export function buildRuntimeSampleComparison(
  baseline: RuntimeCorrelationWindow,
  target: RuntimeCorrelationWindow
): RuntimeSampleComparison {
  const baselineSamples = baseline.aggregate.sampleCount;
  const targetSamples = target.aggregate.sampleCount;
  const difference = targetSamples - baselineSamples;
  const largerSampleCount = Math.max(baselineSamples, targetSamples);

  return {
    baselineSampleCount: baselineSamples,
    targetSampleCount: targetSamples,
    sampleCountDifference: difference,
    targetToBaselineRatio:
      baselineSamples === 0 ? null : targetSamples / baselineSamples,
    absoluteImbalancePercent:
      largerSampleCount === 0
        ? null
        : (Math.abs(difference) / largerSampleCount) * 100,
    baselineDurationCoveragePercent: percentage(
      baseline.aggregate.durationSampleCount,
      baselineSamples
    ),
    targetDurationCoveragePercent: percentage(
      target.aggregate.durationSampleCount,
      targetSamples
    )
  };
}

export function buildRuntimeChangeAssessment(
  input: RuntimeAssessmentInput
): RuntimeChangeAssessment {
  return {
    status: "ready",
    scope: {
      environment: input.filters.environment ?? null,
      operationName: input.filters.operationName ?? null,
      signalType: input.filters.signalType ?? null
    },
    averageDuration: compareRuntimeMeasurement(
      input.baseline.aggregate.avgDurationMs,
      input.target.aggregate.avgDurationMs
    ),
    p95Duration: compareRuntimeMeasurement(
      input.baseline.aggregate.p95DurationMs,
      input.target.aggregate.p95DurationMs
    ),
    errorRate: compareRuntimeErrorRate(
      input.baseline.aggregate.errorRate,
      input.target.aggregate.errorRate
    ),
    sampleComparison: buildRuntimeSampleComparison(
      input.baseline,
      input.target
    ),
    evidencePolicy: [
      "These are deterministic measurements of the selected baseline and target runtime windows.",
      "Direction labels describe observed numeric change only; they are not regression or quality verdicts.",
      "Relative duration changes are undefined when the baseline duration is zero.",
      "Sample balance and duration coverage describe the observations used for comparison; they do not prove workload equivalence or causality."
    ]
  };
}
