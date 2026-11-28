import { randomUUID } from "node:crypto";

import {
  getRepositoryNameFromUrl,
  getRepositoryStoragePath
} from "./repository.service.js";
import { validateRemoteRepositoryUrl } from "./repository-url.js";
import { saveRepositoryAccessCredential } from "./repository-credentials.persistence.js";
import { encryptRepositoryAccessToken } from "./repository-credentials.js";
import {
  createPendingRepositoryWithAnalysis,
  updateAnalysisRun
} from "./repository.persistence.js";
import { enqueueRepositoryImport } from "../analysis/analysis.queue.js";
import { ANALYZER_VERSION } from "../../workers/queue.constants.js";
import { sanitizePublicAnalysisErrorMessage } from "../analysis/analysis-error.js";

export interface RepositoryImportInput {
  url: string;
  branch?: string | undefined;
  accessToken?: string | undefined;
  ownerUserId: string;
}

export interface RepositoryImportResult {
  repository: {
    id: string;
    source: string;
    name: string;
    trackedBranch: string | null;
    accessConfigured: boolean;
  };
  analysis: {
    id: string;
    status: "queued";
    mode: "full";
    jobId: string;
  };
}

export function getSourceType(url: string): "github" | "gitlab" | "bitbucket" {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname === "github.com") {
    return "github";
  }

  if (hostname === "gitlab.com") {
    return "gitlab";
  }

  return "bitbucket";
}

// Shared by manual URL import and GitHub one-click import: validates the remote,
// persists the repository and its queued analysis run, stores an optional access
// credential encrypted, and enqueues the clone. Queue failures mark the run failed.
export async function importRepositoryForUser(
  input: RepositoryImportInput
): Promise<RepositoryImportResult> {
  const safeUrl = validateRemoteRepositoryUrl(input.url);
  const repositoryId = randomUUID();
  const encryptedAccessCredential = input.accessToken
    ? encryptRepositoryAccessToken(input.accessToken)
    : null;

  const repository = await createPendingRepositoryWithAnalysis(
    {
      id: repositoryId,
      sourceType: getSourceType(safeUrl.toString()),
      sourceUrl: safeUrl.toString(),
      name: getRepositoryNameFromUrl(safeUrl),
      trackedBranch: input.branch ?? null,
      storagePath: getRepositoryStoragePath(repositoryId),
      ownerUserId: input.ownerUserId
    },
    ANALYZER_VERSION
  );

  try {
    if (encryptedAccessCredential) {
      await saveRepositoryAccessCredential(
        repository.repositoryId,
        encryptedAccessCredential
      );
    }

    const jobId = await enqueueRepositoryImport(
      repository.repositoryId,
      repository.analysisRunId,
      safeUrl.toString(),
      input.branch
    );

    return {
      repository: {
        id: repository.repositoryId,
        source: safeUrl.toString(),
        name: getRepositoryNameFromUrl(safeUrl),
        trackedBranch: input.branch ?? null,
        accessConfigured: Boolean(encryptedAccessCredential)
      },
      analysis: {
        id: repository.analysisRunId,
        status: "queued",
        mode: "full",
        jobId
      }
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "Failed to queue repository import.";
    const message =
      sanitizePublicAnalysisErrorMessage(
        rawMessage,
        getRepositoryStoragePath(repositoryId)
      ) ?? "Failed to queue repository import.";

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

    throw error;
  }
}
