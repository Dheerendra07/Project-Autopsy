import type { AnalysisRunStatus } from "./analysis.types.js";

const ANALYSIS_TRANSITIONS: Record<
  AnalysisRunStatus,
  readonly AnalysisRunStatus[]
> = {
  queued: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: []
};

export function isValidAnalysisTransition(
  current: AnalysisRunStatus,
  next: AnalysisRunStatus
): boolean {
  return current === next || ANALYSIS_TRANSITIONS[current].includes(next);
}
