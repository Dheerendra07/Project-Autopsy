import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareRepositoryStorageForAnalysis,
  type AnalysisStorageRecoveryDependencies
} from "../src/modules/analysis/storage-recovery.js";

function repositoryFixture() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    source_type: "github",
    source_url: "https://github.com/example/project",
    name: "project",
    default_branch: "main",
    tracked_branch: "main",
    head_sha: "a".repeat(40),
    storage_path: "/storage/project"
  };
}

function dependencies(
  overrides: Partial<{
    ready: boolean;
    checkoutFailures: number;
  }> = {}
): {
  deps: AnalysisStorageRecoveryDependencies;
  calls: string[];
} {
  const calls: string[] = [];
  let checkoutFailures = overrides.checkoutFailures ?? 0;

  const deps: AnalysisStorageRecoveryDependencies = {
    async isRepositoryStorageReady(path) {
      calls.push(`ready:${path}`);
      return overrides.ready ?? true;
    },
    async removeRepositoryStorage(repositoryId) {
      calls.push(`remove:${repositoryId}`);
    },
    async cloneRepository(repositoryId, url, branch) {
      calls.push(`clone:${repositoryId}:${url}:${branch}`);
    },
    async checkoutRepositoryAtCommit(path, sha) {
      calls.push(`checkout:${path}:${sha}`);
      if (checkoutFailures > 0) {
        checkoutFailures -= 1;
        throw new Error("checkout failed");
      }
    }
  };

  return { deps, calls };
}

test("uses the existing checkout when repository storage is healthy", async () => {
  const { deps, calls } = dependencies({ ready: true });

  await prepareRepositoryStorageForAnalysis(
    repositoryFixture(),
    "b".repeat(40),
    deps
  );

  assert.deepEqual(calls, [
    "ready:/storage/project",
    `checkout:/storage/project:${"b".repeat(40)}`
  ]);
});

test("re-hydrates missing ephemeral storage before checking out the persisted target", async () => {
  const { deps, calls } = dependencies({ ready: false });

  await prepareRepositoryStorageForAnalysis(
    repositoryFixture(),
    "b".repeat(40),
    deps
  );

  assert.deepEqual(calls, [
    "ready:/storage/project",
    "remove:00000000-0000-4000-8000-000000000001",
    "clone:00000000-0000-4000-8000-000000000001:https://github.com/example/project:main",
    `checkout:/storage/project:${"b".repeat(40)}`
  ]);
});

test("re-clones once when an existing checkout is present but unusable", async () => {
  const { deps, calls } = dependencies({
    ready: true,
    checkoutFailures: 1
  });

  await prepareRepositoryStorageForAnalysis(
    repositoryFixture(),
    "b".repeat(40),
    deps
  );

  assert.deepEqual(calls, [
    "ready:/storage/project",
    `checkout:/storage/project:${"b".repeat(40)}`,
    "remove:00000000-0000-4000-8000-000000000001",
    "clone:00000000-0000-4000-8000-000000000001:https://github.com/example/project:main",
    `checkout:/storage/project:${"b".repeat(40)}`
  ]);
});

test("does not loop recovery when a freshly cloned repository still lacks the target commit", async () => {
  const { deps, calls } = dependencies({
    ready: false,
    checkoutFailures: 1
  });

  await assert.rejects(
    () =>
      prepareRepositoryStorageForAnalysis(
        repositoryFixture(),
        "b".repeat(40),
        deps
      ),
    /checkout failed/
  );

  assert.equal(
    calls.filter((call) => call.startsWith("clone:")).length,
    1
  );
});

test("fails before recovery when required repository metadata is missing", async () => {
  const repository = {
    ...repositoryFixture(),
    tracked_branch: null
  };

  const { deps, calls } = dependencies({ ready: false });

  await assert.rejects(
    () =>
      prepareRepositoryStorageForAnalysis(
        repository,
        "b".repeat(40),
        deps
      ),
    /storage recovery metadata is incomplete/
  );

  assert.deepEqual(calls, []);
});
