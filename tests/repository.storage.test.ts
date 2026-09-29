import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { isRepositoryStorageReady } from "../src/modules/repositories/repository.service.js";

test("reports missing repository storage as not ready", async () => {
  const directory = path.join(
    tmpdir(),
    "project-autopsy-missing-storage-" + Date.now()
  );

  assert.equal(await isRepositoryStorageReady(directory), false);
});

test("reports a Git repository storage directory as ready", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-ready-storage-")
  );

  try {
    await mkdir(path.join(directory, ".git"));
    assert.equal(await isRepositoryStorageReady(directory), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
