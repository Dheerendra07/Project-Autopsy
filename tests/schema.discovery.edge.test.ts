import assert from "node:assert/strict";
import test from "node:test";

import {
  isMissingGitPathError
} from "../src/modules/schema/schema.discovery.js";

test("recognizes Git missing-path errors used for deleted migration objects", () => {
  assert.equal(
    isMissingGitPathError(
      new Error("fatal: path 'migrations/001.sql' does not exist in 'abc123'")
    ),
    true
  );
});

test("does not hide unrelated Git migration read failures", () => {
  for (const error of [
    new Error("fatal: bad object abc123"),
    new Error("fatal: unable to read tree abc123"),
    new Error("fatal: repository is corrupt"),
    "network failure"
  ]) {
    assert.equal(isMissingGitPathError(error), false);
  }
});
