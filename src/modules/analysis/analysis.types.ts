export type AnalysisRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface AnalysisRun {
  id: string;
  repositoryId: string;
  analyzerVersion: string;
  status: AnalysisRunStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}
