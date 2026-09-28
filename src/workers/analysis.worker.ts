import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import {
  ANALYSIS_QUEUE_NAME,
  ANALYZER_VERSION
} from "./queue.constants.js";
import {
  getRepositoryById,
  persistCommitBatch,
  updateAnalysisRun
} from "../modules/repositories/repository.persistence.js";
import { discoverCommits } from "../modules/commits/commit.discovery.js";
import type { AnalysisJobData } from "../modules/analysis/analysis.queue.js";

export const analysisWorker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE_NAME,
  async (job) => {
    const { repositoryId, analysisRunId } = job.data;

    try {
      await updateAnalysisRun(analysisRunId, "running");

      const repository = await getRepositoryById(repositoryId);

      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      if (!repository.storage_path) {
        throw new Error(
          `Repository storage path is missing: ${repositoryId}`
        );
      }

      const commits = await discoverCommits(repository.storage_path);
      const persistedCount = await persistCommitBatch(
        repositoryId,
        commits
      );

      await updateAnalysisRun(analysisRunId, "completed");

      return {
        status: "completed",
        repositoryId,
        analyzerVersion: ANALYZER_VERSION,
        commitsDiscovered: commits.length,
        commitsPersisted: persistedCount
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown analysis error";

      try {
        await updateAnalysisRun(analysisRunId, "failed", {
          errorMessage: message
        });
      } catch (persistenceError) {
        console.error(
          `Failed to record analysis failure for ${analysisRunId}:`,
          persistenceError
        );
      }

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1
  }
);

analysisWorker.on("failed", (job, error) => {
  console.error(
    `Analysis job ${job?.id ?? "unknown"} failed:`,
    error
  );
});
