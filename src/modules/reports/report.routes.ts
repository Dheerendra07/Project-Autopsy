import { Router } from "express";
import { z } from "zod";

import {
  EvidenceReportNotReadyError,
  EvidenceReportRepositoryNotFoundError,
  generateEvidenceReport
} from "./report.service.js";

export const reportRouter = Router({ mergeParams: true });

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

reportRouter.get("/", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const query = querySchema.parse(req.query);
    const report = await generateEvidenceReport(repositoryId, query.limit);

    res.json({
      success: true,
      repositoryId,
      report
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

    next(error);
  }
});

export default reportRouter;
