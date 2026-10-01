import { analysisQueue } from "../analysis/analysis.queue.js";
import { checkDatabaseConnection } from "../../config/database.js";
import { checkRedisConnection } from "../../config/redis.js";

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

const DEFAULT_DEPENDENCIES: OperationalDependencies = {
  checkDatabase: checkDatabaseConnection,
  checkRedis: checkRedisConnection,
  getQueueCounts: () => analysisQueue.getJobCounts(),
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
    dependencies
      .getQueueCounts()
      .then((counts) => ({ status: "ready" as const, counts }))
      .catch(() => ({ status: "unavailable" as const, counts: null }))
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
