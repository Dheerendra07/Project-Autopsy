import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import test from "node:test";

import {
  analyzeSourceCode,
  discoverCodeComplexityEvolution,
  isSupportedSourcePath
} from "../src/modules/complexity/complexity.discovery.js";
import { discoverCommits } from "../src/modules/commits/commit.discovery.js";

test("supports source files while excluding generated and declaration files", () => {
  assert.equal(isSupportedSourcePath("src/app.ts"), true);
  assert.equal(isSupportedSourcePath("src/component.tsx"), true);
  assert.equal(isSupportedSourcePath("src/app.js"), true);
  assert.equal(isSupportedSourcePath("node_modules/pkg/index.js"), false);
  assert.equal(isSupportedSourcePath("dist/app.js"), false);
  assert.equal(isSupportedSourcePath("src/types.d.ts"), false);
  assert.equal(isSupportedSourcePath("public/app.min.js"), false);
});

test("extracts deterministic complexity metrics from TypeScript", () => {
  const result = analyzeSourceCode(
    `class Service {
  async run(value: number) {
    if (value > 0) {
      for (const item of [1, 2]) {
        if (item && value > item) {
          return item;
        }
      }
    }
    return 0;
  }
}`,
    "src/service.ts"
  );

  assert.equal(result.status, "supported");
  assert.equal(result.parseErrorCount, 0);
  assert.equal(result.metrics?.classCount, 1);
  assert.equal(result.metrics?.functionCount, 1);
  assert.equal(result.metrics?.cyclomaticComplexity, 5);
  assert.equal(result.metrics?.maxNestingDepth, 3);
  assert.equal(result.metrics?.sourceLines, 12);
});

test("reports parse errors without persisting partial metrics", () => {
  const result = analyzeSourceCode(
    "function broken( {",
    "src/broken.ts"
  );

  assert.equal(result.status, "parse_error");
  assert.equal(result.metrics, null);
  assert.ok(result.parseErrorCount > 0);
});

test("parses NUL-separated Git tree blob records", async () => {
  const { parseBlobTree } = await import(
    "../src/modules/complexity/complexity.discovery.js"
  );

  const output =
    "100644 blob 0123456789abcdef0123456789abcdef01234567\tsrc/app.ts\0" +
    "040000 tree 89abcdef0123456789abcdef0123456789abcdef\tsrc\0" +
    "100644 blob fedcba9876543210fedcba9876543210fedcba98\tsrc/index.js\0";

  const blobs = parseBlobTree(output);

  assert.equal(
    blobs.get("src/app.ts"),
    "0123456789abcdef0123456789abcdef01234567"
  );
  assert.equal(
    blobs.get("src/index.js"),
    "fedcba9876543210fedcba9876543210fedcba98"
  );
  assert.equal(blobs.has("src"), false);
});

test("reuses cached analysis for identical Git blobs", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-complexity-")
  );

  try {
    const git = simpleGit(repositoryPath);

    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    const filePath = path.join(repositoryPath, "service.ts");

    await writeFile(
      filePath,
      "export function run(value: number) { return value + 1; }\n",
      "utf8"
    );
    await git.add("service.ts");
    await git.commit("add service");

    await writeFile(
      filePath,
      "export function run(value: number) { if (value > 0) return value + 1; return 0; }\n",
      "utf8"
    );
    await git.add("service.ts");
    await git.commit("modify service");

    const commits = await discoverCommits(repositoryPath);
    const values = new Map<string, unknown>();

    const cache = {
      get: async (cacheKey: string) =>
        values.get(cacheKey) ?? null,
      set: async (cacheKey: string, value: unknown) => {
        values.set(cacheKey, value);
      }
    };

    const first = await discoverCodeComplexityEvolution(
      repositoryPath,
      commits,
      cache
    );

    assert.equal(first.cacheHits, 0);
    assert.equal(first.cacheMisses, 2);
    assert.equal(values.size, 2);

    const second = await discoverCodeComplexityEvolution(
      repositoryPath,
      commits,
      cache
    );

    assert.equal(second.cacheHits, 2);
    assert.equal(second.cacheMisses, 0);
    assert.deepEqual(second.events, first.events);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("preserves exact blob lookup for unusual filenames", async () => {
  const repositoryPath = await mkdtemp(
    path.join(tmpdir(), "project-autopsy-complexity-blob-")
  );

  try {
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig("user.name", "Project Autopsy Test");
    await git.addConfig("user.email", "project-autopsy-test@example.com");

    const paths = [
      "src/a*.ts",
      "src/file\twith\ttab.ts",
      "src/file\nwith\nnewline.ts"
    ];

    for (const [index, filePath] of paths.entries()) {
      await writeFile(
        path.join(repositoryPath, filePath),
        "export const value" + index + " = " + index + ";\n",
        "utf8"
      );
    }

    await git.add(".");
    await git.commit("add exact blob paths");

    const head = (await git.revparse(["HEAD"])).trim();
    const outputs = await Promise.all(
      paths.map(async (filePath) =>
        (await git.raw(["rev-parse", "--verify", head + ":" + filePath])).trim()
      )
    );

    outputs.forEach((sha) => {
      assert.match(sha, /^[0-9a-f]{40}$/);
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
