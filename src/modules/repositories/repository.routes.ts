import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { cloneRepository } from "./repository.service.js";
import {
  createRepositoryWithAnalysis
} from "./repository.persistence.js";
import {
  enqueueRepositoryAnalysis
} from "../analysis/analysis.queue.js";
import { ANALYZER_VERSION } from "../../workers/queue.constants.js";

const router = Router();

const importSchema = z.object({
  url: z.string().url(),
  branch: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9._/-]+$/)
    .optional()
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

    const analysis = await createRepositoryWithAnalysis(
      {
        id: repositoryId,
        sourceType: getSourceType(input.url),
        sourceUrl: input.url,
        name: metadata.name,
        metadata,
        storagePath: await resolveStoragePath(repositoryId)
      },
      ANALYZER_VERSION
    );

    const jobId = await enqueueRepositoryAnalysis(
      analysis.repositoryId,
      analysis.analysisRunId
    );

    res.status(201).json({
      success: true,
      repository: {
        id: analysis.repositoryId,
        source: input.url,
        metadata
      },
      analysis: {
        id: analysis.analysisRunId,
        status: "queued",
        jobId
      }
    });
  } catch (error) {
    next(error);
  }
});

function getSourceType(url: string): "github" | "gitlab" | "bitbucket" {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname === "github.com") {
    return "github";
  }

  if (hostname === "gitlab.com") {
    return "gitlab";
  }

  return "bitbucket";
}

async function resolveStoragePath(repositoryId: string): Promise<string> {
  const { env } = await import("../../config/env.js");
  const path = await import("node:path");

  return path.resolve(
    env.REPOSITORY_STORAGE_PATH,
    repositoryId
  );
}

export { router as repositoryRouter };
