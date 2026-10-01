import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  collectOperationalSnapshot,
  OPERATIONAL_CHECK_TIMEOUT_MS
} from "../src/modules/observability/observability.service.js";

const baseMemory = {
  rss: 10 * 1024 * 1024,
  heapTotal: 8 * 1024 * 1024,
  heapUsed: 4 * 1024 * 1024,
  external: 0,
  arrayBuffers: 0
};

const baseQueue = {
  active: 1,
  completed: 10,
  delayed: 2,
  failed: 0,
  prioritized: 0,
  paused: 0,
  waiting: 3,
  "waiting-children": 0
};

test("operational snapshot is healthy when dependencies and queue are available", async () => {
  const snapshot = await collectOperationalSnapshot({
    checkDatabase: async () => undefined,
    checkRedis: async () => undefined,
    getQueueCounts: async () => baseQueue,
    now: () => 1_760_000_000_000,
    uptimeSeconds: () => 125.9,
    memoryUsage: () => baseMemory,
    nodeVersion: "v24.0.0"
  });

  assert.equal(snapshot.success, true);
  assert.equal(snapshot.status, "healthy");
  assert.equal(snapshot.service, "project-autopsy-api");
  assert.deepEqual(snapshot.analysisQueue, baseQueue);
  assert.equal(snapshot.process.uptimeSeconds, 125);
  assert.equal(snapshot.process.rssMb, 10);
  assert.equal(snapshot.process.heapUsedMb, 4);
  assert.equal(snapshot.process.nodeVersion, "v24.0.0");
  assert.equal(snapshot.dependencies.database.status, "ready");
  assert.equal(snapshot.dependencies.redis.status, "ready");
  assert.ok(snapshot.timestamp.endsWith("Z"));
});

test("operational snapshot degrades when a dependency is unavailable", async () => {
  const snapshot = await collectOperationalSnapshot({
    checkDatabase: async () => {
      throw new Error("database unavailable");
    },
    checkRedis: async () => undefined,
    getQueueCounts: async () => baseQueue,
    memoryUsage: () => baseMemory,
    nodeVersion: "v24.0.0"
  });

  assert.equal(snapshot.success, false);
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.dependencies.database.status, "unavailable");
  assert.equal(snapshot.dependencies.redis.status, "ready");
  assert.equal(snapshot.analysisQueue?.waiting, 3);
});

test("operational snapshot degrades when queue inspection fails", async () => {
  const snapshot = await collectOperationalSnapshot({
    checkDatabase: async () => undefined,
    checkRedis: async () => undefined,
    getQueueCounts: async () => {
      throw new Error("queue unavailable");
    },
    memoryUsage: () => baseMemory,
    nodeVersion: "v24.0.0"
  });

  assert.equal(snapshot.success, false);
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.analysisQueue, null);
});

test("dependency checks time out at the bounded operational deadline", async () => {
  const started = Date.now();
  const snapshot = await collectOperationalSnapshot({
    checkDatabase: () => new Promise<void>(() => undefined),
    checkRedis: async () => undefined,
    getQueueCounts: async () => baseQueue,
    memoryUsage: () => baseMemory,
    nodeVersion: "v24.0.0"
  });

  assert.equal(snapshot.success, false);
  assert.equal(snapshot.dependencies.database.status, "unavailable");
  assert.ok(
    Date.now() - started >= OPERATIONAL_CHECK_TIMEOUT_MS - 250,
    "database check should respect the bounded timeout"
  );
});
