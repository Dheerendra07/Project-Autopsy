import { simpleGit } from "simple-git";
import { env } from "../../config/env.js";

export const ANALYSIS_GIT_TIMEOUT_MS =
  env.MAX_ANALYSIS_TIME_MINUTES * 60 * 1000;

export function createAnalysisGit(repositoryPath: string) {
  return simpleGit(repositoryPath, {
    maxConcurrentProcesses: 1,
    timeout: {
      block: ANALYSIS_GIT_TIMEOUT_MS
    }
  });
}
