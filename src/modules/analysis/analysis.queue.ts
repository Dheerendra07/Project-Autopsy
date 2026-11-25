import { Queue } from "bullmq";
import { redis } from "../../config/redis.js";
import { ANALYSIS_QUEUE_NAME } from "../../workers/queue.constants.js";
import { ANALYSIS_JOB_RETRY_POLICY } from "./queue-policy.js";

export interface AnalysisJobData {
  kind?: "import" | "refresh" | "analyze";
  repositoryId: string;
  analysisRunId: string;
  remoteUrl?: string;
  branch?: string;
}

export interface AnalysisJobProgress {
  stage: string;
  completed?: number;
  total?: number;
}

function isAnalysisJobProgress(value: unknown): value is AnalysisJobProgress {
  if (!value || typeof value !== "object" || !("stage" in value)) {
    return false;
  }

  const progress = value as Record<string, unknown>;
  return (
    typeof progress.stage === "string" &&
    (progress.completed === undefined ||
      (typeof progress.completed === "number" &&
        Number.isFinite(progress.completed) &&
        progress.completed >= 0)) &&
    (progress.total === undefined ||
      (typeof progress.total === "number" &&
        Number.isFinite(progress.total) &&
        progress.total >= 0))
  );
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

export async function getAnalysisJobProgress(
  analysisRunId: string
): Promise<AnalysisJobProgress | null> {
  const [analysisJob, importJob, refreshJob] = await Promise.all([
    analysisQueue.getJob(analysisRunId),
    analysisQueue.getJob(`import-${analysisRunId}`),
    analysisQueue.getJob(`refresh-${analysisRunId}`)
  ]);
  const jobs = await Promise.all(
    [analysisJob, importJob, refreshJob].map(async (job) =>
      job ? { job, state: await job.getState() } : null
    )
  );
  const available = jobs.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null
  );
  const selected =
    available.find((entry) => entry.state === "active") ??
    available.find((entry) => entry.state === "waiting") ??
    available.find((entry) => entry.state === "delayed");

  if (!selected || !isAnalysisJobProgress(selected.job.progress)) {
    return null;
  }

  return selected.job.progress;
}

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

export async function enqueueRepositoryRefresh(
  repositoryId: string,
  analysisRunId: string
): Promise<string> {
  const job = await analysisQueue.add(
    "refresh-repository",
    {
      kind: "refresh",
      repositoryId,
      analysisRunId
    },
    {
      jobId: `refresh-${analysisRunId}`,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2_000
      }
    }
  );

  return job.id ?? `refresh-${analysisRunId}`;
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
      jobId: analysisRunId,
      ...ANALYSIS_JOB_RETRY_POLICY
    }
  );

  return job.id ?? analysisRunId;
}
