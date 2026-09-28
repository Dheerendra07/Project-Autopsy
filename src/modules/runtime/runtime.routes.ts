import { Router } from "express";
import { z } from "zod";

import { getRepositoryById } from "../repositories/repository.persistence.js";
import { isRuntimeTelemetryAuthorized } from "./runtime.auth.js";
import {
  insertRuntimeTelemetryBatch,
  listRuntimeTelemetryEvents,
  summarizeRuntimeTelemetry
} from "./runtime.persistence.js";
import {
  parseRuntimeTelemetryDateRange,
  prepareRuntimeTelemetryBatch,
  RuntimeTelemetryValidationError
} from "./runtime.service.js";
import type {
  RuntimeTelemetryFilters,
  RuntimeTelemetryGroupBy
} from "./runtime.types.js";

export const runtimeRouter = Router({ mergeParams: true });

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    revisionSha: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{7,64}$/)
      .optional(),
    environment: z.string().trim().min(1).max(64).optional(),
    operationName: z.string().trim().min(1).max(256).optional(),
    signalType: z
      .enum(["http", "job", "db", "external", "custom"])
      .optional()
  })
  .superRefine((value, ctx) => {
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
  });

const summaryQuerySchema = querySchema
  .omit({ page: true, limit: true })
  .extend({
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
  });

function getRepositoryId(
  params: Record<string, string | undefined>
): string {
  return z.string().uuid().parse(params.repositoryId);
}

function getFilters(
  query: {
    from?: Date;
    to?: Date;
    revisionSha?: string;
    environment?: string;
    operationName?: string;
    signalType?: RuntimeTelemetryFilters["signalType"];
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

    parseRuntimeTelemetryDateRange(query.from, query.to);

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
