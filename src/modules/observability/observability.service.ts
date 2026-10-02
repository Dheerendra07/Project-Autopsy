
export interface QueueCounts {
  active: number;
  completed: number;
  delayed: number;
  failed: number;
  prioritized: number;
  paused: number;
  waiting: number;
  "waiting-children": number;
}

export interface OperationalDependencyStatus {
  status: "ready" | "unavailable";
  latencyMs: number | null;
}

export interface OperationalSnapshot {
  success: boolean;
  service: "project-autopsy-api";
  status: "healthy" | "degraded";
  timestamp: string;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    rssMb: number;
    heapUsedMb: number;
  };
  dependencies: {
    database: OperationalDependencyStatus;
    redis: OperationalDependencyStatus;
  };
  analysisQueue: QueueCounts | null;
}

export interface OperationalDependencies {
  checkDatabase: () => Promise<void>;
  checkRedis: () => Promise<void>;
  getQueueCounts: () => Promise<QueueCounts>;
  now: () => number;
  uptimeSeconds: () => number;
  memoryUsage: () => NodeJS.MemoryUsage;
  nodeVersion: string;
}

async function getAnalysisQueueCounts(): Promise<QueueCounts> {
  const { analysisQueue } = await import("../analysis/analysis.queue.js");
  const counts = await analysisQueue.getJobCounts();

  return {
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    prioritized: counts.prioritized ?? 0,
    paused: counts.paused ?? 0,
    waiting: counts.waiting ?? 0,
    "waiting-children": counts["waiting-children"] ?? 0
  };
}

const DEFAULT_DEPENDENCIES: OperationalDependencies = {
  checkDatabase: async () => {
    const { checkDatabaseConnection } = await import("../../config/database.js");
    return checkDatabaseConnection();
  },
  checkRedis: async () => {
    const { checkRedisConnection } = await import("../../config/redis.js");
    return checkRedisConnection();
  },
  getQueueCounts: getAnalysisQueueCounts,
  now: Date.now,
  uptimeSeconds: process.uptime,
  memoryUsage: process.memoryUsage,
  nodeVersion: process.version
};

export const OPERATIONAL_CHECK_TIMEOUT_MS = 2_000;

async function timedCheck(
  check: () => Promise<void>,
  timeoutMs = OPERATIONAL_CHECK_TIMEOUT_MS,
  now: () => number = Date.now
): Promise<OperationalDependencyStatus> {
  const startedAt = now();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("Operational dependency check timed out."));
        }, timeoutMs);
      })
    ]);

    return {
      status: "ready",
      latencyMs: Math.max(0, now() - startedAt)
    };
  } catch {
    return {
      status: "unavailable",
      latencyMs: null
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function timedQueueCheck(
  getCounts: () => Promise<QueueCounts>,
  timeoutMs = OPERATIONAL_CHECK_TIMEOUT_MS
): Promise<{
  status: "ready" | "unavailable";
  counts: QueueCounts | null;
}> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const counts = await Promise.race([
      getCounts(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("Operational queue check timed out."));
        }, timeoutMs);
      })
    ]);

    return {
      status: "ready",
      counts
    };
  } catch {
    return {
      status: "unavailable",
      counts: null
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}


export async function collectOperationalSnapshot(
  overrides: Partial<OperationalDependencies> = {}
): Promise<OperationalSnapshot> {
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...overrides
  };

  const [database, redis, queue] = await Promise.all([
    timedCheck(
      dependencies.checkDatabase,
      OPERATIONAL_CHECK_TIMEOUT_MS,
      dependencies.now
    ),
    timedCheck(
      dependencies.checkRedis,
      OPERATIONAL_CHECK_TIMEOUT_MS,
      dependencies.now
    ),
    timedQueueCheck(
      dependencies.getQueueCounts,
      OPERATIONAL_CHECK_TIMEOUT_MS
    )
  ]);

  const dependencyHealthy =
    database.status === "ready" && redis.status === "ready";

  return {
    success: dependencyHealthy && queue.status === "ready",
    service: "project-autopsy-api",
    status:
      dependencyHealthy && queue.status === "ready"
        ? "healthy"
        : "degraded",
    timestamp: new Date(dependencies.now()).toISOString(),
    process: {
      uptimeSeconds: Math.max(0, Math.floor(dependencies.uptimeSeconds())),
      nodeVersion: dependencies.nodeVersion,
      rssMb: Number(
        (dependencies.memoryUsage().rss / 1024 / 1024).toFixed(2)
      ),
      heapUsedMb: Number(
        (dependencies.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
      )
    },
    dependencies: {
      database,
      redis
    },
    analysisQueue: queue.counts
  };
}
