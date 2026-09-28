import { Router } from "express";
import { z } from "zod";

import { getRepositoryById } from "../repositories/repository.persistence.js";
import { isRuntimeTelemetryAuthorized } from "./runtime.auth.js";
import { generateRuntimeCorrelationEvidence } from "./correlation.service.js";
import {
  insertRuntimeTelemetryBatch,
  listRuntimeTelemetryEvents,
  summarizeRuntimeTelemetry
} from "./runtime.persistence.js";
import {
  prepareRuntimeTelemetryBatch,
  RuntimeTelemetryValidationError
} from "./runtime.service.js";
import type {
  RuntimeTelemetryFilters,
  RuntimeTelemetryGroupBy
} from "./runtime.types.js";

export const runtimeRouter = Router({ mergeParams: true });

const runtimeQueryFields = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  revisionSha: z
    .string()
    .trim()
    .regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/)
    .optional(),
  environment: z.string().trim().min(1).max(64).optional(),
  operationName: z.string().trim().min(1).max(256).optional(),
  signalType: z
    .enum(["http", "job", "db", "external", "custom"])
    .optional()
};

const runtimeFilterFields = {
  from: runtimeQueryFields.from,
  to: runtimeQueryFields.to,
  revisionSha: runtimeQueryFields.revisionSha,
  environment: runtimeQueryFields.environment,
  operationName: runtimeQueryFields.operationName,
  signalType: runtimeQueryFields.signalType
};

function validateDateRange(
  value: {
    from?: Date | undefined;
    to?: Date | undefined;
  },
  ctx: z.RefinementCtx
): void {
  if (
    value.from &&
    value.to &&
    value.from.getTime() >= value.to.getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: "from must be earlier than to."
    });
  }
}

const querySchema = z
  .object(runtimeQueryFields)
  .superRefine(validateDateRange);

const summaryQuerySchema = z
  .object({
    ...runtimeFilterFields,
    groupBy: z
      .enum([
        "revision",
        "operation",
        "service",
        "environment",
        "signalType"
      ])
      .default("revision"),
    groupLimit: z.coerce.number().int().min(1).max(100).default(25)
  })
  .superRefine(validateDateRange);
function getRepositoryId(
  params: Record<string, string | undefined>
): string {
  return z.string().uuid().parse(params.repositoryId);
}

function getFilters(
  query: {
    from?: Date | undefined;
    to?: Date | undefined;
    revisionSha?: string | undefined;
    environment?: string | undefined;
    operationName?: string | undefined;
    signalType?: RuntimeTelemetryFilters["signalType"] | undefined;
  }
): RuntimeTelemetryFilters {
  const filters: RuntimeTelemetryFilters = {};

  if (query.from) filters.from = query.from;
  if (query.to) filters.to = query.to;
  if (query.revisionSha) filters.revisionSha = query.revisionSha;
  if (query.environment) filters.environment = query.environment;
  if (query.operationName) filters.operationName = query.operationName;
  if (query.signalType) filters.signalType = query.signalType;

  return filters;
}
runtimeRouter.post("/telemetry", async (req, res, next) => {
  try {
    if (
      !isRuntimeTelemetryAuthorized(
        req.header("authorization"),
        req.header("x-autopsy-telemetry-key")
      )
    ) {
      res.status(401).json({
        success: false,
        error: {
          code: "TELEMETRY_INGEST_UNAUTHORIZED",
          message: "Telemetry ingestion credentials are invalid."
        }
      });
      return;
    }

    const repositoryId = getRepositoryId(req.params);
    const repository = await getRepositoryById(repositoryId);

    if (!repository) {
      res.status(404).json({
        success: false,
        error: {
          code: "REPOSITORY_NOT_FOUND",
          message: "Repository not found."
        }
      });
      return;
    }

    const events = prepareRuntimeTelemetryBatch(req.body);
    const result = await insertRuntimeTelemetryBatch(
      repositoryId,
      events
    );

    res.status(202).json({
      success: true,
      repositoryId,
      ingested: {
        received: events.length,
        accepted: result.accepted,
        duplicates: result.duplicates
      },
      semantics: {
        duplicatePolicy: "same eventId + same payload hash is idempotent",
        conflictingDuplicatePolicy:
          "same eventId + different payload is rejected",
        evidenceBasis: "observed_runtime_telemetry"
      }
    });
  } catch (error) {
    if (error instanceof RuntimeTelemetryValidationError) {
      res.status(400).json({
        success: false,
        error: {
          code: "TELEMETRY_VALIDATION_ERROR",
          message: error.message,
          field: error.field
        }
      });
      return;
    }

    if (
      error instanceof Error &&
      error.name === "RuntimeTelemetryEventConflictError"
    ) {
      res.status(409).json({
        success: false,
        error: {
          code: "TELEMETRY_EVENT_ID_CONFLICT",
          message: error.message
        }
      });
      return;
    }

    next(error);
  }
});

