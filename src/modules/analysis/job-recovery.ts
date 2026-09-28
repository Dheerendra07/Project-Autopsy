import type { AnalysisMode } from "../repositories/repository.persistence.js";
import type { AnalysisRunStatus } from "./analysis.types.js";

export type AnalysisJobKind = "import" | "refresh" | "analyze";

export type AnalysisJobRecovery =
  | { action: "already_completed" }
  | { action: "terminal_failed" }
  | { action: "resume_import_analysis"; analysisMode: AnalysisMode; targetHeadSha: string }
  | { action: "resume_refresh_check"; targetHeadSha: string }
  | { action: "resume_refresh_analysis"; analysisMode: Exclude<AnalysisMode, "check">; targetHeadSha: string }
  | { action: "start" };

export interface AnalysisJobRecoveryInput {
  kind: AnalysisJobKind;
  attemptsMade: number;
  status: AnalysisRunStatus;
  analysisMode: AnalysisMode;
  targetHeadSha: string | null;
}

export function classifyAnalysisJobRecovery(
  input: AnalysisJobRecoveryInput
): AnalysisJobRecovery {
  if (input.status === "completed") {
    return { action: "already_completed" };
  }

  if (input.status === "failed") {
    return { action: "terminal_failed" };
  }

  if (
    input.attemptsMade > 0 &&
    input.targetHeadSha
  ) {
    if (input.kind === "import") {
      return {
        action: "resume_import_analysis",
        analysisMode: input.analysisMode,
        targetHeadSha: input.targetHeadSha
      };
    }

    if (input.kind === "refresh" && input.analysisMode === "check") {
      return {
        action: "resume_refresh_check",
        targetHeadSha: input.targetHeadSha
      };
    }

    if (
      input.kind === "refresh" &&
      (input.analysisMode === "full" || input.analysisMode === "incremental")
    ) {
      return {
        action: "resume_refresh_analysis",
        analysisMode: input.analysisMode,
        targetHeadSha: input.targetHeadSha
      };
    }
  }

  return { action: "start" };
}
