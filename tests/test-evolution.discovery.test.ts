import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import test from "node:test";

import {
  analyzeTestSource,
  detectTestFramework,
  discoverTestEvolution,
  isTestEvolutionPath
} from "../src/modules/tests/test-evolution.discovery.js";

test("identifies test sources, configs, fixtures, and excludes ordinary source files", () => {
  assert.equal(isTestEvolutionPath("tests/user.test.ts"), true);
  assert.equal(
    isTestEvolutionPath("tests/integration/user.integration.test.ts"),
    true
  );
  assert.equal(isTestEvolutionPath("playwright.config.ts"), true);
  assert.equal(isTestEvolutionPath("tests/fixtures/user.json"), false);
  assert.equal(isTestEvolutionPath("src/test-utils.ts"), false);
  assert.equal(isTestEvolutionPath("src/user.service.ts"), false);
});

test("detects node:test and counts test structure deterministically", () => {
  const source = [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    "import { vi } from 'vitest';",
    "",
    'describe("users", () => {',
    '  beforeEach(() => {});',
    '  test("creates", () => {',
    '    expect(true).toBe(true);',
    '    assert.equal(1, 1);',
    "  });",
    '  it("loads", () => {',
    '    expect(true).toBe(true);',
    "  });",
    "});",
    "vi.mock('./users');"
  ].join("\n");

  assert.equal(detectTestFramework("tests/users.test.ts", source, null), "node_test");

  const metrics = analyzeTestSource(source);
  assert.equal(metrics.testCaseCount, 2);
  assert.equal(metrics.suiteCount, 1);
  assert.equal(metrics.hookCount, 1);
  assert.equal(metrics.assertionCount, 3);
  assert.equal(metrics.mockCount, 1);
});

test("classifies integration and end-to-end test paths", () => {
  assert.equal(
    isTestEvolutionPath("tests/integration/orders.integration.test.ts"),
    true
  );
  assert.equal(
    isTestEvolutionPath("e2e/checkout.e2e.spec.ts"),
    true
  );
});

test("discovers test evolution with before/after metrics and production coupling", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "project-autopsy-tests-")
  );
  const git = simpleGit(directory);

  try {
    await git.init();
    await git.addConfig("user.name", "Autopsy Test");
    await git.addConfig("user.email", "autopsy@test.invalid");

    await mkdir(path.join(directory, "src"), { recursive: true });
    await mkdir(path.join(directory, "tests", "integration"), {
      recursive: true
    });

    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({
        scripts: { test: "node --test" }
      }),
      "utf8"
    );

    const sourcePath = path.join(directory, "src", "users.service.ts");
    const testPath = path.join(
      directory,
      "tests",
      "integration",
      "users.integration.test.ts"
    );

    await writeFile(sourcePath, "export function users() { return []; }\n", "utf8");
    await writeFile(
      testPath,
      [
        'import test from "node:test";',
        'test("loads users", () => {});'
      ].join("\n"),
      "utf8"
    );

    await git.add(".");
    const first = await git.commit("test: add integration coverage");

    await writeFile(
      sourcePath,
      [
        "export function users() {",
        "  return [];",
        "}"
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      testPath,
      [
        'import test from "node:test";',
        'test("loads users", () => {});',
        'test("filters users", () => {});'
      ].join("\n"),
      "utf8"
    );

    await git.add(".");
    const second = await git.commit("test: expand integration coverage");

    await git.rm(testPath);
    const third = await git.commit("chore: remove stale test");

    const { discoverCommits } = await import(
      "../src/modules/commits/commit.discovery.js"
    );

    const commits = await discoverCommits(directory);
    const events = await discoverTestEvolution(directory, commits);

    assert.equal(events.length, 3);

    assert.equal(events[0]?.sha, first.commit);
    assert.equal(events[0]?.testType, "integration");
    assert.equal(events[0]?.framework, "node_test");
    assert.equal(events[0]?.testCaseCount, 1);
    assert.equal(events[0]?.previousTestCaseCount, 0);
    assert.equal(events[0]?.testCaseDelta, 1);
    assert.deepEqual(
      events[0]?.coChangedProductionFiles,
      ["src/users.service.ts"]
    );

    assert.equal(events[1]?.sha, second.commit);
    assert.equal(events[1]?.testCaseCount, 2);
    assert.equal(events[1]?.previousTestCaseCount, 1);
    assert.equal(events[1]?.testCaseDelta, 1);

    assert.equal(events[2]?.sha, third.commit);
    assert.equal(events[2]?.changeType, "deleted");
    assert.equal(events[2]?.analysisStatus, "deleted");
    assert.equal(events[2]?.testCaseCount, 0);
    assert.equal(events[2]?.previousTestCaseCount, 2);
    assert.equal(events[2]?.testCaseDelta, -2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
