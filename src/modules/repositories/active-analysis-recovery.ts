import { analysisQueue } from "../analysis/analysis.queue.js";
import { ANALYSIS_DEADLINE_MS } from "../analysis/analysis-deadline.js";
import {
  isExpiredRunningAnalysisRun
} from "../analysis/analysis-expiry.js";
import {
  getAnalysisRunById,
  updateAnalysisRun,
  type StoredAnalysisRun
} from "./repository.persistence.js";
import { sanitizePublicAnalysisErrorMessage } from "../analysis/analysis-error.js";
import { isFailedQueueJobState } from "../analysis/queue-job-state.js";
import { getRepositoryStoragePath } from "./repository.service.js";

/**
 * Reconcile a DB run that still appears active only when BullMQ proves that
 * its corresponding import/refresh/analysis job is already terminally failed,
 * or when a running row has exceeded its execution deadline and no live
 * corresponding queue job remains. Missing/non-failed queue jobs are never
 * treated as failed before the execution deadline plus recovery grace.
 */
export async function reconcileFailedActiveAnalysisRun(
  activeRun: Pick<StoredAnalysisRun, "id" | "repository_id">
): Promise<boolean> {
  const candidateJobIds = [
    activeRun.id,
    `import-${activeRun.id}`,
    `refresh-${activeRun.id}`
  ];
  let hasLiveQueueJob = false;

  for (const jobId of candidateJobIds) {
    const job = await analysisQueue.getJob(jobId);

    if (!job) {
      continue;
    }

    if (
      job.data.repositoryId !== activeRun.repository_id ||
      job.data.analysisRunId !== activeRun.id
    ) {
      continue;
    }

    const state = await job.getState();

    if (isFailedQueueJobState(state)) {
      const current = await getAnalysisRunById(activeRun.id);

      if (
        !current ||
        current.repository_id !== activeRun.repository_id ||
        (current.status !== "queued" && current.status !== "running")
      ) {
        return false;
      }

      const rawMessage =
        job.failedReason || "The analysis worker stopped before completing this run.";
      const errorMessage =
        sanitizePublicAnalysisErrorMessage(
          rawMessage,
          getRepositoryStoragePath(current.repository_id)
        ) ?? "Analysis worker stopped before completing this run.";

      await updateAnalysisRun(current.id, "failed", {
        errorMessage
      });

      console.warn(
        `Reconciled stale active analysis run ${current.id} from failed BullMQ job ${jobId}.`
      );

      return true;
    }

    // A waiting, active, delayed, or otherwise non-terminal queue state means
    // BullMQ still owns work for this run. A completed parent job is not live:
    // an import/refresh may have completed before its follow-up analysis job.
    if (state !== "completed") {
      hasLiveQueueJob = true;
    }
  }

  if (hasLiveQueueJob) {
    return false;
  }

  const current = await getAnalysisRunById(activeRun.id);

  if (
    !current ||
    current.repository_id !== activeRun.repository_id ||
    !isExpiredRunningAnalysisRun(
      current.status,
      current.started_at,
      Date.now(),
      ANALYSIS_DEADLINE_MS
    )
  ) {
    return false;
  }

  const rawMessage =
    "Analysis exceeded its configured execution deadline and no active queue job remains. Refresh the repository to retry.";
  const errorMessage =
    sanitizePublicAnalysisErrorMessage(
      rawMessage,
      getRepositoryStoragePath(current.repository_id)
    ) ?? "Analysis exceeded its execution deadline. Refresh the repository to retry.";

  await updateAnalysisRun(current.id, "failed", {
    errorMessage
  });

  console.warn(
    `Reconciled expired analysis run ${current.id}: no live BullMQ job remained after its execution deadline.`
  );

  return true;
}
