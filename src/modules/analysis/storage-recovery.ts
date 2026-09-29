import type { StoredRepository } from "../repositories/repository.persistence.js";

export interface AnalysisStorageRecoveryDependencies {
  isRepositoryStorageReady(repositoryPath: string): Promise<boolean>;
  removeRepositoryStorage(repositoryId: string): Promise<void>;
  cloneRepository(
    repositoryId: string,
    remoteUrl: string,
    branch?: string
  ): Promise<unknown>;
  checkoutRepositoryAtCommit(
    repositoryPath: string,
    commitSha: string
  ): Promise<void>;
}

async function loadDefaultDependencies(): Promise<AnalysisStorageRecoveryDependencies> {
  const repositoryService = await import("../repositories/repository.service.js");

  return {
    isRepositoryStorageReady: repositoryService.isRepositoryStorageReady,
    removeRepositoryStorage: repositoryService.removeRepositoryStorage,
    cloneRepository: repositoryService.cloneRepository,
    checkoutRepositoryAtCommit: repositoryService.checkoutRepositoryAtCommit
  };
}

export async function prepareRepositoryStorageForAnalysis(
  repository: StoredRepository,
  targetHeadSha: string,
  dependencies?: AnalysisStorageRecoveryDependencies
): Promise<void> {
  if (!repository.storage_path) {
    throw new Error(
      `Repository storage path is missing: ${repository.id}`
    );
  }

  if (!repository.source_url || !repository.tracked_branch) {
    throw new Error(
      `Repository storage recovery metadata is incomplete: ${repository.id}`
    );
  }

  const deps = dependencies ?? (await loadDefaultDependencies());

  let rehydrated = false;

  if (!(await deps.isRepositoryStorageReady(repository.storage_path))) {
    await deps.removeRepositoryStorage(repository.id);
    await deps.cloneRepository(
      repository.id,
      repository.source_url,
      repository.tracked_branch
    );
    rehydrated = true;
  }

  try {
    await deps.checkoutRepositoryAtCommit(
      repository.storage_path,
      targetHeadSha
    );
  } catch (error) {
    if (rehydrated) {
      throw error;
    }

    await deps.removeRepositoryStorage(repository.id);
    await deps.cloneRepository(
      repository.id,
      repository.source_url,
      repository.tracked_branch
    );
    await deps.checkoutRepositoryAtCommit(
      repository.storage_path,
      targetHeadSha
    );
  }
}
