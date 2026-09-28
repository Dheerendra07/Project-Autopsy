import type { RuntimeCorrelationWindow } from "./correlation.types.js";
import type { RuntimeTelemetryFilters } from "./runtime.types.js";
import type {
  RuntimeChangeAssessment,
  RuntimeDeltaMeasurement,
  RuntimeErrorRateMeasurement,
  RuntimeSampleComparison
} from "./change-assessment.types.js";

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function compareMeasurement(
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
    delta: roundMetric(delta),
    relativePercent:
      baselineValue === 0
        ? null
        : roundMetric((delta / Math.abs(baselineValue)) * 100),
    direction:
      delta > 0
        ? "increased"
        : delta < 0
          ? "decreased"
          : "unchanged"
  };
}

function compareErrorRate(
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
    delta: roundMetric(delta),
    percentagePoints: roundMetric(delta * 100),
    direction:
      delta > 0
        ? "increased"
        : delta < 0
          ? "decreased"
          : "unchanged"
  };
}

function toPercentage(
  numerator: number,
  denominator: number
): number | null {
  return denominator === 0 ? null : roundMetric((numerator / denominator) * 100);
}

function buildSampleComparison(
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
      baselineSamples === 0 ? null : roundMetric(targetSamples / baselineSamples),
    absoluteImbalancePercent:
      largerSampleCount === 0
        ? null
        : roundMetric((Math.abs(difference) / largerSampleCount) * 100),
    baselineDurationCoveragePercent: toPercentage(
      baseline.aggregate.durationSampleCount,
      baselineSamples
    ),
    targetDurationCoveragePercent: toPercentage(
      target.aggregate.durationSampleCount,
      targetSamples
    )
  };
}

export function buildRuntimeChangeAssessment(
  baseline: RuntimeCorrelationWindow,
  target: RuntimeCorrelationWindow,
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">
): RuntimeChangeAssessment {
  return {
    status: "ready",
    scope: {
      environment: filters.environment ?? null,
      operationName: filters.operationName ?? null,
      signalType: filters.signalType ?? null
    },
    averageDuration: compareMeasurement(
      baseline.aggregate.avgDurationMs,
      target.aggregate.avgDurationMs
    ),
    p95Duration: compareMeasurement(
      baseline.aggregate.p95DurationMs,
      target.aggregate.p95DurationMs
    ),
    errorRate: compareErrorRate(
      baseline.aggregate.errorRate,
      target.aggregate.errorRate
    ),
    sampleComparison: buildSampleComparison(baseline, target),
    evidencePolicy: [
      "These are deterministic measurements of the selected baseline and target runtime windows.",
      "Direction labels describe observed numeric change only; they are not regression or quality verdicts.",
      "Relative duration changes are undefined when the baseline duration is zero.",
      "Sample balance and duration coverage describe the observations used for comparison; they do not prove workload equivalence or causality."
    ]
  };
}
