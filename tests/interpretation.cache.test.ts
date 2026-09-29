import assert from "node:assert/strict";
import test from "node:test";

import type { InterpretationResult } from "../src/modules/interpretation/interpretation.types.js";
import {
  buildAiInterpretationCacheKey,
  RedisAiInterpretationCache,
  type AiInterpretationRedisClient
} from "../src/modules/interpretation/interpretation.cache.js";

const value: InterpretationResult = {
  interpretationVersion: "1.0",
  provider: "openai",
  model: "gpt-5.6-luna",
  reportFingerprint: "f".repeat(64),
  groundingClaimCount: 3,
  generatedAt: "2026-09-29T00:00:00.000Z",
  cacheHit: false,
  interpretation: {
    executiveSummary: "Grounded summary.",
    themes: [
      {
        id: "theme-1",
        title: "History",
        analysis: "Historical evidence is available.",
        evidenceKeys: ["development-history/commit-1"]
      }
    ],
    investigationQuestions: [
      {
        question: "Which operational context should be verified?",
        evidenceKeys: ["development-history/commit-1"]
      }
    ],
    uncertainties: ["Causality is not established."]
  }
};

test("builds deterministic cache keys from report fingerprint and model", () => {
  const first = buildAiInterpretationCacheKey(value.reportFingerprint, value.model);
  const second = buildAiInterpretationCacheKey(value.reportFingerprint, value.model);
  const otherModel = buildAiInterpretationCacheKey(value.reportFingerprint, "other-model");
  const otherReport = buildAiInterpretationCacheKey("e".repeat(64), value.model);

  assert.equal(first, second);
  assert.notEqual(first, otherModel);
  assert.notEqual(first, otherReport);
  assert.match(first, /^project-autopsy:ai-interpretation:v1:[0-9a-f]{64}$/);
});

test("returns validated cache entries and resets internal cacheHit marker", async () => {
  let stored: string | null = JSON.stringify(value);
  const client: AiInterpretationRedisClient = {
    async get() {
      return stored;
    },
    async set() {
      return "OK";
    }
  };

  const cache = new RedisAiInterpretationCache(client, 60);
  const result = await cache.get("cache-key");

  assert.deepEqual(result, value);
  assert.equal(result?.cacheHit, false);
});

test("treats malformed cache JSON as a miss", async () => {
  const client: AiInterpretationRedisClient = {
    async get() {
      return "{broken";
    },
    async set() {
      return "OK";
    }
  };

  const cache = new RedisAiInterpretationCache(client, 60);
  assert.equal(await cache.get("cache-key"), null);
});

test("treats a cache entry with invalid nested interpretation data as a miss", async () => {
  const client: AiInterpretationRedisClient = {
    async get() {
      return JSON.stringify({
        ...value,
        interpretation: {
          executiveSummary: "",
          themes: [],
          investigationQuestions: [],
          uncertainties: []
        }
      });
    },
    async set() {
      return "OK";
    }
  };

  const cache = new RedisAiInterpretationCache(client, 60);
  assert.equal(await cache.get("cache-key"), null);
});

test("swallows Redis cache failures", async () => {
  const client: AiInterpretationRedisClient = {
    async get() {
      throw new Error("redis unavailable");
    },
    async set() {
      throw new Error("redis unavailable");
    }
  };

  const cache = new RedisAiInterpretationCache(client, 60);

  assert.equal(await cache.get("cache-key"), null);
  await assert.doesNotReject(() => cache.set("cache-key", value));
});

test("writes cache entries with an expiration", async () => {
  let captured: { key: string; value: string; mode: string; ttl: number } | null = null;

  const client: AiInterpretationRedisClient = {
    async get() {
      return null;
    },
    async set(key, serialized, mode, ttl) {
      captured = { key, value: serialized, mode, ttl };
      return "OK";
    }
  };

  const cache = new RedisAiInterpretationCache(client, 900);
  await cache.set("cache-key", value);

  assert.deepEqual(captured, {
    key: "cache-key",
    value: JSON.stringify(value),
    mode: "EX",
    ttl: 900
  });
});
