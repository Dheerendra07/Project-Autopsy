import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { cloneRepository } from "./repository.service.js";

const router = Router();

const importSchema = z.object({
  url: z.string().url(),
  branch: z.string().trim().min(1).max(255).optional()
});

router.post("/import", async (req, res, next) => {
  try {
    const input = importSchema.parse(req.body);
    const repositoryId = randomUUID();

    const metadata = await cloneRepository(
      repositoryId,
      input.url,
      input.branch
    );

    res.status(201).json({
      success: true,
      repository: {
        id: repositoryId,
        source: input.url,
        metadata
      }
    });
  } catch (error) {
    next(error);
  }
});

export { router as repositoryRouter };
