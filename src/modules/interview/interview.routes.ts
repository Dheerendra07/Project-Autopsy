import { Router } from "express";
import { z } from "zod";

import { generateInterviewStories } from "./interview.service.js";

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
    next(error);
  }
});

export default interviewRouter;
