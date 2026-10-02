import type { NextFunction, Request, Response } from "express";
export const API_RATE_LIMIT_WINDOW_SECONDS = 60;
export const API_RATE_LIMIT_MAX_REQUESTS = 120;
export const API_RATE_LIMIT_HEAVY_MAX_REQUESTS = 12;

type RateLimitCategory = "api" | "heavy" | "auth";

export interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
  heavyMaxRequests: number;
  authMaxRequests?: number;
}

interface RateLimitResult {
  count: number;
  limit: number;
  resetAt: number;
}

export interface RateLimitRedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export function resolveRateLimitCategory(req: Request): RateLimitCategory {
  const path = req.path;

  if (
    req.method === "POST" &&
    (path === "/auth/login" || path === "/auth/register" || path === "/auth/migrate-legacy" ||
      path === "/auth/password" ||
      path === "/auth/resend-verification" ||
      path === "/auth/verify-email" ||
      path === "/auth/forgot-password" ||
      path === "/auth/reset-password")
  ) {
    return "auth";
  }

  if (
    (req.method === "POST" &&
      (
        path === "/repositories/import" ||
        /^\/repositories\/[0-9a-f-]+\/analyze$/i.test(path)
      )) ||
    (req.method === "GET" &&
      (
        /^\/repositories\/[0-9a-f-]+\/report$/i.test(path) ||
        /^\/repositories\/[0-9a-f-]+\/interpretation$/i.test(path)
      ))
  ) {
    return "heavy";
  }

  if (
    req.method === "POST" &&
    (
      /^\/repositories\/[0-9a-f-]+\/runtime\/telemetry$/i.test(path) ||
      /^\/repositories\/[0-9a-f-]+\/deployments$/i.test(path)
    )
  ) {
    return "heavy";
  }

  return "api";
}

export function getRateLimitLimit(
  req: Request,
  config: RateLimitConfig = {
    windowSeconds: API_RATE_LIMIT_WINDOW_SECONDS,
    maxRequests: API_RATE_LIMIT_MAX_REQUESTS,
    heavyMaxRequests: API_RATE_LIMIT_HEAVY_MAX_REQUESTS
  }
): number {
  switch (resolveRateLimitCategory(req)) {
    case "heavy":
      return config.heavyMaxRequests;
    case "auth":
      return config.authMaxRequests ?? 20;
    default:
      return config.maxRequests;
  }
}

function getClientKey(req: Request, category: RateLimitCategory): string {
  const ip = req.ip?.trim() || req.socket.remoteAddress?.trim() || "unknown";
  return `autopsy:rate-limit:${category}:${ip}`;
}

export async function consumeRateLimit(
  req: Request,
  redis: RateLimitRedisClient,
  options: {
    nowMs?: number;
    windowSeconds?: number;
    maxRequests?: number;
    heavyMaxRequests?: number;
    authMaxRequests?: number;
  } = {}
): Promise<RateLimitResult> {
  const nowMs = options.nowMs ?? Date.now();
  const windowSeconds = options.windowSeconds ?? API_RATE_LIMIT_WINDOW_SECONDS;
  const limit = getRateLimitLimit(req, {
    windowSeconds,
    maxRequests:
      options.maxRequests ?? API_RATE_LIMIT_MAX_REQUESTS,
    heavyMaxRequests:
      options.heavyMaxRequests ?? API_RATE_LIMIT_HEAVY_MAX_REQUESTS,
    authMaxRequests: options.authMaxRequests ?? 20
  });

  const windowId = Math.floor(nowMs / (windowSeconds * 1_000));
  const resetAt = (windowId + 1) * windowSeconds * 1_000;
  const key = getClientKey(req, resolveRateLimitCategory(req)) + ":" + windowId;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds + 5);
  }

  return { count, limit, resetAt };
}

export function createRateLimitMiddleware(
  redis: RateLimitRedisClient,
  config: RateLimitConfig = {
    windowSeconds: API_RATE_LIMIT_WINDOW_SECONDS,
    maxRequests: API_RATE_LIMIT_MAX_REQUESTS,
    heavyMaxRequests: API_RATE_LIMIT_HEAVY_MAX_REQUESTS
  }
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void consumeRateLimit(req, redis, {
      windowSeconds: config.windowSeconds,
      maxRequests: config.maxRequests,
      heavyMaxRequests: config.heavyMaxRequests
    })
      .then(({ count, limit, resetAt }) => {
        const remaining = Math.max(0, limit - count);
        res.setHeader("X-RateLimit-Limit", String(limit));
        res.setHeader("X-RateLimit-Remaining", String(remaining));
        res.setHeader(
          "X-RateLimit-Reset",
          String(Math.ceil(resetAt / 1_000))
        );

        if (count > limit) {
          const retryAfter = Math.max(
            1,
            Math.ceil((resetAt - Date.now()) / 1_000)
          );
          res.setHeader("Retry-After", String(retryAfter));
          res.status(429).json({
            success: false,
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many requests. Please retry after the current rate-limit window."
            }
          });
          return;
        }

        next();
      })
      .catch((error) => {
        console.error("API rate limiter failed open:", error);
        next();
      });
  };
}