runtimeRouter.get("/telemetry", async (req, res, next) => {
  try {
    const repositoryId = getRepositoryId(req.params);
    const query = querySchema.parse(req.query);
    const repository = await getRepositoryById(repositoryId);

    if (!repository) {
      res.status(404).json({
        success: false,
        error: {
          code: "REPOSITORY_NOT_FOUND",
          message: "Repository not found."
        }
      });
      return;
    }

    const result = await listRuntimeTelemetryEvents(
      repositoryId,
      query.page,
      query.limit,
      getFilters(query)
    );

    const totalPages =
      result.total === 0
        ? 0
        : Math.ceil(result.total / query.limit);

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "observed_runtime_telemetry",
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages
      },
      events: result.events.map((event) => ({
        id: event.id,
        eventId: event.event_id,
        observedAt: event.observed_at,
        receivedAt: event.received_at,
        signalType: event.signal_type,
        serviceName: event.service_name,
        operationName: event.operation_name,
        environment: event.environment,
        revisionSha: event.revision_sha,
        traceId: event.trace_id,
        spanId: event.span_id,
        durationMs: event.duration_ms,
        status: event.status,
        httpStatusCode: event.http_status_code,
        errorType: event.error_type
      }))
    });
  } catch (error) {
    next(error);
  }
});

runtimeRouter.get("/correlation", async (req, res, next) => {
  try {
    const repositoryId = getRepositoryId(req.params as Record<string, string | undefined>);
    const query = z.object({
      revisionSha: z.string().trim().regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/),
      windowMinutes: z.coerce.number().int().min(5).max(1_440).default(60),
      minSamples: z.coerce.number().int().min(1).max(10_000).default(10),
      environment: runtimeQueryFields.environment,
      operationName: runtimeQueryFields.operationName,
      signalType: runtimeQueryFields.signalType
    }).parse(req.query);

    const result = await generateRuntimeCorrelationEvidence(
      repositoryId,
      query.revisionSha,
      query.windowMinutes,
      query.minSamples,
      {
        ...(query.environment ? { environment: query.environment } : {}),
        ...(query.operationName ? { operationName: query.operationName } : {}),
        ...(query.signalType ? { signalType: query.signalType } : {})
      }
    );

    res.json({
      success: true,
      repositoryId,
      result
    });
  } catch (error) {
    next(error);
  }
});

runtimeRouter.get("/telemetry/summary", async (req, res, next) => {
  try {
    const repositoryId = getRepositoryId(req.params);
    const query = summaryQuerySchema.parse(req.query);
    const repository = await getRepositoryById(repositoryId);

    if (!repository) {
      res.status(404).json({
        success: false,
        error: {
          code: "REPOSITORY_NOT_FOUND",
          message: "Repository not found."
        }
      });
      return;
    }

    const result = await summarizeRuntimeTelemetry(
      repositoryId,
      getFilters(query),
      query.groupBy as RuntimeTelemetryGroupBy,
      query.groupLimit
    );

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "observed_runtime_telemetry",
      query: {
        from: query.from?.toISOString() ?? null,
        to: query.to?.toISOString() ?? null,
        revisionSha: query.revisionSha ?? null,
        environment: query.environment ?? null,
        operationName: query.operationName ?? null,
        signalType: query.signalType ?? null,
        groupBy: query.groupBy,
        groupLimit: query.groupLimit
      },
      overall: result.overall,
      groups: result.groups
    });
  } catch (error) {
    next(error);
  }
});

export default runtimeRouter;
