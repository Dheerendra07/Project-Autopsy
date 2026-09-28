import { Queue } from "bullmq";
import { redis } from "../../config/redis.js";
import { ANALYSIS_QUEUE_NAME } from "../../workers/queue.constants.js";

export interface AnalysisJobData {
  repositoryId: string;
  analysisRunId: string;
}

export const analysisQueue = new Queue<AnalysisJobData>(
  ANALYSIS_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  }
);

export async function enqueueRepositoryAnalysis(
  repositoryId: string,
  analysisRunId: string
): Promise<string> {
  const job = await analysisQueue.add(
    "analyze-repository",
    {
      repositoryId,
      analysisRunId
    },
    {
      jobId: analysisRunId
    }
  );

  return job.id ?? analysisRunId;
}
