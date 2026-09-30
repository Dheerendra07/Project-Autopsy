import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS,
  RUNTIME_TELEMETRY_MAX_PAST_AGE_MS,
  RuntimeTelemetryValidationError,
  prepareRuntimeTelemetryBatch,
  hashRuntimeTelemetryEvent
} from "../src/modules/runtime/runtime.service.js";
import { runtimeTelemetryBatchSchema } from "../src/modules/runtime/runtime.types.js";

const NOW = new Date("2026-09-30T00:00:00.000Z");
const SHA40 = "a".repeat(40);
const SHA64 = "b".repeat(64);

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-edge-001",
    observedAt: NOW.toISOString(),
    signalType: "http",
    serviceName: "api",
    operationName: "GET /items",
    environment: "production",
    revisionSha: SHA40,
    durationMs: 10,
    status: "ok",
    httpStatusCode: 200,
    attributes: {},
    ...overrides
  };
}

test("accepts the minimum valid event", () => {
  assert.equal(
    runtimeTelemetryBatchSchema.safeParse({
      events: [event()]
    }).success,
    true
  );
});

test("accepts duration at both numeric boundaries", () => {
  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-duration-zero",
          durationMs: 0
        }),
        event({
          eventId: "evt-duration-max",
          durationMs: 86_400_000
        })
      ]
    })
  );
});

test("rejects duration above the 24-hour ceiling", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [event({ durationMs: 86_400_000.0001 })]
    })
  );
});

test("accepts revision SHA lengths of 40 and 64 characters", () => {
  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({ eventId: "evt-sha40", revisionSha: SHA40 }),
        event({ eventId: "evt-sha64", revisionSha: SHA64 })
      ]
    })
  );
});

test("rejects malformed revision lengths and non-hex characters", () => {
  for (const value of [
    "a".repeat(39),
    "a".repeat(41),
    "g".repeat(40),
    "a".repeat(63),
    "a".repeat(65)
  ]) {
    assert.throws(() =>
      runtimeTelemetryBatchSchema.parse({
        events: [event({ revisionSha: value })]
      })
    );
  }
});

test("accepts exact trace and span identifier lengths", () => {
  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          traceId: "1".repeat(32),
          spanId: "2".repeat(16)
        })
      ]
    })
  );
});

test("rejects trace and span identifiers with uppercase non-hex content", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [event({ traceId: "Z".repeat(32) })]
    })
  );
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [event({ spanId: "Z".repeat(16) })]
    })
  );
});

test("accepts HTTP 4xx as an error status", () => {
  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-http-404",
          httpStatusCode: 404,
          status: "error"
        })
      ]
    })
  );
});

test("rejects HTTP 5xx with an ok status but allows error status", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-http-503-ok",
          httpStatusCode: 503,
          status: "ok"
        })
      ]
    })
  );

  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-http-503-error",
          httpStatusCode: 503,
          status: "error"
        })
      ]
    })
  );
});

test("non-HTTP error telemetry requires an error type", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-job-error",
          signalType: "job",
          httpStatusCode: undefined,
          status: "error"
        })
      ]
    })
  );

  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-job-error-described",
          signalType: "job",
          httpStatusCode: undefined,
          status: "error",
          errorType: "TimeoutError"
        })
      ]
    })
  );
});

test("unset status is allowed for HTTP telemetry with a response code", () => {
  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt-http-unset",
          status: "unset"
        })
      ]
    })
  );
});

test("rejects empty bounded labels when supplied", () => {
  for (const key of [
    "eventId",
    "serviceName",
    "operationName",
    "environment",
    "deploymentId"
  ]) {
    assert.throws(() =>
      runtimeTelemetryBatchSchema.parse({
        events: [event({ [key]: "" })]
      })
    );
  }
});

test("rejects labels over their documented limits", () => {
  const cases: Array<[string, number]> = [
    ["eventId", 129],
    ["serviceName", 129],
    ["operationName", 257],
    ["environment", 65],
    ["deploymentId", 257],
    ["errorType", 257]
  ];

  for (const [key, length] of cases) {
    assert.throws(() =>
      runtimeTelemetryBatchSchema.parse({
        events: [event({ [key]: "x".repeat(length) })]
      })
    );
  }
});

