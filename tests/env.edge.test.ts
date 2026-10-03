import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "../src/config/env.js";

const base = {
  DATABASE_URL: "postgresql://autopsy:test@localhost:5432/project_autopsy"
};

const productionKeys = {
  RUNTIME_TELEMETRY_INGEST_KEY: "r".repeat(32),
  DEPLOYMENT_EVIDENCE_INGEST_KEY: "d".repeat(32),
  AUTOPSY_API_ACCESS_KEY: "a".repeat(32)
};

test("accepts a valid production web configuration", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "web",
      ...productionKeys
    })
  );
});

test("production web configuration allows session-based user authentication without the legacy API key", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "web",
      RUNTIME_TELEMETRY_INGEST_KEY: productionKeys.RUNTIME_TELEMETRY_INGEST_KEY,
      DEPLOYMENT_EVIDENCE_INGEST_KEY: productionKeys.DEPLOYMENT_EVIDENCE_INGEST_KEY
    })
  );
});

test("production web configuration allows runtime and deployment ingestion keys to remain unset", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "web",
      AUTOPSY_API_ACCESS_KEY: productionKeys.AUTOPSY_API_ACCESS_KEY
    })
  );
});

test("production worker mode does not inherit web-only ingestion requirements", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "worker"
    })
  );
});

test("AI in production keeps the provider credential server-side", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "web",
      ...productionKeys,
      AI_API_KEY: "provider-key"
    })
  );
});

test("rejects unsupported runtime service roles", () => {
  assert.throws(() =>
    parseEnvironment({
      ...base,
      AUTOPSY_SERVICE_ROLE: "cron"
    })
  );
});

test("rejects invalid ports", () => {
  for (const PORT of ["0", "65536", "1.5", "not-a-port"]) {
    assert.throws(() =>
      parseEnvironment({
        ...base,
        PORT
      })
    );
  }

  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      PORT: "1"
    })
  );

  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      PORT: "65535"
    })
  );
});

test("accepts redis and rediss URLs and rejects other schemes", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      REDIS_URL: "redis://localhost:6379"
    })
  );

  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      REDIS_URL: "rediss://example.com:6379"
    })
  );

  for (const REDIS_URL of [
    "http://localhost:6379",
    "postgresql://localhost:5432/db",
    "not-a-url"
  ]) {
    assert.throws(() =>
      parseEnvironment({
        ...base,
        REDIS_URL
      })
    );
  }
});

test("accepts finite positive repository and analysis limits within bounds", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      MAX_REPOSITORY_SIZE_MB: "0.1",
      MAX_ANALYSIS_TIME_MINUTES: "0.01"
    })
  );

  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      MAX_ANALYSIS_TIME_MINUTES: "1440"
    })
  );
});

test("rejects non-finite or non-positive analysis limits", () => {
  for (const value of ["0", "-1", "Infinity", "NaN", "not-a-number"]) {
    assert.throws(() =>
      parseEnvironment({
        ...base,
        MAX_ANALYSIS_TIME_MINUTES: value
      })
    );
  }
});

test("rejects analysis time beyond one day", () => {
  assert.throws(() =>
    parseEnvironment({
      ...base,
      MAX_ANALYSIS_TIME_MINUTES: "1440.1"
    })
  );
});

test("enforces timeout boundaries", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      AI_TIMEOUT_MS: "1000"
    })
  );

  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      AI_TIMEOUT_MS: "120000"
    })
  );

  for (const value of ["999", "120001", "1.5", "Infinity"]) {
    assert.throws(() =>
      parseEnvironment({
        ...base,
        AI_TIMEOUT_MS: value
      })
    );
  }
});

test("enforces interpretation cache TTL boundaries", () => {
  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      AI_INTERPRETATION_CACHE_TTL_SECONDS: "60"
    })
  );

  assert.doesNotThrow(() =>
    parseEnvironment({
      ...base,
      AI_INTERPRETATION_CACHE_TTL_SECONDS: "604800"
    })
  );

  for (const value of ["59", "604801", "1.5"]) {
    assert.throws(() =>
      parseEnvironment({
        ...base,
        AI_INTERPRETATION_CACHE_TTL_SECONDS: value
      })
    );
  }
});

