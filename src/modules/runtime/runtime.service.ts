import { createHash } from "node:crypto";
import { z } from "zod";

import {
  runtimeTelemetryBatchSchema,
  type PreparedRuntimeTelemetryEvent,
  type RuntimeTelemetryEventInput
} from "./runtime.types.js";

export const RUNTIME_TELEMETRY_MAX_BATCH_SIZE = 500;
export const RUNTIME_TELEMETRY_MAX_ATTRIBUTES_BYTES = 8_192;
export const RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
export const RUNTIME_TELEMETRY_MAX_PAST_AGE_MS =
  365 * 24 * 60 * 60 * 1_000;

export class RuntimeTelemetryValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = "RuntimeTelemetryValidationError";
  }
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();

    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize(record[key])}`
      )
      .join(",")}}`;
  }

  return "null";
}

export function hashRuntimeTelemetryEvent(
  event: RuntimeTelemetryEventInput
): string {
  const canonical = {
    eventId: event.eventId,
    observedAt: event.observedAt.toISOString(),
    signalType: event.signalType,
    serviceName: event.serviceName,
    operationName: event.operationName,
    environment: event.environment ?? null,
    revisionSha: event.revisionSha ?? null,
    traceId: event.traceId ?? null,
    spanId: event.spanId ?? null,
    durationMs: event.durationMs,
    status: event.status,
    httpStatusCode: event.httpStatusCode ?? null,
    errorType: event.errorType ?? null,
    attributes: event.attributes
  };

  return createHash("sha256")
    .update(stableSerialize(canonical), "utf8")
    .digest("hex");
}

export function prepareRuntimeTelemetryBatch(
  rawInput: unknown,
  now: Date = new Date()
): PreparedRuntimeTelemetryEvent[] {
  const parsed = runtimeTelemetryBatchSchema.parse(rawInput);
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    throw new Error("Telemetry validation clock is invalid.");
  }

  const seenEventIds = new Set<string>();

  return parsed.events.map((event) => {
    if (seenEventIds.has(event.eventId)) {
      throw new RuntimeTelemetryValidationError(
        `Duplicate eventId in telemetry batch: ${event.eventId}`,
        "events"
      );
    }

    seenEventIds.add(event.eventId);

    const observedAtMs = event.observedAt.getTime();

    if (
      observedAtMs > nowMs + RUNTIME_TELEMETRY_MAX_FUTURE_SKEW_MS
    ) {
      throw new RuntimeTelemetryValidationError(
        `observedAt is too far in the future for event ${event.eventId}.`,
        "observedAt"
      );
    }

    if (
      observedAtMs < nowMs - RUNTIME_TELEMETRY_MAX_PAST_AGE_MS
    ) {
      throw new RuntimeTelemetryValidationError(
        `observedAt is too old for event ${event.eventId}.`,
        "observedAt"
      );
    }

    return {
      ...event,
      observedAtIso: event.observedAt.toISOString(),
      payloadHash: hashRuntimeTelemetryEvent(event)
    };
  });
}

export function parseRuntimeTelemetryDateRange(
  from?: Date,
  to?: Date
): void {
  if (!from || !to) return;

  if (from.getTime() >= to.getTime()) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["from"],
        message: "from must be earlier than to."
      }
    ]);
  }
}
