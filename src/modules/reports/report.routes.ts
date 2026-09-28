import { Router } from "express";
import { z } from "zod";

import { generateEvidenceReport } from "./report.service.js";

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
    next(error);
  }
});

export default reportRouter;
