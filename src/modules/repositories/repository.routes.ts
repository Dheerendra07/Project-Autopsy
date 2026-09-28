import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  getRepositoryNameFromUrl,
  getRepositoryStoragePath
} from "./repository.service.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";
import {
  createAnalysisRunForRepository,
  createPendingRepositoryWithAnalysis,
  createRepositoryWithAnalysis,
  getActiveAnalysisRun,
  getAnalysisRunById,
  getRepositoryById,
  listRepositoryCommits,
  listRepositoryHotspots,
  updateAnalysisRun
} from "./repository.persistence.js";
import { listRepeatedBugAreas } from "./bug-area.persistence.js";
import { listRepeatedlyModifiedFiles } from "../metrics/change-patterns.persistence.js";
import {
  enqueueRepositoryAnalysis,
  enqueueRepositoryImport,
  enqueueRepositoryRefresh
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
import { listDatabaseMigrationEvents } from "../schema/schema.persistence.js";
import type { DatabaseMigrationFilters } from "../schema/schema.types.js";

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

    const repository = await createPendingRepositoryWithAnalysis(
      {
        id: repositoryId,
        sourceType: getSourceType(safeUrl.toString()),
        sourceUrl: safeUrl.toString(),
        name: getRepositoryNameFromUrl(safeUrl),
        trackedBranch: input.branch ?? null,
        storagePath: getRepositoryStoragePath(repositoryId)
      },
      ANALYZER_VERSION
    );

    try {
      const jobId = await enqueueRepositoryImport(
        repository.repositoryId,
        repository.analysisRunId,
        safeUrl.toString(),
        input.branch
      );

      res.status(202).json({
        success: true,
        repository: {
          id: repository.repositoryId,
          source: safeUrl.toString(),
          name: getRepositoryNameFromUrl(safeUrl),
          trackedBranch: input.branch ?? null
        },
        analysis: {
          id: repository.analysisRunId,
          status: "queued",
          mode: "full",
          jobId
        }
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to queue repository import.";

      try {
        await updateAnalysisRun(repository.analysisRunId, "failed", {
          errorMessage: message
        });
      } catch (persistenceError) {
        console.error(
          `Failed to record import queue failure for ${repository.analysisRunId}:`,
          persistenceError
        );
      }

      next(error);
    }
  } catch (error) {
    next(error);
  }
});

router.post("/:repositoryId/analyze", async (req, res, next) => {
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

    const activeRun = await getActiveAnalysisRun(repositoryId);

    if (activeRun) {
      res.status(409).json({
        success: false,
        error: {
          code: "ANALYSIS_ALREADY_RUNNING",
          message: "An analysis is already queued or running for this repository.",
          analysisRunId: activeRun.id
        }
      });
      return;
    }

    if (
      !repository.source_url ||
      !repository.storage_path ||
      !repository.tracked_branch
    ) {
      res.status(409).json({
        success: false,
        error: {
          code: "REPOSITORY_REANALYSIS_UNAVAILABLE",
          message: "This repository cannot be refreshed with the stored metadata."
        }
      });
      return;
    }

    let analysisRunId: string;

    try {
      analysisRunId = await createAnalysisRunForRepository(
        repositoryId,
        {
          analyzerVersion: ANALYZER_VERSION,
          analysisMode: "check",
          baseHeadSha: null,
          targetHeadSha: null
        }
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({
          success: false,
          error: {
            code: "ANALYSIS_ALREADY_RUNNING",
            message: "An analysis is already queued or running for this repository."
          }
        });
        return;
      }

      throw error;
    }

    try {
      const jobId = await enqueueRepositoryRefresh(
        repositoryId,
        analysisRunId
      );

      res.status(202).json({
        success: true,
        repositoryId,
        analysis: {
          id: analysisRunId,
          status: "queued",
          mode: "check",
          jobId
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to queue repository refresh.";

      try {
        await updateAnalysisRun(analysisRunId, "failed", {
          errorMessage: message
        });
      } catch (persistenceError) {
        console.error(
          `Failed to record refresh queue failure for ${analysisRunId}:`,
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

router.get("/:repositoryId/database-migrations", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      framework: z
        .enum([
          "sql",
          "prisma",
          "drizzle",
          "knex",
          "sequelize",
          "typeorm",
          "rails",
          "unknown"
        ])
        .optional(),
      changeType: z
        .enum(["added", "modified", "deleted"])
        .optional(),
      migrationKind: z
        .enum(["schema", "data", "mixed", "unknown"])
        .optional(),
      operationType: z
        .enum([
          "create_table",
          "drop_table",
          "alter_table_add_column",
          "alter_table_drop_column",
          "alter_table_rename_column",
          "alter_column_type",
          "set_not_null",
          "drop_not_null",
          "add_constraint",
          "drop_constraint",
          "create_index",
          "drop_index",
          "create_view",
          "drop_view",
          "create_schema",
          "drop_schema",
          "create_type",
          "alter_type",
          "drop_type",
          "create_sequence",
          "drop_sequence",
          "create_function",
          "drop_function",
          "truncate",
          "insert",
          "update",
          "delete",
          "merge",
          "alter_table_other",
          "unknown"
        ])
        .optional()
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

    const filters: DatabaseMigrationFilters = {};
    if (query.framework) filters.framework = query.framework;
    if (query.changeType) filters.changeType = query.changeType;
    if (query.migrationKind) filters.migrationKind = query.migrationKind;
    if (query.operationType) filters.operationType = query.operationType;

    const result = await listDatabaseMigrationEvents(
      repositoryId,
      query.limit,
      filters
    );

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "database_migration_file_analysis",
      ordering: [
        "committedAt ASC NULLS LAST",
        "sha ASC",
        "path ASC"
      ],
      filters: {
        framework: query.framework ?? null,
        changeType: query.changeType ?? null,
        migrationKind: query.migrationKind ?? null,
        operationType: query.operationType ?? null
      },
      pagination: {
        limit: query.limit,
        total: result.total
      },
      events: result.events
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

router.get("/:repositoryId/repeatedly-modified-files", async (req, res, next) => {
  try {
    const repositoryId = z.string().uuid().parse(req.params.repositoryId);

    const query = z.object({
      minTouches: z.coerce.number().int().min(2).max(10_000).default(3),
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

    const files = await listRepeatedlyModifiedFiles(
      repositoryId,
      query.minTouches,
      query.limit
    );

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "persisted_git_file_change_history",
      minTouches: query.minTouches,
      ordering: [
        "commits_touched DESC",
        "total_churn DESC",
        "change_span_days DESC",
        "path ASC"
      ],
      files
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
        mode: analysis.analysis_mode,
        base_head_sha: analysis.base_head_sha,
        target_head_sha: analysis.target_head_sha,
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