test("eventId allows the documented safe punctuation and rejects whitespace", () => {
  assert.doesNotThrow(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [
        event({
          eventId: "evt.edge:2026-09-30_test.v1"
        })
      ]
    })
  );

  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: [event({ eventId: "evt edge" })]
    })
  );
});

test("prepared telemetry accepts the exact future skew boundary", () => {
  const observedAt = new Date(
    NOW.getTime() + RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS
  );

  assert.doesNotThrow(() =>
    prepareRuntimeTelemetryBatch(
      { events: [event({ observedAt: observedAt.toISOString() })] },
      NOW
    )
  );
});

test("prepared telemetry rejects one millisecond beyond the future boundary", () => {
  const observedAt = new Date(
    NOW.getTime() + RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS + 1
  );

  assert.throws(
    () =>
      prepareRuntimeTelemetryBatch(
        { events: [event({ observedAt: observedAt.toISOString() })] },
        NOW
      ),
    (error) =>
      error instanceof RuntimeTelemetryValidationError &&
      error.field === "observedAt"
  );
});

test("prepared telemetry accepts the exact retention-age boundary", () => {
  const observedAt = new Date(
    NOW.getTime() - RUNTIME_TELEMETRY_MAX_PAST_AGE_MS
  );

  assert.doesNotThrow(() =>
    prepareRuntimeTelemetryBatch(
      { events: [event({ observedAt: observedAt.toISOString() })] },
      NOW
    )
  );
});

test("prepared telemetry rejects one millisecond beyond retention age", () => {
  const observedAt = new Date(
    NOW.getTime() - RUNTIME_TELEMETRY_MAX_PAST_AGE_MS - 1
  );

  assert.throws(
    () =>
      prepareRuntimeTelemetryBatch(
        { events: [event({ observedAt: observedAt.toISOString() })] },
        NOW
      ),
    (error) =>
      error instanceof RuntimeTelemetryValidationError &&
      error.field === "observedAt"
  );
});

test("rejects an invalid validation clock", () => {
  assert.throws(
    () => prepareRuntimeTelemetryBatch({ events: [event()] }, new Date("invalid")),
    /validation clock is invalid/i
  );
});

test("nested attribute key ordering does not change the event hash", () => {
  const first = runtimeTelemetryBatchSchema.parse({
    events: [
      event({
        attributes: {
          nested: { z: 1, a: 2 },
          list: [{ y: 2, x: 1 }]
        }
      })
    ]
  }).events[0];

  const second = runtimeTelemetryBatchSchema.parse({
    events: [
      event({
        attributes: {
          list: [{ x: 1, y: 2 }],
          nested: { a: 2, z: 1 }
        }
      })
    ]
  }).events[0];

  assert.equal(hashRuntimeTelemetryEvent(first), hashRuntimeTelemetryEvent(second));
});

test("changing any identity-bearing field changes the payload hash", () => {
  const base = runtimeTelemetryBatchSchema.parse({
    events: [event()]
  }).events[0];

  for (const key of [
    "eventId",
    "serviceName",
    "operationName",
    "environment",
    "deploymentId",
    "revisionSha",
    "durationMs",
    "status",
    "httpStatusCode",
    "errorType"
  ]) {
    const value =
      key === "eventId"
        ? "evt-different"
        : key === "durationMs"
          ? 11
          : key === "httpStatusCode"
            ? 201
            : key === "status"
              ? "error"
              : key === "revisionSha"
                ? SHA64
                : key === "errorType"
                  ? "DifferentError"
                  : "different";

    let next = event({ [key]: value });

    if (key === "status") {
      next = event({ status: "error", errorType: "ChangedError" });
    }

    const parsed = runtimeTelemetryBatchSchema.parse({
      events: [next]
    }).events[0];

    assert.notEqual(
      hashRuntimeTelemetryEvent(base),
      hashRuntimeTelemetryEvent(parsed),
      key
    );
  }
});

test("a full 500-event batch is accepted", () => {
  const events = Array.from({ length: 500 }, (_, index) =>
    event({
      eventId: `evt-${index + 1}`,
      observedAt: new Date(NOW.getTime() - index).toISOString()
    })
  );

  assert.equal(
    runtimeTelemetryBatchSchema.parse({ events }).events.length,
    500
  );
});

test("an empty batch is rejected", () => {
  assert.throws(() =>
    runtimeTelemetryBatchSchema.parse({
      events: []
    })
  );
});
