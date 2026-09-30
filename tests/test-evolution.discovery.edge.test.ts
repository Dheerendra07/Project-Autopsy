import assert from "node:assert/strict";
import test from "node:test";

import {
  isMissingTestObjectError
} from "../src/modules/tests/test-evolution.discovery.js";

test("recognizes Git missing-path errors for deleted test files", () => {
  assert.equal(
    isMissingTestObjectError(
      new Error("fatal: path 'tests/example.test.ts' does not exist in 'abc123'")
    ),
    true
  );
});

test("does not hide unrelated Git test-source failures", () => {
  for (const error of [
    new Error("fatal: bad object abc123"),
    new Error("fatal: unable to read tree abc123"),
    new Error("fatal: repository is corrupt"),
    "network failure"
  ]) {
    assert.equal(isMissingTestObjectError(error), false);
  }
});
