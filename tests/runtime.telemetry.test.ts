import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import {
  RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS,
  RUNTIME_TELEMETRY_MAX_PAST_AGE_MS,
  RuntimeTelemetryValidationError,
  hashRuntimeTelemetryEvent,
  parseRuntimeTelemetryDateRange,
  prepareRuntimeTelemetryBatch
} from "../src/modules/runtime/runtime.service.js";
import { runtimeTelemetryBatchSchema } from "../src/modules/runtime/runtime.types.js";
import { isRuntimeTelemetryAuthorized } from "../src/modules/runtime/runtime.auth.js";

const NOW = new Date("2026-09-29T00:00:00.000Z");

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-001",
    observedAt: NOW.toISOString(),
    signalType: "http",
    serviceName: "api",
    operationName: "GET /health",
    environment: "test",
    revisionSha: "abcdef1234567890abcdef1234567890abcdef12",
    durationMs: 42.5,
    status: "ok",
    httpStatusCode: 200,
    attributes: {
      route: "/health",
      method: "GET"
    },
    ...overrides
  };
}

test("hash is deterministic across object-key ordering", () => {
  const first = runtimeTelemetryBatchSchema.parse({
    events: [validEvent()]
  }).events[0];

  const second = runtimeTelemetryBatchSchema.parse({
    events: [
      validEvent({
        attributes: {
          method: "GET",
          route: "/health"
        }
      })
    ]
  }).events[0];

  assert.equal(
    hashRuntimeTelemetryEvent(first),
    hashRuntimeTelemetryEvent(second)
  );
});

test("enforces OpenTelemetry trace and span identifier lengths", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        validEvent({
          traceId: "a".repeat(31)
        })
      ]
    })
  );

  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        validEvent({
          traceId: "a".repeat(33)
        })
      ]
    })
  );

  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        validEvent({
          spanId: "a".repeat(15)
        })
      ]
    })
  );

  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        validEvent({
          spanId: "a".repeat(17)
        })
      ]
    })
  );
});

test("rejects a telemetry batch above the 500-event limit", () => {
  const events = Array.from({ length: 501 }, (_, index) =>
    validEvent({
      eventId: `evt-${index + 1}`
    })
  );

  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events
    })
  );
});

test("runtime router module loads without refined-schema runtime errors", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const { runtimeRouter } = await import(
    "../src/modules/runtime/runtime.routes.js"
  );

  assert.ok(runtimeRouter);
  assert.ok(runtimeRouter.stack.length > 0);
});

test("preparation normalizes timestamps and computes hashes", () => {
  const [event] = prepareRuntimeTelemetryBatch(
    { events: [validEvent()] },
    NOW
  );

  assert.ok(event);
  assert.equal(event.observedAtIso, NOW.toISOString());
  assert.match(event.payloadHash, /^[0-9a-f]{64}$/);
});

test("duplicate event ids inside one batch are rejected", () => {
  assert.throws(
    () =>
      prepareRuntimeTelemetryBatch(
        {
          events: [
            validEvent(),
            validEvent({ eventId: "evt-001" })
          ]
        },
        NOW
      ),
    (error) =>
      error instanceof RuntimeTelemetryValidationError &&
      error.field === "events"
  );
});

test("timestamps beyond the future skew are rejected", () => {
  const observedAt = new Date(
    NOW.getTime() + RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS + 1
  );

  assert.throws(
    () =>
      prepareRuntimeTelemetryBatch(
        {
          events: [
            validEvent({
              observedAt: observedAt.toISOString()
            })
          ]
        },
        NOW
      ),
    (error) =>
      error instanceof RuntimeTelemetryValidationError &&
      error.field === "observedAt"
  );
});

test("timestamps older than the retention boundary are rejected", () => {
  const observedAt = new Date(
    NOW.getTime() - RUNTIME_TELEMETRY_MAX_PAST_AGE_MS - 1
  );

  assert.throws(
    () =>
      prepareRuntimeTelemetryBatch(
        {
          events: [
            validEvent({
              observedAt: observedAt.toISOString()
            })
          ]
        },
        NOW
      ),
    (error) =>
      error instanceof RuntimeTelemetryValidationError &&
      error.field === "observedAt"
  );
});

test("HTTP telemetry requires a response status", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [validEvent({ httpStatusCode: undefined })]
    })
  );
});

test("5xx HTTP telemetry cannot claim ok", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        validEvent({
          httpStatusCode: 503,
          status: "ok"
        })
      ]
    })
  );
});

test("negative or non-finite duration is rejected", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [validEvent({ durationMs: -1 })]
    })
  );

  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [validEvent({ durationMs: Number.NaN })]
    })
  );
});

test("attributes are bounded", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        validEvent({
          attributes: {
            payload: "x".repeat(9_000)
          }
        })
      ]
    })
  );
});

test("invalid date ranges are rejected", () => {
  assert.throws(
    () =>
      parseRuntimeTelemetryDateRange(
        new Date("2026-09-29T01:00:00.000Z"),
        new Date("2026-09-29T01:00:00.000Z")
      ),
    (error) => error instanceof z.ZodError
  );
});

test("configured telemetry key accepts an exact bearer token", () => {
  assert.equal(
    isRuntimeTelemetryAuthorized(
      "Bearer test-telemetry-key",
      undefined,
      "test-telemetry-key"
    ),
    true
  );
});

test("wrong telemetry key is rejected", () => {
  assert.equal(
    isRuntimeTelemetryAuthorized(
      "Bearer wrong-key",
      undefined,
      "test-telemetry-key"
    ),
    false
  );
});

test("header telemetry key takes precedence over bearer fallback", () => {
  assert.equal(
    isRuntimeTelemetryAuthorized(
      "Bearer wrong-key",
      "test-telemetry-key",
      "test-telemetry-key"
    ),
    true
  );
});
