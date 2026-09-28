import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import {
  ANALYSIS_QUEUE_NAME,
  ANALYZER_VERSION
} from "./queue.constants.js";
import {
  getAnalysisRunById,
  getLatestCompletedAnalysisRun,
  getRepositoryById,
  persistCommitBatch,
  setAnalysisRunPlan,
  setAnalysisRunTargetHead,
  updateRepositoryImportMetadata,
  replaceFileChangeMetrics,
  replaceRepositoryCommitHistory,
  updateAnalysisRun
} from "../modules/repositories/repository.persistence.js";
import { discoverCommits } from "../modules/commits/commit.discovery.js";
import { discoverFileChurn } from "../modules/metrics/churn.discovery.js";
import { discoverDependencyEvolution } from "../modules/dependencies/dependency.discovery.js";
import { discoverArchitectureEvolution } from "../modules/architecture/architecture.discovery.js";
import { rebuildFileChangeCoupling } from "../modules/coupling/coupling.persistence.js";
import {
  discoverCodeComplexityEvolution
} from "../modules/complexity/complexity.discovery.js";
import {
  appendCodeComplexityEvolution,
  replaceCodeComplexityEvolution
} from "../modules/complexity/complexity.persistence.js";
import {
  appendDependencyEvolution,
  appendArchitectureEvolution,
  replaceDependencyEvolution,
  replaceArchitectureEvolution
} from "../modules/evolution/evolution.persistence.js";
import {
  getAnalysisCache,
  putAnalysisCache
} from "../modules/analysis/analysis-cache.persistence.js";
import {
  discoverDatabaseMigrationEvolution
} from "../modules/schema/schema.discovery.js";
import {
  appendDatabaseMigrationEvolution,
  replaceDatabaseMigrationEvolution
} from "../modules/schema/schema.persistence.js";
import {
  checkoutRepositoryAtCommit,
  cloneRepository,
  isCommitAncestor,
  refreshRepository,
  removeRepositoryStorage
} from "../modules/repositories/repository.service.js";
import {
  enqueueRepositoryAnalysis
} from "../modules/analysis/analysis.queue.js";
import { planAnalysisRun } from "../modules/analysis/analysis-planner.js";
import type { AnalysisJobData } from "../modules/analysis/analysis.queue.js";

