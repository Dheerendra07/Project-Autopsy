import assert from "node:assert/strict";
import test from "node:test";

import {
  isMissingPackageManifestError
} from "../src/modules/dependencies/dependency.discovery.js";

test("recognizes Git's missing package.json error", () => {
  assert.equal(
    isMissingPackageManifestError(
      new Error("fatal: path 'package.json' does not exist in 'abc123'")
    ),
    true
  );
});

test("does not classify unrelated Git failures as a missing manifest", () => {
  for (const error of [
    new Error("fatal: bad object abc123"),
    new Error("fatal: repository is corrupt"),
    new Error("fatal: unable to read tree abc123"),
    "network failure"
  ]) {
    assert.equal(isMissingPackageManifestError(error), false);
  }
});
