import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { simpleGit } from "simple-git";

import {
  assertRepositoryId,
  assertSafeBranchName,
  calculateDirectorySize,
  cloneRepository,
  getRepositoryStoragePath,
  assertManagedRepositoryStoragePath,
  isRepositoryStorageReady,
  isSafeBranchName
} from "../src/modules/repositories/repository.service.js";

test("accepts safe Git branch names", () => {
  for (const branch of [
    "main",
    "develop",
    "feature/runtime-hardening",
    "release/2026.09",
    "hotfix/v1.2.3",
    "feature/-internal"
  ]) {
    assert.equal(isSafeBranchName(branch), true, branch);
    assert.doesNotThrow(() => assertSafeBranchName(branch), branch);
  }
});

test("rejects branch names that can be ambiguous or invalid Git refs", () => {
  for (const branch of [
    "",
    "-",
    "--upload-pack=malicious",
    "..",
    "feature/../main",
    "feature//main",
    "feature/@{bad",
    "feature/name.",
    "feature/name/",
    "@",
    ".hidden",
    "feature/.hidden",
    "feature/name.lock",
    "feature name",
    "feature:name",
    "feature~name",
    "feature^name",
    "feature?name",
    "feature*name",
    "feature[name]",
    "feature\\name"
  ]) {
    assert.equal(isSafeBranchName(branch), false, branch);
    assert.throws(() => assertSafeBranchName(branch), /Repository branch is invalid/);
  }
});

async function makeTempDirectory(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "project-autopsy-" + prefix));
}

test("counts regular files and nested directories without following symlinks", async (t) => {
  const root = await makeTempDirectory("size-");
  const outside = await makeTempDirectory("outside-");

  try {
    const nested = path.join(root, "nested");
    await mkdir(nested);
    await writeFile(path.join(root, "root.txt"), "12345");
    await writeFile(path.join(nested, "nested.txt"), "1234567");
    await writeFile(path.join(outside, "secret.txt"), "this file is outside the repository storage");
    
    try {
      await symlink(
        path.join(outside, "secret.txt"),
        path.join(root, "linked-secret.txt")
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "EACCES")
      ) {
        t.skip("symlink creation is unavailable in this environment");
        return;
      }
      throw error;
    }

    const expected =
      Buffer.byteLength("12345") +
      Buffer.byteLength("1234567");

    assert.equal(await calculateDirectorySize(root), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("does not treat a symlinked .git path as ready storage", async (t) => {
  const root = await makeTempDirectory("git-link-");
  const outside = await makeTempDirectory("git-target-");

  try {
    try {
      await symlink(outside, path.join(root, ".git"));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "EACCES")
      ) {
        t.skip("symlink creation is unavailable in this environment");
        return;
      }
      throw error;
    }

    assert.equal(await isRepositoryStorageReady(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("requires an actual .git directory for ready repository storage", async () => {
  const root = await makeTempDirectory("git-dir-");

  try {
    const git = simpleGit(root);
    await git.init();
    assert.equal(await isRepositoryStorageReady(root), true);

    const gitStat = await lstat(path.join(root, ".git"));
    assert.equal(gitStat.isDirectory(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("invalid clone branch is rejected before repository storage is allocated", async () => {
  const repositoryId = "00000000-0000-4000-8000-000000000997";

  await assert.doesNotReject(
    rm(getRepositoryStoragePath(repositoryId), {
      recursive: true,
      force: true
    })
  );

  await assert.rejects(
    () =>
      cloneRepository(
        repositoryId,
        "https://github.com/octocat/Hello-World.git",
        "../main"
      ),
    /Repository branch is invalid/
  );

  await assert.rejects(
    access(getRepositoryStoragePath(repositoryId)),
    /ENOENT/
  );
});


test("repository storage ids are strict UUID-shaped identifiers", () => {
  const valid = "00000000-0000-4000-8000-000000000997";

  assert.doesNotThrow(() => assertRepositoryId(valid));

  for (const value of [
    "../escape",
    "../../tmp",
    "00000000-0000-4000-8000-000000000997/extra",
    "00000000-0000-4000-8000-00000000099x",
    ""
  ]) {
    assert.throws(
      () => assertRepositoryId(value),
      /Repository id is invalid/
    );
  }

  assert.equal(
    getRepositoryStoragePath(valid).endsWith(path.join(
      valid
    )),
    true
  );
});


test("repository storage deletion accepts only paths inside the managed root", () => {
  const managed = getRepositoryStoragePath(
    "00000000-0000-4000-8000-000000000997"
  );

  assert.doesNotThrow(() => assertManagedRepositoryStoragePath(managed));
  assert.doesNotThrow(() =>
    assertManagedRepositoryStoragePath(path.join(managed, "nested"))
  );

  const filesystemRoot = path.parse(managed).root;

  for (const value of [
    filesystemRoot,
    path.join(filesystemRoot, "project-autopsy-outside"),
    path.resolve(managed, "../.."),
    path.resolve(managed, "../../outside/nested")
  ]) {
    assert.throws(
      () => assertManagedRepositoryStoragePath(value),
      /outside the managed storage root/
    );
  }
});
