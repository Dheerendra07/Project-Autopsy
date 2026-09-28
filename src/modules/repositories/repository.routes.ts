import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  cloneRepository,
  getRepositoryStoragePath,
  removeRepositoryStorage
} from "./repository.service.js";
import {
  createRepositoryWithAnalysis,
  getAnalysisRunById,
  getRepositoryById
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

    let analysis: {
      repositoryId: string;
      analysisRunId: string;
    };

    try {
      analysis = await createRepositoryWithAnalysis(
        {
          id: repositoryId,
          sourceType: getSourceType(input.url),
          sourceUrl: input.url,
          name: metadata.name,
          metadata,
          storagePath: getRepositoryStoragePath(repositoryId)
        },
        ANALYZER_VERSION
      );
    } catch (error) {
      await removeRepositoryStorage(repositoryId);
      throw error;
    }

    try {
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
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId", async (req, res, next) => {
  try {
    const repository = await getRepositoryById(req.params.repositoryId);

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

    res.json({
      success: true,
      repository
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/analysis/:analysisRunId", async (req, res, next) => {
  try {
    const analysis = await getAnalysisRunById(req.params.analysisRunId);

    if (
      !analysis ||
      analysis.repository_id !== req.params.repositoryId
    ) {
      res.status(404).json({
        success: false,
        error: {
          code: "ANALYSIS_RUN_NOT_FOUND",
          message: "Analysis run not found."
        }
      });
      return;
    }

    res.json({
      success: true,
      analysis
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

export { router as repositoryRouter };
