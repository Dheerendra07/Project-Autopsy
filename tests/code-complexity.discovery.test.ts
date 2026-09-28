import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSourceCode,
  isSupportedSourcePath
} from "../src/modules/complexity/complexity.discovery.js";

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