export const analysisWorker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE_NAME,
  async (job) => {
    const { repositoryId, analysisRunId } = job.data;

    try {
      await updateAnalysisRun(analysisRunId, "running");

      if (job.data.kind === "import") {
        if (!job.data.remoteUrl) {
          throw new Error(
            `Repository import URL is missing: ${analysisRunId}`
          );
        }

        await removeRepositoryStorage(repositoryId);

        const metadata = await cloneRepository(
          repositoryId,
          job.data.remoteUrl,
          job.data.branch
        );

        const trackedBranch =
          job.data.branch ?? metadata.defaultBranch;

        await updateRepositoryImportMetadata(
          repositoryId,
          metadata,
          trackedBranch
        );

        await setAnalysisRunTargetHead(
          analysisRunId,
          metadata.headSha
        );

        const analysisJobId =
          await enqueueRepositoryAnalysis(
            repositoryId,
            analysisRunId
          );

        return {
          status: "imported",
          repositoryId,
          analysisRunId,
          targetHeadSha: metadata.headSha,
          analysisJobId
        };
      }

      const repository = await getRepositoryById(repositoryId);

      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      if (!repository.storage_path) {
        throw new Error(
          `Repository storage path is missing: ${repositoryId}`
        );
      }

      const analysis = await getAnalysisRunById(analysisRunId);

      if (!analysis || analysis.repository_id !== repositoryId) {
        throw new Error(
          `Analysis run not found: ${analysisRunId}`
        );
      }

      if (job.data.kind === "refresh") {
        if (
          !repository.source_url ||
          !repository.tracked_branch
        ) {
          throw new Error(
            `Repository refresh metadata is incomplete: ${repositoryId}`
          );
        }

        const metadata = await refreshRepository(
          repository.id,
          repository.source_url,
          repository.tracked_branch
        );

        await updateRepositoryImportMetadata(
          repository.id,
          metadata,
          repository.tracked_branch
        );

        const latestCompleted =
          await getLatestCompletedAnalysisRun(repositoryId);

        const latestAnalyzedHead =
          latestCompleted?.target_head_sha ?? null;

        const isAncestor =
          latestAnalyzedHead !== null &&
          await isCommitAncestor(
            repository.storage_path,
            latestAnalyzedHead,
            metadata.headSha
          );

        const plan = planAnalysisRun(
          metadata.headSha,
          latestAnalyzedHead,
          isAncestor
        );

        if (plan.kind === "up_to_date") {
          await setAnalysisRunPlan(analysisRunId, {
            analysisMode: "check",
            baseHeadSha: null,
            targetHeadSha: plan.targetHeadSha
          });
          await updateAnalysisRun(analysisRunId, "completed");

          return {
            status: "up_to_date",
            repositoryId,
            analysisRunId,
            targetHeadSha: plan.targetHeadSha,
            analysisMode: "check"
          };
        }

        if (!plan.analysisMode) {
          throw new Error(
            `Analysis planner returned an invalid mode: ${analysisRunId}`
          );
        }

        await setAnalysisRunPlan(analysisRunId, {
          analysisMode: plan.analysisMode,
          baseHeadSha: plan.baseHeadSha ?? null,
          targetHeadSha: plan.targetHeadSha
        });

        const analysisJobId =
          await enqueueRepositoryAnalysis(
            repositoryId,
            analysisRunId
          );

        return {
          status: "refresh-complete",
          repositoryId,
          analysisRunId,
          analysisMode: plan.analysisMode,
          baseHeadSha: plan.baseHeadSha ?? null,
          targetHeadSha: plan.targetHeadSha,
          analysisJobId
        };
      }

      if (!analysis.target_head_sha) {
        throw new Error(
          `Analysis target head is missing: ${analysisRunId}`
        );
      }

      await checkoutRepositoryAtCommit(
        repository.storage_path,
        analysis.target_head_sha
      );

      const commits =
        analysis.analysis_mode === "incremental" &&
        analysis.base_head_sha
          ? await discoverCommits(
              repository.storage_path,
              {
                fromExclusive: analysis.base_head_sha,
                toInclusive: analysis.target_head_sha
              }
            )
          : await discoverCommits(repository.storage_path);

      if (
        analysis.analysis_mode === "incremental" &&
        analysis.base_head_sha &&
        commits.length === 0
      ) {
        throw new Error(
          "Incremental analysis target contains no new commits."
        );
      }

      const persistedCount =
        analysis.analysis_mode === "incremental"
          ? await persistCommitBatch(repositoryId, commits)
          : await replaceRepositoryCommitHistory(
              repositoryId,
              commits
            );

      const fileChurn = await discoverFileChurn(
        repository.storage_path
      );

      await replaceFileChangeMetrics(repositoryId, fileChurn);

      const dependencyEvolution =
        await discoverDependencyEvolution(
          repository.storage_path,
          commits.map(({ sha }) => ({ sha })),
          {
            baseHeadSha:
              analysis.analysis_mode === "incremental"
                ? analysis.base_head_sha
                : null
          }
        );

      if (analysis.analysis_mode === "incremental") {
        await appendDependencyEvolution(
          repositoryId,
          dependencyEvolution.snapshots,
          dependencyEvolution.changes
        );
      } else {
        await replaceDependencyEvolution(
          repositoryId,
          dependencyEvolution.snapshots,
          dependencyEvolution.changes
        );
      }

      const architectureEvolution =
        await discoverArchitectureEvolution(
          repository.storage_path,
          commits.map(({ sha }) => ({ sha })),
          {
            baseHeadSha:
              analysis.analysis_mode === "incremental"
                ? analysis.base_head_sha
                : null
          }
        );

      if (analysis.analysis_mode === "incremental") {
        await appendArchitectureEvolution(
          repositoryId,
          architectureEvolution.snapshots,
          architectureEvolution.events
        );
      } else {
        await replaceArchitectureEvolution(
          repositoryId,
          architectureEvolution.snapshots,
          architectureEvolution.events
        );
      }

      const databaseMigrationEvolution =
        await discoverDatabaseMigrationEvolution(
          repository.storage_path,
          commits
        );

      if (analysis.analysis_mode === "incremental") {
        await appendDatabaseMigrationEvolution(
          repositoryId,
          databaseMigrationEvolution
        );
      } else {
        await replaceDatabaseMigrationEvolution(
          repositoryId,
          databaseMigrationEvolution
        );
      }

      const complexityCache = {
        get: (cacheKey: string) =>
          getAnalysisCache(
            repositoryId,
            "code_complexity",
            ANALYZER_VERSION,
            cacheKey
          ),
        set: (cacheKey: string, value: unknown) =>
          putAnalysisCache(
            repositoryId,
            "code_complexity",
            ANALYZER_VERSION,
            cacheKey,
            value
          )
      };

      const complexityEvolution =
        await discoverCodeComplexityEvolution(
          repository.storage_path,
          commits,
          complexityCache,
          analysis.analysis_mode === "incremental"
            ? analysis.base_head_sha
            : null
        );

      if (analysis.analysis_mode === "incremental") {
        await appendCodeComplexityEvolution(
          repositoryId,
          complexityEvolution.events
        );
      } else {
        await replaceCodeComplexityEvolution(
          repositoryId,
          complexityEvolution.events
        );
      }

      const couplingPairs = await rebuildFileChangeCoupling(
        repositoryId
      );

      await updateAnalysisRun(analysisRunId, "completed");

      return {
        status: "completed",
        repositoryId,
        analyzerVersion: ANALYZER_VERSION,
        analysisMode: analysis.analysis_mode,
        baseHeadSha: analysis.base_head_sha,
        targetHeadSha: analysis.target_head_sha,
        commitsDiscovered: commits.length,
        commitsPersisted: persistedCount,
        filesWithChurnEvidence: fileChurn.length,
        dependencySnapshots: dependencyEvolution.snapshots.length,
        dependencyChanges: dependencyEvolution.changes.length,
        architectureSnapshots: architectureEvolution.snapshots.length,
        architectureEvents: architectureEvolution.events.length,
        databaseMigrationEvents: databaseMigrationEvolution.length,
        complexityEvents: complexityEvolution.events.length,
        complexityCacheHits: complexityEvolution.cacheHits,
        complexityCacheMisses: complexityEvolution.cacheMisses,
        couplingPairs: couplingPairs
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown analysis error";

      const maxAttempts = job.opts.attempts ?? 1;
      const willRetry = job.attemptsMade + 1 < maxAttempts;

      if (willRetry) {
        console.error(
          `Analysis job ${job.id ?? "unknown"} failed; retrying:`,
          error
        );
        throw error;
      }

      try {
        await updateAnalysisRun(analysisRunId, "failed", {
          errorMessage: message
        });
      } catch (persistenceError) {
        console.error(
          `Failed to record analysis failure for ${analysisRunId}:`,
          persistenceError
        );
      }

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1
  }
);

analysisWorker.on("failed", (job, error) => {
  console.error(
    `Analysis job ${job?.id ?? "unknown"} failed:`,
    error
  );
});

let shuttingDown = false;

async function shutdownWorker(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(
    `Received ${signal}. Shutting down Project Autopsy worker...`
  );

  const forceExitTimer = setTimeout(() => {
    console.error("Worker graceful shutdown timed out.");
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    await analysisWorker.close();
    await redis.quit();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error("Worker shutdown failed:", error);
    await redis.quit().catch(() => undefined);
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdownWorker(signal);
  });
}
