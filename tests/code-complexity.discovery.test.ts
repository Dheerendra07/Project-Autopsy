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