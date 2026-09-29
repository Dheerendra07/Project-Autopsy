export const ANALYSIS_JOB_MAX_ATTEMPTS = 3;
export const ANALYSIS_JOB_BACKOFF_DELAY_MS = 2_000;

export const ANALYSIS_JOB_RETRY_POLICY = {
  attempts: ANALYSIS_JOB_MAX_ATTEMPTS,
  backoff: {
    type: "exponential" as const,
    delay: ANALYSIS_JOB_BACKOFF_DELAY_MS
  }
};
