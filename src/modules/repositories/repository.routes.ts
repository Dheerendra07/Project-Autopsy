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
import { classifyTimelineEvent } from "../timeline/timeline.classifier.js";
import { classifyRefactorSignal } from "../refactors/refactor-signals.js";
import { listFileChangeCoupling } from "../coupling/coupling.persistence.js";
import { listRefactorSignals } from "../refactors/refactor.persistence.js";
import {
  listArchitectureEvents,
  listDependencyChanges
} from "../evolution/evolution.persistence.js";
import { listCodeComplexityEvents } from "../complexity/complexity.persistence.js";

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

    const { storage_path: _storagePath, ...publicRepository } = repository;

    res.json({
      success: true,
      repository: publicRepository
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

router.get("/:repositoryId/timeline", async (req, res, next) => {
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
      evidenceBasis: "commit_subject_keyword_heuristic",
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages
      },
      events: result.commits.map((commit) => ({
        ...commit,
        eventType: classifyTimelineEvent(commit.subject)
      }))
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

router.get("/:repositoryId/coupling", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const query = z.object({
      minCoChanges: z.coerce.number().int().min(1).max(10_000).default(2),
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

    const pairs = await listFileChangeCoupling(
      repositoryId,
      query.minCoChanges,
      query.limit
    );

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "files_changed_together_in_same_commits",
      minCoChanges: query.minCoChanges,
      pairs
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/refactors", async (req, res, next) => {
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

    const storedSignals = await listRefactorSignals(
      repositoryId,
      query.limit
    );

    const signals = storedSignals.map((commit) => ({
      ...commit,
      signal_type: classifyRefactorSignal(commit.subject)
    }));

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "commit_subject_keyword_heuristic",
      ordering: ["files_changed DESC", "committed_at ASC", "sha ASC"],
      signals
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/dependencies", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100)
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

    const changes = await listDependencyChanges(repositoryId, query.limit);

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "package_json_commit_snapshots",
      changes
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/architecture", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100)
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

    const events = await listArchitectureEvents(repositoryId, query.limit);

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "git_tree_directory_snapshots",
      scope: [
        "repository top-level directories",
        "src top-level directories"
      ],
      events
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:repositoryId/complexity", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100)
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

    const storedEvents = await listCodeComplexityEvents(
      repositoryId,
      query.limit
    );

    const events = storedEvents.map((event) => {
      const before = {
        sourceLines: event.before_source_lines,
        functionCount: event.before_function_count,
        classCount: event.before_class_count,
        cyclomaticComplexity: event.before_cyclomatic_complexity,
        maxNestingDepth: event.before_max_nesting_depth
      };

      const after = {
        sourceLines: event.after_source_lines,
        functionCount: event.after_function_count,
        classCount: event.after_class_count,
        cyclomaticComplexity: event.after_cyclomatic_complexity,
        maxNestingDepth: event.after_max_nesting_depth
      };

      const delta =
        event.analysis_status === "supported" &&
        (event.change_type === "added" ||
          event.change_type === "modified" ||
          event.change_type === "deleted")
          ? {
              sourceLines:
                (event.after_source_lines ?? 0) -
                (event.before_source_lines ?? 0),
              functionCount:
                (event.after_function_count ?? 0) -
                (event.before_function_count ?? 0),
              classCount:
                (event.after_class_count ?? 0) -
                (event.before_class_count ?? 0),
              cyclomaticComplexity:
                (event.after_cyclomatic_complexity ?? 0) -
                (event.before_cyclomatic_complexity ?? 0),
              maxNestingDepth:
                (event.after_max_nesting_depth ?? 0) -
                (event.before_max_nesting_depth ?? 0)
            }
          : null;

      return {
        path: event.path,
        sha: event.sha,
        subject: event.subject,
        committed_at: event.committed_at,
        change_type: event.change_type,
        analysis_status: event.analysis_status,
        before,
        after,
        delta
      };
    });

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "typescript_ast_file_change_snapshots",
      supportedExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      excludedGeneratedPaths: [
        "node_modules",
        "dist",
        "build",
        "coverage",
        "vendor",
        "out",
        ".next",
        ".nuxt",
        "generated"
      ],
      events
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
      analysis: {
        id: analysis.id,
        repository_id: analysis.repository_id,
        analyzer_version: analysis.analyzer_version,
        status: analysis.status,
        started_at: analysis.started_at,
        completed_at: analysis.completed_at,
        error_message:
          analysis.status === "failed" ? "Analysis failed." : null
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

export { router as repositoryRouter };
