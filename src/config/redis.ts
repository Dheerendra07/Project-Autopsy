import { Redis } from "ioredis";
import { env } from "./env.js";

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    })
  : new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });

redis.on("error", (error) => {
  console.error("Redis error:", error);
});

export interface RedisPingClient {
  ping(): Promise<string>;
}

export const REDIS_READINESS_TIMEOUT_MS = 5_000;

export async function checkRedisConnection(
  timeoutMs = REDIS_READINESS_TIMEOUT_MS,
  client: RedisPingClient = redis
): Promise<void> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Redis health check timeout must be a positive integer.");
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("Redis health check timed out."));
        }, timeoutMs);
      })
    ]);

    if (result !== "PONG") {
      throw new Error("Redis health check failed");
    }
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
