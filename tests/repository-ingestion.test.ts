import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import test from "node:test";
import {
  applyNumstat,
  discoverCommits,
  parseCommitRecord
} from "../src/modules/commits/commit.discovery.js";
import { discoverFileChurn, parseNumstatLine } from "../src/modules/metrics/churn.discovery.js";
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
  assert.equal(commit.additions, 0);
  assert.equal(commit.deletions, 0);
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

test("derives commit-level additions and deletions from numstat", () => {
  const commit = parseCommitRecord(
    [
      [
        "abc1234",
        "",
        "Dev",
        "dev@example.com",
        "2026-01-01T10:00:00Z",
        "Dev",
        "dev@example.com",
        "2026-01-01T10:05:00Z",
        "feat: update app"
      ].join("\x1f"),
      "M\tsrc/app.ts"
    ].join("\n")
  );

  const stats = new Map([
    ["src/app.ts", { additions: 12, deletions: 5 }]
  ]);

  const withStats = applyNumstat(commit, stats);

  assert.equal(withStats.additions, 12);
  assert.equal(withStats.deletions, 5);
  assert.equal(withStats.files[0]?.additions, 12);
  assert.equal(withStats.files[0]?.deletions, 5);
});


test("preserves tab and newline filenames during commit discovery", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-special-paths-")
  );

  try {
    const git = simpleGit(repositoryPath);

    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    await writeFile(
      path.join(repositoryPath, "baseline.txt"),
      "baseline\n",
      "utf8"
    );
    await git.add(".");

    await git.commit("baseline");

    const tabPath = "file\twith\ttab.ts";
    const newlinePath = "file\nwith\nnewline.ts";

    await writeFile(
      path.join(repositoryPath, tabPath),
      "export const tab = true;\n",
      "utf8"
    );
    await writeFile(
      path.join(repositoryPath, newlinePath),
      "export const newline = true;\n",
      "utf8"
    );
    await git.add(".");
    await git.commit("add unusual paths");

    const commits = await discoverCommits(repositoryPath);
    const latest = commits.at(-1);

    assert.ok(latest);
    assert.equal(latest?.subject, "add unusual paths");
    assert.ok(
      latest?.files.some((file) => file.path === tabPath)
    );
    assert.ok(
      latest?.files.some((file) => file.path === newlinePath)
    );

    const tabFile = latest?.files.find(
      (file) => file.path === tabPath
    );
    const newlineFile = latest?.files.find(
      (file) => file.path === newlinePath
    );

    assert.ok(tabFile);
    assert.ok(newlineFile);
    assert.equal(tabFile.additions, 1);
    assert.equal(newlineFile.additions, 1);
    assert.equal(tabFile.deletions, 0);
    assert.equal(newlineFile.deletions, 0);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("discovers only commits after the supplied base head", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-range-")
  );

  try {
    const git = simpleGit(repositoryPath);

    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    const filePath = path.join(repositoryPath, "app.ts");

    await writeFile(filePath, "export const value = 1;\n", "utf8");
    await git.add("app.ts");
    await git.commit("add app");

    const baseHead = (await git.revparse(["HEAD"])).trim();

    await writeFile(filePath, "export const value = 2;\n", "utf8");
    await git.add("app.ts");
    await git.commit("update app");

    const targetHead = (await git.revparse(["HEAD"])).trim();

    const rangeCommits = await discoverCommits(repositoryPath, {
      fromExclusive: baseHead,
      toInclusive: targetHead
    });

    assert.equal(rangeCommits.length, 1);
    assert.equal(rangeCommits[0]?.subject, "update app");
    assert.equal(rangeCommits[0]?.sha, targetHead);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("preserves newline and tab filenames during file churn discovery", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-churn-special-paths-")
  );

  try {
    const git = simpleGit(repositoryPath);

    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    const tabPath = "churn\tfile.ts";
    const newlinePath = "churn\nfile.ts";

    await writeFile(
      path.join(repositoryPath, tabPath),
      "export const tab = true;\n",
      "utf8"
    );
    await writeFile(
      path.join(repositoryPath, newlinePath),
      "export const newline = true;\n",
      "utf8"
    );
    await git.add(".");
    await git.commit("special churn paths");

    const churn = await discoverFileChurn(repositoryPath);

    assert.equal(
      churn.find((item) => item.path === tabPath)?.additions,
      1
    );
    assert.equal(
      churn.find((item) => item.path === newlinePath)?.additions,
      1
    );
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});


test("applies numstat evidence page-by-page without a history-wide stats map", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-numstat-pages-")
  );

  try {
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    for (let index = 0; index < 3; index += 1) {
      await writeFile(
        path.join(repositoryPath, "file-" + index + ".ts"),
        "export const value = " + index + ";\n",
        "utf8"
      );
      await git.add(".");
      await git.commit("commit " + index);
    }

    const commits = await discoverCommits(repositoryPath);

    assert.equal(commits.length, 3);
    assert.deepEqual(
      commits.map((commit) => [commit.subject, commit.additions, commit.deletions]),
      [
        ["commit 0", 1, 0],
        ["commit 1", 1, 0],
        ["commit 2", 1, 0]
      ]
    );
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
