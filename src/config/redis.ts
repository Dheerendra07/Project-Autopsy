import { Redis } from "ioredis";
import { env } from "./env.js";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

redis.on("error", (error) => {
  console.error("Redis error:", error);
});

export async function checkRedisConnection(): Promise<void> {
  const result = await redis.ping();

  if (result !== "PONG") {
    throw new Error("Redis health check failed");
  }
}
