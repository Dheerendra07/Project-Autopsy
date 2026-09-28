import assert from "node:assert/strict";
import test from "node:test";
import { buildCouplingPairs, canonicalFilePair } from "../src/modules/coupling/coupling.discovery.js";

test("canonicalizes file pairs consistently", () => {
  assert.deepEqual(canonicalFilePair("z.ts", "a.ts"), {
    pathA: "a.ts",
    pathB: "z.ts"
  });
  assert.equal(canonicalFilePair("same.ts", "same.ts"), null);
});

test("builds unique deterministic pairs", () => {
  assert.deepEqual(buildCouplingPairs(["b.ts", "a.ts", "a.ts"]), [
    { pathA: "a.ts", pathB: "b.ts" }
  ]);
});
