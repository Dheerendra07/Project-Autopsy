import assert from "node:assert/strict";
import test from "node:test";

import {
  findMatchingRepositoryImport,
  normalizeRepositoryImportUrl
} from "../src/modules/repositories/repository-import-match.js";

const repositories = [
  {
    id: "default",
    source_url: "https://github.com/Example/Project.git",
    tracked_branch: "main",
    default_branch: "main"
  },
  {
    id: "feature",
    source_url: "https://github.com/example/project",
    tracked_branch: "feature/ui",
    default_branch: "main"
  },
  {
    id: "pending",
    source_url: "https://github.com/example/pending",
    tracked_branch: null,
    default_branch: null
  }
];

test("repository import URLs normalize host/path case, trailing slash and .git", () => {
  assert.equal(
    normalizeRepositoryImportUrl("https://GitHub.com/Example/Project.git/"),
    "https://github.com/example/project"
  );
});

test("the default import reuses a repository already tracking its default branch", () => {
  assert.equal(
    findMatchingRepositoryImport(repositories, "https://github.com/example/project/")?.id,
    "default"
  );
});

test("an explicit branch only reuses the same tracked branch", () => {
  assert.equal(
    findMatchingRepositoryImport(
      repositories,
      "https://github.com/example/project",
      "feature/ui"
    )?.id,
    "feature"
  );
  assert.equal(
    findMatchingRepositoryImport(
      repositories,
      "https://github.com/example/project",
      "main"
    )?.id,
    "default"
  );
});

test("a pending default-branch import is reusable before clone metadata arrives", () => {
  assert.equal(
    findMatchingRepositoryImport(repositories, "https://github.com/example/pending")?.id,
    "pending"
  );
});

test("invalid URLs never match", () => {
  assert.equal(
    findMatchingRepositoryImport(repositories, "not a URL"),
    null
  );
});
