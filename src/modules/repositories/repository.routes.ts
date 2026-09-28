import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  cloneRepository,
  getRepositoryStoragePath,
  removeRepositoryStorage
} from "./repository.service.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";
import {
  createRepositoryWithAnalysis,
  getAnalysisRunById,
  getRepositoryById,
  listRepositoryCommits,
  listRepositoryHotspots,
  updateAnalysisRun
} from "./repository.persistence.js";
import { listRepeatedBugAreas } from "./bug-area.persistence.js";
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
    const safeUrl = validateRemoteRepositoryUrl(input.url);
    const repositoryId = randomUUID();

    const metadata = await cloneRepository(
      repositoryId,
      safeUrl.toString(),
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
          sourceUrl: safeUrl.toString(),
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
          source: safeUrl.toString(),
          metadata
        },
        analysis: {
          id: analysis.analysisRunId,
          status: "queued",
          jobId
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to queue analysis.";

      try {
        await updateAnalysisRun(analysis.analysisRunId, "failed", {
          errorMessage: message
        });
      } catch (persistenceError) {
        console.error(
          `Failed to record queue failure for ${analysis.analysisRunId}:`,
          persistenceError
        );
      }

      next(error);
    }
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
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

    res.json({
      success: true,
      repository
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/commits", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);

    const query = z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50)
    }).parse(req.query);

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

    const result = await listRepositoryCommits(
      repositoryId,
      query.page,
      query.limit
    );

    const totalPages =
      result.total === 0
        ? 0
        : Math.ceil(result.total / query.limit);

    res.json({
      success: true,
      repositoryId,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages
      },
      commits: result.commits
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/hotspots", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);

    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20)
    }).parse(req.query);

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

    const hotspots = await listRepositoryHotspots(
      repositoryId,
      query.limit
    );

    res.json({
      success: true,
      repositoryId,
      ordering: [
        "commits_touched DESC",
        "total_churn DESC",
        "path ASC"
      ],
      hotspots
    });
  } catch (error) {
    next(error);
  }
});


router.get("/:repositoryId/repeated-bug-areas", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);

    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20)
    }).parse(req.query);

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

    const areas = await listRepeatedBugAreas(
      repositoryId,
      query.limit
    );

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "commit_subject_keyword_heuristic",
      signalPattern:
        "fix|fixed|fixes|bug|bugfix|hotfix|regression|regressed|patch",
      minimumSignalCommits: 2,
      areas
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/analysis/:analysisRunId", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const analysisRunId = z.string().uuid().parse(req.params.analysisRunId);
    const analysis = await getAnalysisRunById(analysisRunId);

    if (
      !analysis ||
      analysis.repository_id !== repositoryId
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
