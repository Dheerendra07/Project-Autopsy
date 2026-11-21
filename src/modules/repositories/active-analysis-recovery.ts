import { analysisQueue } from "../analysis/analysis.queue.js";
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
 * its corresponding import/refresh/analysis job is already terminally failed.
 * Missing or non-failed queue jobs are never treated as failed.
 */
export async function reconcileFailedActiveAnalysisRun(
  activeRun: Pick<StoredAnalysisRun, "id" | "repository_id">
): Promise<boolean> {
  const candidateJobIds = [
    activeRun.id,
    `import-${activeRun.id}`,
    `refresh-${activeRun.id}`
  ];

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

    if (!isFailedQueueJobState(state)) {
      continue;
    }

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

  return false;
}
