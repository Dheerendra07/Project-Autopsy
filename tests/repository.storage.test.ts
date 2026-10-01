import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

test("reports an initialized Git repository as ready", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-ready-storage-")
  );

  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(directory);
    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");
    await writeFile(path.join(directory, "README.md"), "ready\n", "utf8");
    await git.add(".");
    await git.commit("ready storage");

    assert.equal(await isRepositoryStorageReady(directory), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a corrupt Git storage directory", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-corrupt-storage-")
  );

  try {
    await mkdir(path.join(directory, ".git"));
    await writeFile(
      path.join(directory, ".git", "HEAD"),
      "this is not a valid git repository\n",
      "utf8"
    );

    assert.equal(await isRepositoryStorageReady(directory), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
