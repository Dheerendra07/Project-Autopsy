import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  consumeRateLimit,
  createRateLimitMiddleware,
  resolveRateLimitCategory
} from "../src/middleware/rate-limit.middleware.js";

class MemoryRedis {
  counts = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }
}

function request(path: string, method = "GET", ip = "203.0.113.10"): Request {
  return {
    path,
    method,
    ip,
    socket: { remoteAddress: ip }
  } as Request;
}

test("rate-limit policy places expensive operations in the heavy bucket", () => {
  assert.equal(
    resolveRateLimitCategory(
      request("/repositories/11111111-1111-4111-8111-111111111111/report", "GET")
    ),
    "heavy"
  );
  assert.equal(
    resolveRateLimitCategory(
      request("/repositories/11111111-1111-4111-8111-111111111111/interpretation", "GET")
    ),
    "heavy"
  );
  assert.equal(
    resolveRateLimitCategory(
      request("/repositories/11111111-1111-4111-8111-111111111111/commits", "GET")
    ),
    "api"
  );
  assert.equal(
    resolveRateLimitCategory(
      request("/repositories/import", "POST")
    ),
    "heavy"
  );
});

test("authentication endpoints use the dedicated per-IP auth bucket", () => {
  assert.equal(
    resolveRateLimitCategory(request("/auth/login", "POST")),
    "auth"
  );
  assert.equal(
    resolveRateLimitCategory(request("/auth/register", "POST")),
    "auth"
  );
  assert.equal(
    getRateLimitLimit(request("/auth/login", "POST")),
    20
  );
});

test("consumeRateLimit uses the configured heavy limit", async () => {
  const redis = new MemoryRedis();
  const result = await consumeRateLimit(
    request("/repositories/11111111-1111-4111-8111-111111111111/report", "GET"),
    redis,
    {
      nowMs: 1_000,
      windowSeconds: 60,
      maxRequests: 120,
      heavyMaxRequests: 3
    }
  );

  assert.equal(result.limit, 3);
  assert.equal(result.count, 1);
});

test("rate-limit middleware emits headers and blocks after the configured limit", async () => {
  const redis = new MemoryRedis();
  const middleware = createRateLimitMiddleware(redis, {
    windowSeconds: 60,
    maxRequests: 2,
    heavyMaxRequests: 1
  });

  function response(): Response & { statusCode: number; body?: unknown; headers: Map<string,string> } {
    const headers = new Map<string,string>();
    const out = {
      statusCode: 200,
      body: undefined as unknown,
      headers,
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
      status(code: number) {
        out.statusCode = code;
        return out;
      },
      json(body: unknown) {
        out.body = body;
        return out;
      }
    };
    return out as unknown as Response & {
      statusCode: number;
      body?: unknown;
      headers: Map<string,string>;
    };
  }

  const first = response();
  let firstNext = false;
  await new Promise<void>((resolve, reject) => {
    middleware(request("/repositories/11111111-1111-4111-8111-111111111111/commits"), first, () => {
      firstNext = true;
      resolve();
    });
    setTimeout(() => reject(new Error("middleware did not call next")), 1_000);
  });
  assert.equal(firstNext, true);
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers.get("x-ratelimit-limit"), "2");
  assert.equal(first.headers.get("x-ratelimit-remaining"), "1");

  const second = response();
  await new Promise<void>((resolve, reject) => {
    middleware(request("/repositories/11111111-1111-4111-8111-111111111111/commits"), second, () => resolve());
    setTimeout(() => reject(new Error("middleware did not call next")), 1_000);
  });
  assert.equal(second.headers.get("x-ratelimit-remaining"), "0");

  const third = response();
  await new Promise<void>((resolve, reject) => {
    middleware(request("/repositories/11111111-1111-4111-8111-111111111111/commits"), third, () => {
      reject(new Error("request should have been rate limited"));
    });
    setTimeout(resolve, 50);
  });
  assert.equal(third.statusCode, 429);
  assert.deepEqual(third.body, {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please retry after the current rate-limit window."
    }
  });
  assert.notEqual(third.headers.get("retry-after"), undefined);
});

test("rate-limit failures fail open", async () => {
  const middleware = createRateLimitMiddleware({
    async incr() { throw new Error("redis unavailable"); },
    async expire() { return 1; }
  });

  let nextCalled = false;
  const req = request("/repositories/11111111-1111-4111-8111-111111111111/commits");
  const res = {
    setHeader() { return this; },
    status() { return this; },
    json() { return this; }
  } as unknown as Response;

  await new Promise<void>((resolve, reject) => {
    middleware(req, res, () => {
      nextCalled = true;
      resolve();
    });
    setTimeout(() => reject(new Error("middleware did not fail open")), 1_000);
  });
  assert.equal(nextCalled, true);
});
