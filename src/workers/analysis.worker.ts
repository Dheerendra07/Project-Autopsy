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

    await updateAnalysisRun(analysisRunId, "running");

    const repository = await getRepositoryById(repositoryId);

    if (!repository) {
      const message = `Repository not found: ${repositoryId}`;
      await updateAnalysisRun(analysisRunId, "failed", {
        errorMessage: message
      });
      throw new Error(message);
    }

    if (!repository.storage_path) {
      const message = `Repository storage path is missing: ${repositoryId}`;
      await updateAnalysisRun(analysisRunId, "failed", {
        errorMessage: message
      });
      throw new Error(message);
    }

    try {
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

      await updateAnalysisRun(analysisRunId, "failed", {
        errorMessage: message
      });

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
