import { Queue } from "bullmq";
import { redis } from "../../config/redis.js";
import { ANALYSIS_QUEUE_NAME } from "../../workers/queue.constants.js";

export interface AnalysisJobData {
  kind?: "import" | "analyze";
  repositoryId: string;
  analysisRunId: string;
  remoteUrl?: string;
  branch?: string;
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

export async function enqueueRepositoryImport(
  repositoryId: string,
  analysisRunId: string,
  remoteUrl: string,
  branch?: string
): Promise<string> {
  const data: AnalysisJobData = {
    kind: "import",
    repositoryId,
    analysisRunId,
    remoteUrl,
    ...(branch ? { branch } : {})
  };

  const job = await analysisQueue.add(
    "import-repository",
    data,
    {
      jobId: `import-${analysisRunId}`,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2_000
      }
    }
  );

  return job.id ?? `import-${analysisRunId}`;
}

export async function enqueueRepositoryAnalysis(
  repositoryId: string,
  analysisRunId: string
): Promise<string> {
  const job = await analysisQueue.add(
    "analyze-repository",
    {
      kind: "analyze",
      repositoryId,
      analysisRunId
    },
    {
      jobId: analysisRunId
    }
  );

  return job.id ?? analysisRunId;
}
