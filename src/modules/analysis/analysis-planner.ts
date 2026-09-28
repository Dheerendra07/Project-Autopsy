import type { AnalysisMode } from "../repositories/repository.persistence.js";

export type AnalysisPlanKind = "up_to_date" | "run";

export interface AnalysisPlan {
  kind: AnalysisPlanKind;
  analysisMode?: AnalysisMode;
  baseHeadSha?: string | null;
  targetHeadSha: string;
}

export function planAnalysisRun(
  targetHeadSha: string,
  latestAnalyzedHeadSha: string | null,
  isLatestHeadAncestor: boolean
): AnalysisPlan {
  if (
    latestAnalyzedHeadSha &&
    latestAnalyzedHeadSha === targetHeadSha
  ) {
    return {
      kind: "up_to_date",
      targetHeadSha
    };
  }

  if (
    latestAnalyzedHeadSha &&
    isLatestHeadAncestor
  ) {
    return {
      kind: "run",
      analysisMode: "incremental",
      baseHeadSha: latestAnalyzedHeadSha,
      targetHeadSha
    };
  }

  return {
    kind: "run",
    analysisMode: "full",
    baseHeadSha: null,
    targetHeadSha
  };
}
