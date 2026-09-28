import { Queue } from "bullmq";
import { redis } from "../../config/redis.js";
import { ANALYSIS_QUEUE_NAME } from "../../workers/analysis.worker.js";

export const analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export async function enqueueRepositoryAnalysis(
  repositoryId: string
): Promise<string> {
  const job = await analysisQueue.add("analyze-repository", {
    repositoryId
  });

  return job.id ?? "";
}
