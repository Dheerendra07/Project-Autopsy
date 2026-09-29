import { z } from "zod";

const gitShaSchema = z
  .string()
  .trim()
  .regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/, "revisionSha must be a full Git commit SHA.");

const boundedLabel = (name: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${name} must not be empty.`)
    .max(max, `${name} is too long.`);

const attributesSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .superRefine((value, ctx) => {
    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "attributes must be JSON serializable."
      });
      return;
    }

    if (Buffer.byteLength(serialized, "utf8") > 8_192) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "attributes exceed the 8 KiB limit."
      });
    }
  });

export const runtimeTelemetryEventSchema = z
  .object({
    eventId: boundedLabel("eventId", 128).regex(
      /^[A-Za-z0-9._:-]+$/,
      "eventId contains unsupported characters."
    ),
    observedAt: z.coerce.date(),
    signalType: z.enum(["http", "job", "db", "external", "custom"]),
    serviceName: boundedLabel("serviceName", 128),
    operationName: boundedLabel("operationName", 256),
    environment: boundedLabel("environment", 64).optional(),
    deploymentId: boundedLabel("deploymentId", 256).optional(),
    revisionSha: gitShaSchema.optional(),
    traceId: z
      .string()
      .trim()
      .regex(
        /^[0-9a-fA-F]{32}$/,
        "traceId must be exactly 32 hexadecimal characters."
      )
      .optional(),
    spanId: z
      .string()
      .trim()
      .regex(
        /^[0-9a-fA-F]{16}$/,
        "spanId must be exactly 16 hexadecimal characters."
      )
      .optional(),
    durationMs: z.number().finite().min(0).max(86_400_000),
    status: z.enum(["ok", "error", "unset"]).default("ok"),
    httpStatusCode: z.number().int().min(100).max(599).optional(),
    errorType: boundedLabel("errorType", 256).optional(),
    attributes: attributesSchema
  })
  .superRefine((value, ctx) => {
    if (value.signalType === "http" && value.httpStatusCode === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["httpStatusCode"],
        message: "HTTP telemetry must include httpStatusCode."
      });
    }

    if (
      value.status === "error" &&
      value.errorType === undefined &&
      value.signalType !== "http"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errorType"],
        message: "Error telemetry should identify errorType."
      });
    }

    if (
      value.httpStatusCode !== undefined &&
      value.httpStatusCode >= 500 &&
      value.status === "ok"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "5xx HTTP telemetry cannot have status=ok."
      });
    }
  });

export const runtimeTelemetryBatchSchema = z.object({
  events: z
    .array(runtimeTelemetryEventSchema)
    .min(1, "At least one telemetry event is required.")
    .max(500, "A telemetry batch cannot contain more than 500 events.")
});

export type RuntimeTelemetryEventInput = z.infer<
  typeof runtimeTelemetryEventSchema
>;

export interface PreparedRuntimeTelemetryEvent
  extends RuntimeTelemetryEventInput {
  observedAtIso: string;
  payloadHash: string;
}

export type RuntimeTelemetryGroupBy =
  | "revision"
  | "operation"
  | "service"
  | "environment"
  | "signalType";

export interface RuntimeTelemetryFilters {
  from?: Date;
  to?: Date;
  revisionSha?: string;
  environment?: string;
  deploymentId?: string;
  operationName?: string;
  signalType?: RuntimeTelemetryEventInput["signalType"];
}

export interface RuntimeTelemetryAggregate {
  sampleCount: number;
  durationSampleCount: number;
  errorCount: number;
  errorRate: number;
  minDurationMs: number | null;
  avgDurationMs: number | null;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  p99DurationMs: number | null;
  maxDurationMs: number | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface RuntimeTelemetryGroupAggregate
  extends RuntimeTelemetryAggregate {
  key: string;
  revisionKnown?: boolean;
}
