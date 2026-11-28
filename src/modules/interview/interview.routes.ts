import { Router } from "express";
import { z } from "zod";

import { generateInterviewStories } from "./interview.service.js";
import {
  EvidenceReportNotReadyError,
  EvidenceReportRepositoryNotFoundError
} from "../reports/report.service.js";

export const interviewRouter = Router({ mergeParams: true });

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(6).default(6)
});

interviewRouter.get("/", async (req, res, next) => {
  try {
    const repositoryId = z
      .string()
      .uuid()
      .parse((req.params as { repositoryId?: unknown }).repositoryId);
    const query = querySchema.parse(req.query);
    const result = await generateInterviewStories(
      repositoryId,
      query.limit
    );

    res.json({
      success: true,
      repositoryId,
      result
    });
  } catch (error) {
    // Stories are derived from the evidence report, so they share its readiness rules.
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

    next(error);
  }
});

export default interviewRouter;
