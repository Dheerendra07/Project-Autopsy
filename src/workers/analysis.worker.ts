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
import { discoverTestEvolution } from "../modules/tests/test-evolution.discovery.js";
import {
  appendTestEvolution,
  replaceTestEvolution
} from "../modules/tests/test-evolution.persistence.js";
import {
  checkoutRepositoryAtCommit,
  cloneRepository,
  isCommitAncestor,
  isRepositoryStorageReady,
  refreshRepository,
  removeRepositoryStorage,
  getRepositoryStoragePath
} from "../modules/repositories/repository.service.js";
import {
  getRepositoryAccessCredential
} from "../modules/repositories/repository-credentials.persistence.js";
import {
  decryptRepositoryAccessToken
} from "../modules/repositories/repository-credentials.js";
import {
  enqueueRepositoryAnalysis
} from "../modules/analysis/analysis.queue.js";
import { planAnalysisRun } from "../modules/analysis/analysis-planner.js";
import {
  runWithAnalysisDeadline
} from "../modules/analysis/analysis-deadline.js";
import { prepareRepositoryStorageForAnalysis } from "../modules/analysis/storage-recovery.js";
import { classifyAnalysisJobRecovery } from "../modules/analysis/job-recovery.js";
import type { AnalysisJobData } from "../modules/analysis/analysis.queue.js";
import { sanitizePublicAnalysisErrorMessage } from "../modules/analysis/analysis-error.js";

export const ANALYSIS_WORKER_LOCK_DURATION_MS = 120_000;
export const ANALYSIS_WORKER_STALLED_INTERVAL_MS = 30_000;
export const ANALYSIS_WORKER_MAX_STALLED_COUNT = 1;

