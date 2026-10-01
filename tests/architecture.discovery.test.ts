import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { simpleGit } from "simple-git";

import { discoverArchitectureEvolution } from "../src/modules/architecture/architecture.discovery.js";

test("treats a commit without a src directory as an empty src architecture scope", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-architecture-")
  );

  try {
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");
    await writeFile(
      path.join(repositoryPath, "README.md"),
      "# test\n",
      "utf8"
    );
    await git.add(".");
    await git.commit("initial repository without src");

    const head = (await git.revparse(["HEAD"])).trim();
    const result = await discoverArchitectureEvolution(
      repositoryPath,
      [{ sha: head }]
    );

    assert.deepEqual(result.snapshots, [
      {
        sha: head,
        rootPath: "root",
        directories: []
      },
      {
        sha: head,
        rootPath: "src",
        directories: []
      }
    ]);
    assert.deepEqual(result.events, []);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
