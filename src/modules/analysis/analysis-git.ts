import { simpleGit } from "simple-git";
import { env } from "../../config/env.js";
import { getAnalysisDeadline } from "./analysis-deadline.js";

export const ANALYSIS_GIT_TIMEOUT_MS =
  env.MAX_ANALYSIS_TIME_MINUTES * 60 * 1000;

export function createAnalysisGit(repositoryPath: string) {
  const deadline = getAnalysisDeadline();

  deadline?.assertNotExpired();

  const timeoutMs = deadline
    ? Math.max(1, Math.floor(deadline.remainingMs()))
    : ANALYSIS_GIT_TIMEOUT_MS;

  return simpleGit(repositoryPath, {
    maxConcurrentProcesses: 1,
    timeout: {
      block: timeoutMs
    },
    ...(deadline
      ? {
          abort: deadline.signal
        }
      : {})
  });
}
