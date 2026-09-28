import { Worker } from "bullmq";
import { redis } from "../config/redis.js";

export const ANALYSIS_QUEUE_NAME = "repository-analysis";

export const analysisWorker = new Worker(
  ANALYSIS_QUEUE_NAME,
  async (job) => {
    console.log(
      `Analysis job ${job.id} started for repository ${job.data.repositoryId}`
    );

    // Phase 2 will replace this placeholder with:
    // repository scan -> commit discovery -> deterministic analyzers.
    return {
      status: "accepted",
      repositoryId: job.data.repositoryId
    };
  },
  {
    connection: redis
  }
);

analysisWorker.on("failed", (job, error) => {
  console.error(
    `Analysis job ${job?.id ?? "unknown"} failed:`,
    error
  );
});
