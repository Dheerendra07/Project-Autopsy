import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import test from "node:test";
import {
  diffDependencyMaps,
  discoverDependencyEvolution
} from "../src/modules/dependencies/dependency.discovery.js";
import { diffDirectorySets } from "../src/modules/architecture/architecture.discovery.js";

test("detects dependency additions, removals, and spec changes deterministically", () => {
  const changes = diffDependencyMaps(
    { express: "^5.1.0", lodash: "^4.17.21" },
    { express: "^5.2.1", zod: "^4.6.5" }
  );

  assert.deepEqual(changes, [
    { packageName: "express", changeType: "changed", previousSpec: "^5.1.0", currentSpec: "^5.2.1" },
    { packageName: "lodash", changeType: "removed", previousSpec: "^4.17.21", currentSpec: null },
    { packageName: "zod", changeType: "added", previousSpec: null, currentSpec: "^4.6.5" }
  ]);
});

test("detects architecture directory additions and removals", () => {
  const events = diffDirectorySets(
    new Set(["modules", "routes"]),
    new Set(["modules", "workers"])
  );

  assert.deepEqual(events, [
    { eventType: "added", path: "workers" },
    { eventType: "removed", path: "routes" }
  ]);
});


test("seeds dependency evolution from the base head", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-dependency-")
  );

  try {
    const git = simpleGit(repositoryPath);

    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    await writeFile(
      path.join(repositoryPath, "package.json"),
      JSON.stringify({
        dependencies: {
          express: "^5.0.0"
        }
      }, null, 2) + "\n",
      "utf8"
    );
    await git.add("package.json");
    await git.commit("add package manifest");

    const baseHead = (await git.revparse(["HEAD"])).trim();

    await writeFile(
      path.join(repositoryPath, "package.json"),
      JSON.stringify({
        dependencies: {
          express: "^5.2.1",
          zod: "^4.6.5"
        }
      }, null, 2) + "\n",
      "utf8"
    );
    await git.add("package.json");
    await git.commit("update dependencies");

    const targetHead = (await git.revparse(["HEAD"])).trim();
    const commits = await git.log([baseHead + ".." + targetHead]);

    const evolution = await discoverDependencyEvolution(
      repositoryPath,
      commits.all.map((commit) => ({ sha: commit.hash })),
      { baseHeadSha: baseHead }
    );

    assert.deepEqual(evolution.changes, [
      {
        sha: targetHead,
        manifestPath: "package.json",
        packageManager: "npm",
        packageName: "express",
        scope: "dependencies",
        changeType: "changed",
        previousSpec: "^5.0.0",
        currentSpec: "^5.2.1"
      },
      {
        sha: targetHead,
        manifestPath: "package.json",
        packageManager: "npm",
        packageName: "zod",
        scope: "dependencies",
        changeType: "added",
        previousSpec: null,
        currentSpec: "^4.6.5"
      }
    ]);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("lists only immediate architecture directories without recursive tree reads", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-architecture-tree-")
  );

  try {
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    await mkdir(path.join(repositoryPath, "src", "foo", "nested"), { recursive: true });
    await mkdir(path.join(repositoryPath, "docs", "nested"), { recursive: true });
    await writeFile(path.join(repositoryPath, "src", "foo", "nested", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(path.join(repositoryPath, "docs", "nested", "readme.md"), "docs\n", "utf8");
    await git.add(".");
    await git.commit("architecture tree");

    const head = (await git.revparse(["HEAD"])).trim();
    const { discoverArchitectureEvolution } =
      await import("../src/modules/architecture/architecture.discovery.js");

    const result = await discoverArchitectureEvolution(
      repositoryPath,
      [{ sha: head }]
    );

    assert.deepEqual(result.snapshots, [
      {
        sha: head,
        rootPath: "root",
        directories: ["docs", "src"]
      },
      {
        sha: head,
        rootPath: "src",
        directories: ["foo"]
      }
    ]);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