export const analysisWorker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE_NAME,
  async (job) =>
    runWithAnalysisDeadline(async (deadline) => {
      const { repositoryId, analysisRunId } = job.data;

      deadline.assertNotExpired();
      const jobKind = job.data.kind ?? "analyze";

    try {
      const initialAnalysis = await getAnalysisRunById(analysisRunId);

      if (!initialAnalysis || initialAnalysis.repository_id !== repositoryId) {
        throw new Error(
          `Analysis run not found: ${analysisRunId}`
        );
      }

      const recovery = classifyAnalysisJobRecovery({
        kind: jobKind,
        attemptsMade: job.attemptsMade,
        status: initialAnalysis.status,
        analysisMode: initialAnalysis.analysis_mode,
        targetHeadSha: initialAnalysis.target_head_sha
      });

      if (recovery.action === "already_completed") {
        return {
          status: "already-completed",
          repositoryId,
          analysisRunId,
          analysisMode: initialAnalysis.analysis_mode,
          targetHeadSha: initialAnalysis.target_head_sha
        };
      }

      if (recovery.action === "terminal_failed") {
        throw new Error(
          `Analysis run is already failed: ${analysisRunId}`
        );
      }

      if (recovery.action === "resume_import_analysis") {
        const analysisJobId = await enqueueRepositoryAnalysis(
          repositoryId,
          analysisRunId
        );

        return {
          status: "import-retry-resumed",
          repositoryId,
          analysisRunId,
          targetHeadSha: recovery.targetHeadSha,
          analysisJobId
        };
      }

      if (recovery.action === "resume_refresh_check") {
        deadline.assertNotExpired();

        await updateAnalysisRun(analysisRunId, "completed");

        return {
          status: "up-to-date",
          repositoryId,
          analysisRunId,
          targetHeadSha: recovery.targetHeadSha,
          analysisMode: "check"
        };
      }

      if (recovery.action === "resume_refresh_analysis") {
        const analysisJobId = await enqueueRepositoryAnalysis(
          repositoryId,
          analysisRunId
        );

        return {
          status: "refresh-retry-resumed",
          repositoryId,
          analysisRunId,
          analysisMode: recovery.analysisMode,
          targetHeadSha: recovery.targetHeadSha,
          analysisJobId
        };
      }

      await updateAnalysisRun(analysisRunId, "running");

      if (jobKind === "import") {
        if (!job.data.remoteUrl) {
          throw new Error(
            `Repository import URL is missing: ${analysisRunId}`
          );
        }

        await removeRepositoryStorage(repositoryId);

        const encryptedCredential =
          await getRepositoryAccessCredential(repositoryId);
        const accessToken = encryptedCredential
          ? decryptRepositoryAccessToken(encryptedCredential)
          : undefined;

        const metadata = await cloneRepository(
          repositoryId,
          job.data.remoteUrl,
          job.data.branch,
          accessToken
        );

        const trackedBranch =
          job.data.branch ?? metadata.defaultBranch;

        await updateRepositoryImportMetadata(
          repositoryId,
          metadata,
          trackedBranch
        );

        deadline.assertNotExpired();

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

      if (jobKind === "refresh") {
        if (
          !repository.source_url ||
          !repository.tracked_branch
        ) {
          throw new Error(
            `Repository refresh metadata is incomplete: ${repositoryId}`
          );
        }

        const storageReady = await isRepositoryStorageReady(
          repository.storage_path
        );

        if (!storageReady) {
          await removeRepositoryStorage(repository.id);
        }

        const encryptedCredential =
          await getRepositoryAccessCredential(repository.id);
        const accessToken = encryptedCredential
          ? decryptRepositoryAccessToken(encryptedCredential)
          : undefined;

        const metadata = storageReady
          ? await refreshRepository(
              repository.id,
              repository.source_url,
              repository.tracked_branch,
              accessToken
            )
          : await cloneRepository(
              repository.id,
              repository.source_url,
              repository.tracked_branch,
              accessToken
            );

        await updateRepositoryImportMetadata(
          repository.id,
          metadata,
          repository.tracked_branch
        );

        deadline.assertNotExpired();

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

      await prepareRepositoryStorageForAnalysis(
        repository,
        analysis.target_head_sha
      );

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

      const fileChurn = await discoverFileChurn(
        repository.storage_path
      );

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

      const databaseMigrationEvolution =
        await discoverDatabaseMigrationEvolution(
          repository.storage_path,
          commits
        );

      deadline.assertNotExpired();

      const testEvolution = await discoverTestEvolution(
        repository.storage_path,
        commits
      );

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

      const persistedCount =
        analysis.analysis_mode === "incremental"
          ? await persistCommitBatch(repositoryId, commits)
          : await replaceRepositoryCommitHistory(
              repositoryId,
              commits
            );

      deadline.assertNotExpired();

      await replaceFileChangeMetrics(repositoryId, fileChurn);

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

      if (analysis.analysis_mode === "incremental") {
        await appendTestEvolution(repositoryId, testEvolution);
      } else {
        await replaceTestEvolution(repositoryId, testEvolution);
      }

      deadline.assertNotExpired();

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

      deadline.assertNotExpired();

      const couplingPairs = await rebuildFileChangeCoupling(
        repositoryId
      );

      deadline.assertNotExpired();

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
        testEvolutionEvents: testEvolution.length,
        complexityEvents: complexityEvolution.events.length,
        complexityCacheHits: complexityEvolution.cacheHits,
        complexityCacheMisses: complexityEvolution.cacheMisses,
        couplingPairs: couplingPairs
      };
      } catch (error) {
        const rawMessage = deadline.expired
        ? "Analysis exceeded the configured time limit."
        : error instanceof Error
          ? error.message
          : "Unknown analysis error";
      const message =
        sanitizePublicAnalysisErrorMessage(
          rawMessage,
          getRepositoryStoragePath(repositoryId)
        ) ?? "Analysis failed.";

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
    }),
  {
    connection: redis,
    concurrency: 1,
    lockDuration: ANALYSIS_WORKER_LOCK_DURATION_MS,
    stalledInterval: ANALYSIS_WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: ANALYSIS_WORKER_MAX_STALLED_COUNT
  }
);

analysisWorker.on("failed", (job, error) => {
  console.error(
    `Analysis job ${job?.id ?? "unknown"} failed:`,
    error
  );
});

let shuttingDown = false;

export async function closeAnalysisWorker(): Promise<void> {
  await analysisWorker.close();
}

export async function shutdownWorker(signal: string): Promise<void> {
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
    await closeAnalysisWorker();
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

if (process.env.AUTOPSY_COMBINED_RUNTIME !== "1") {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void shutdownWorker(signal);
    });
  }
}