test("evidence retention is bounded to the documented 365-day maximum", () => {
  assert.equal(
    parseEnvironment({
      ...base,
      EVIDENCE_RETENTION_DAYS: "30"
    }).EVIDENCE_RETENTION_DAYS,
    30
  );

  assert.equal(
    parseEnvironment({
      ...base,
      EVIDENCE_RETENTION_DAYS: "365"
    }).EVIDENCE_RETENTION_DAYS,
    365
  );

  for (const value of ["29", "366", "30.5", "Infinity", "NaN"]) {
    assert.throws(
      () =>
        parseEnvironment({
          ...base,
          EVIDENCE_RETENTION_DAYS: value
        }),
      /EVIDENCE_RETENTION_DAYS/
    );
  }
});

test("requires database configuration", () => {
  assert.throws(() =>
    parseEnvironment({})
  );
});

test("requires credentials to meet the minimum length", () => {
  assert.throws(() =>
    parseEnvironment({
      ...base,
      NODE_ENV: "production",
      AUTOPSY_SERVICE_ROLE: "web",
      RUNTIME_TELEMETRY_INGEST_KEY: "r".repeat(31),
      DEPLOYMENT_EVIDENCE_INGEST_KEY: "d".repeat(32),
      AUTOPSY_API_ACCESS_KEY: "a".repeat(32)
    })
  );
});

test("normalizes and trims configured CORS origins", () => {
  const parsed = parseEnvironment({
    ...base,
    AUTOPSY_CORS_ORIGINS: "  https://example.com  "
  });

  assert.equal(parsed.AUTOPSY_CORS_ORIGINS, "https://example.com");
});

test("defaults AI model and provider URL while retaining explicit values", () => {
  const defaults = parseEnvironment(base);
  assert.equal(defaults.AI_BASE_URL, "https://generativelanguage.googleapis.com/v1beta");
  assert.equal(defaults.AI_MODEL, "gemini-2.5-flash");

  const explicit = parseEnvironment({
    ...base,
    AI_BASE_URL: "https://example.com/v1",
    AI_MODEL: "custom-model"
  });

  assert.equal(explicit.AI_BASE_URL, "https://example.com/v1");
  assert.equal(explicit.AI_MODEL, "custom-model");
});


test("MAX_ANALYZED_COMMITS is bounded and integer-valued", () => {
  assert.equal(
    parseEnvironment({
      DATABASE_URL: "postgresql://localhost/autopsy",
      MAX_ANALYZED_COMMITS: "1"
    }).MAX_ANALYZED_COMMITS,
    1
  );

  assert.equal(
    parseEnvironment({
      DATABASE_URL: "postgresql://localhost/autopsy",
      MAX_ANALYZED_COMMITS: "100000"
    }).MAX_ANALYZED_COMMITS,
    100_000
  );

  for (const value of ["0", "-1", "1.5", "100001"]) {
    assert.throws(
      () =>
        parseEnvironment({
          DATABASE_URL: "postgresql://localhost/autopsy",
          MAX_ANALYZED_COMMITS: value
        }),
      /MAX_ANALYZED_COMMITS/
    );
  }
});


test("API rate-limit configuration remains bounded", async () => {
  const { envSchema } = await import("../src/config/env.js");
  const base = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://localhost/project_autopsy"
  };

  assert.equal(
    envSchema.parse(base).API_RATE_LIMIT_WINDOW_SECONDS,
    60
  );
  assert.equal(
    envSchema.parse(base).API_RATE_LIMIT_MAX_REQUESTS,
    120
  );
  assert.equal(
    envSchema.parse(base).API_RATE_LIMIT_HEAVY_MAX_REQUESTS,
    12
  );

  for (const [key, value] of [
    ["API_RATE_LIMIT_WINDOW_SECONDS", "9"],
    ["API_RATE_LIMIT_WINDOW_SECONDS", "3601"],
    ["API_RATE_LIMIT_MAX_REQUESTS", "9"],
    ["API_RATE_LIMIT_MAX_REQUESTS", "10001"],
    ["API_RATE_LIMIT_HEAVY_MAX_REQUESTS", "0"],
    ["API_RATE_LIMIT_HEAVY_MAX_REQUESTS", "1001"]
  ] as const) {
    assert.throws(
      () => envSchema.parse({ ...base, [key]: value })
    );
  }
});
