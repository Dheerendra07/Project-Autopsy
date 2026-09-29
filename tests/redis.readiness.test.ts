import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://autopsy:autopsy_dev_password@127.0.0.1:5432/project_autopsy";

test("Redis readiness succeeds for a PONG response", async () => {
  const { checkRedisConnection } = await import("../src/config/redis.js");

  await assert.doesNotReject(() =>
    checkRedisConnection(50, {
      async ping() {
        return "PONG";
      }
    })
  );
});

test("Redis readiness fails within the configured timeout", async () => {
  const { checkRedisConnection } = await import("../src/config/redis.js");

  await assert.rejects(
    () =>
      checkRedisConnection(20, {
        async ping() {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "PONG";
        }
      }),
    /Redis health check timed out/
  );
});

test("Redis readiness rejects a non-PONG response", async () => {
  const { checkRedisConnection } = await import("../src/config/redis.js");

  await assert.rejects(
    () =>
      checkRedisConnection(50, {
        async ping() {
          return "NOPE";
        }
      }),
    /Redis health check failed/
  );
});

test("Redis readiness validates the timeout argument", async () => {
  const { checkRedisConnection } = await import("../src/config/redis.js");

  await assert.rejects(
    () =>
      checkRedisConnection(0, {
        async ping() {
          return "PONG";
        }
      }),
    /timeout must be a positive integer/
  );
});
