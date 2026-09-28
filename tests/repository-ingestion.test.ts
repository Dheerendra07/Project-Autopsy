import assert from "node:assert/strict";
import test from "node:test";
import { parseCommitRecord } from "../src/modules/commits/commit.discovery.js";
import { parseNumstatLine } from "../src/modules/metrics/churn.discovery.js";
import { isBugSignalSubject } from "../src/modules/metrics/bug-signals.js";
import { validateRemoteRepositoryUrl } from "../src/modules/repositories/repository-url.js";

test("parses commit metadata and changed files", () => {
  const header = [
    "abc1234",
    "parent1 parent2",
    "Dev",
    "dev@example.com",
    "2026-01-01T10:00:00Z",
    "Dev",
    "dev@example.com",
    "2026-01-01T10:05:00Z",
    "feat: add timeline"
  ].join("\x1f");

  const commit = parseCommitRecord(
    [header, "A\t src/timeline.ts"].join("\n")
  );

  assert.equal(commit.sha, "abc1234");
  assert.deepEqual(commit.parentShas, ["parent1", "parent2"]);
  assert.equal(commit.files.length, 1);
  assert.equal(commit.files[0]?.status, "A");
  assert.equal(commit.files[0]?.path, " src/timeline.ts");
});

test("accepts a commit with an empty subject", () => {
  const header = [
    "def5678",
    "",
    "Dev",
    "dev@example.com",
    "2026-01-02T10:00:00Z",
    "Dev",
    "dev@example.com",
    "2026-01-02T10:01:00Z",
    ""
  ].join("\x1f");

  const commit = parseCommitRecord(header);

  assert.equal(commit.sha, "def5678");
  assert.equal(commit.subject, "");
  assert.deepEqual(commit.parentShas, []);
});

test("rejects repository URL credentials", () => {
  assert.throws(
    () =>
      validateRemoteRepositoryUrl(
        "https://token@github.com/owner/repo.git"
      ),
    /Repository credentials must not be embedded/
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

test("parses numeric numstat evidence", () => {
  const metric = parseNumstatLine("12\t5\tsrc/app.ts");

  assert.deepEqual(metric, {
    path: "src/app.ts",
    additions: 12,
    deletions: 5,
    binary: false
  });
});

test("records binary numstat evidence without inventing line counts", () => {
  const metric = parseNumstatLine("-\t-\tassets/logo.png");

  assert.deepEqual(metric, {
    path: "assets/logo.png",
    additions: 0,
    deletions: 0,
    binary: true
  });
});

test("ignores non-numstat lines", () => {
  assert.equal(parseNumstatLine("commit header"), null);
});

test("detects explicit bug-fix subjects", () => {
  assert.equal(isBugSignalSubject("fix: handle session timeout"), true);
  assert.equal(isBugSignalSubject("regression in checkout flow"), true);
  assert.equal(isBugSignalSubject("refactor: simplify service"), false);
  assert.equal(isBugSignalSubject("prefix parser cleanup"), false);
});
