import type { RuntimeCorrelationStatus } from "./correlation.types.js";

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
