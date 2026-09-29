import { Router } from "express";
import { z } from "zod";

import {
  AiInterpretationNotConfiguredError,
  AiInterpretationProviderError,
  AiInterpretationValidationError,
  generateAiInterpretation
} from "./interpretation.service.js";
import { isAiInterpretationAuthorized } from "./interpretation.auth.js";
import { RedisAiInterpretationCache } from "./interpretation.cache.js";
import { redis } from "../../config/redis.js";
import { env } from "../../config/env.js";
import {
  EvidenceReportNotReadyError,
  EvidenceReportRepositoryNotFoundError,
  generateEvidenceReport
} from "../reports/report.service.js";

export const interpretationRouter = Router({ mergeParams: true });

const interpretationCache = new RedisAiInterpretationCache(
  redis,
  env.AI_INTERPRETATION_CACHE_TTL_SECONDS
);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

interpretationRouter.get("/", async (req, res, next) => {
  try {
    if (
      !isAiInterpretationAuthorized(
        req.header("authorization"),
        req.header("x-autopsy-ai-access-key")
      )
    ) {
      res.status(401).json({
        success: false,
        error: {
          code: "AI_INTERPRETATION_UNAUTHORIZED",
          message: "AI interpretation access credentials are invalid."
        }
      });
      return;
    }

    const repositoryId = z
      .string()
      .uuid()
      .parse((req.params as { repositoryId?: unknown }).repositoryId);
    const query = querySchema.parse(req.query);

    const report = await generateEvidenceReport(repositoryId, query.limit);
    const result = await generateAiInterpretation(
      report,
      undefined,
      fetch,
      interpretationCache
    );

    res.json({
      success: true,
      repositoryId,
      result
    });
  } catch (error) {
    if (error instanceof EvidenceReportRepositoryNotFoundError) {
      res.status(404).json({
        success: false,
        error: {
          code: "REPOSITORY_NOT_FOUND",
          message: error.message
        }
      });
      return;
    }

    if (error instanceof EvidenceReportNotReadyError) {
      res.status(409).json({
        success: false,
        error: {
          code: "REPORT_NOT_READY",
          message: error.message
        }
      });
      return;
    }

    if (error instanceof AiInterpretationNotConfiguredError) {
      res.status(503).json({
        success: false,
        error: {
          code: "AI_INTERPRETATION_NOT_CONFIGURED",
          message: error.message
        }
      });
      return;
    }

    if (error instanceof AiInterpretationProviderError) {
      res.status(502).json({
        success: false,
        error: {
          code: "AI_INTERPRETATION_PROVIDER_ERROR",
          message: error.message
        }
      });
      return;
    }

    if (error instanceof AiInterpretationValidationError) {
      res.status(502).json({
        success: false,
        error: {
          code: "AI_INTERPRETATION_INVALID_OUTPUT",
          message: error.message
        }
      });
      return;
    }

    next(error);
  }
});

export default interpretationRouter;
