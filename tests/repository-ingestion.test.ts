import assert from "node:assert/strict";
import test from "node:test";
import { parseCommitRecord } from "../src/modules/commits/commit.discovery.js";
import { validateRemoteRepositoryUrl } from "../src/modules/repositories/repository-url.js";

test("parses commit metadata and changed files", () => {
  const commit = parseCommitRecord(
    [
      "abc1234\x1fparent1 parent2\x1fDev\x1fdev@example.com\x12026-01-01T10:00:00Z\x1fDev\x1fdev@example.com\x12026-01-01T10:05:00Z\x1ffeat: add timeline",
      "A\t src/timeline.ts"
    ].join("\n")
  );

  assert.equal(commit.sha, "abc1234");
  assert.deepEqual(commit.parentShas, ["parent1", "parent2"]);
  assert.equal(commit.files.length, 1);
  assert.equal(commit.files[0]?.status, "A");
  assert.equal(commit.files[0]?.path, " src/timeline.ts");
});

test("rejects repository URL credentials", () => {
  assert.throws(
    () =>
      validateRemoteRepositoryUrl(
        "https://token@example.com/owner/repo.git"
      ),
    /Repository host is not supported/
  );
});

test("accepts supported HTTPS repository URLs", () => {
  const url = validateRemoteRepositoryUrl(
    "https://github.com/Owner/Repo.git"
  );

  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "github.com");
  assert.equal(url.pathname, "/Owner/Repo.git");
});
