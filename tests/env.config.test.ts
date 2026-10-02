import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "../src/config/env.js";

function baseEnvironment(
  overrides: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://autopsy:test@localhost:5432/project_autopsy",
    REDIS_HOST: "localhost",
    REDIS_PORT: "6379",
    ...overrides
  };
}

test("rejects non-Redis connection string schemes", () => {
  assert.throws(
    () =>
      parseEnvironment(
        baseEnvironment({
          REDIS_URL: "https://example.internal:6379"
        })
      ),
    /REDIS_URL/
  );
});

test("accepts an optional Redis connection string", () => {
  const config = parseEnvironment(
    baseEnvironment({
      REDIS_URL: "redis://example.internal:6379"
    })
  );

  assert.equal(config.REDIS_URL, "redis://example.internal:6379");
});

test("uses documented defaults for AI provider configuration", () => {
  const config = parseEnvironment(baseEnvironment());

  assert.equal(config.AI_BASE_URL, "https://api.openai.com/v1");
  assert.equal(config.AI_MODEL, "gpt-5.6-luna");
  assert.equal(config.AI_TIMEOUT_MS, 30_000);
});

test("worker production role does not require web ingestion, API, or AI access secrets", () => {
  const config = parseEnvironment(
    baseEnvironment({
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "worker"
    })
  );

  assert.equal(config.AUTOPSY_SERVICE_ROLE, "worker");
});

test("production web configuration allows optional ingestion credentials", () => {
  const config = parseEnvironment(
    baseEnvironment({
      NODE_ENV: "production",
      AUTOPSY_API_ACCESS_KEY: "a".repeat(32)
    })
  );

  assert.equal(config.RUNTIME_TELEMETRY_INGEST_KEY, undefined);
  assert.equal(config.DEPLOYMENT_EVIDENCE_INGEST_KEY, undefined);
});

test("production web configuration no longer requires the legacy API access key", () => {
  assert.doesNotThrow(() =>
    parseEnvironment(
      baseEnvironment({
        NODE_ENV: "production",
        RUNTIME_TELEMETRY_INGEST_KEY: "r".repeat(32),
        DEPLOYMENT_EVIDENCE_INGEST_KEY: "d".repeat(32)
      })
    )
  );
});

test("accepts the required production access credentials", () => {
  const config = parseEnvironment(
    baseEnvironment({
      NODE_ENV: "production",
      RUNTIME_TELEMETRY_INGEST_KEY: "r".repeat(32),
      DEPLOYMENT_EVIDENCE_INGEST_KEY: "d".repeat(32),
      AUTOPSY_API_ACCESS_KEY: "a".repeat(32)
    })
  );

  assert.equal(config.NODE_ENV, "production");
});

test("production AI configuration uses the server-side provider credential", () => {
  assert.doesNotThrow(() =>
    parseEnvironment(
      baseEnvironment({
        NODE_ENV: "production",
        RUNTIME_TELEMETRY_INGEST_KEY: "r".repeat(32),
        DEPLOYMENT_EVIDENCE_INGEST_KEY: "d".repeat(32),
        AI_API_KEY: "test-ai-key"
      })
    )
  );
});

test("validates the documented AI timeout bounds", () => {
  assert.throws(
    () =>
      parseEnvironment(
        baseEnvironment({
          AI_TIMEOUT_MS: "999"
        })
      ),
    /AI_TIMEOUT_MS/
  );
  assert.throws(
    () =>
      parseEnvironment(
        baseEnvironment({
          AI_TIMEOUT_MS: "120001"
        })
      ),
    /AI_TIMEOUT_MS/
  );
});

test("rejects non-finite resource limits", () => {
  assert.throws(
    () =>
      parseEnvironment(
        baseEnvironment({
          MAX_REPOSITORY_SIZE_MB: "Infinity"
        })
      ),
    /MAX_REPOSITORY_SIZE_MB/
  );

  assert.throws(
    () =>
      parseEnvironment(
        baseEnvironment({
          MAX_ANALYSIS_TIME_MINUTES: "Infinity"
        })
      ),
    /MAX_ANALYSIS_TIME_MINUTES/
  );
});

test("rejects an analysis timeout larger than the supported deadline range", () => {
  assert.throws(
    () =>
      parseEnvironment(
        baseEnvironment({
          MAX_ANALYSIS_TIME_MINUTES: "1441"
        })
      ),
    /MAX_ANALYSIS_TIME_MINUTES/
  );
});
