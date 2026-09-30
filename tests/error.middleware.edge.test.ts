import assert from "node:assert/strict";
import test from "node:test";

import {
  isBodyParserError
} from "../src/middleware/error.middleware.js";

test("body parser classifier accepts only explicit parser error types", () => {
  for (const [type, status] of [
    ["entity.too.large", 413],
    ["encoding.unsupported", 415],
    ["entity.parse.failed", 400]
  ] as const) {
    const error = { type } as { type: string; status?: number };
    assert.equal(isBodyParserError(error), true);
    assert.equal(error.status, status);
  }
});

test("body parser classifier does not infer parser errors from status alone", () => {
  for (const error of [
    { status: 400 },
    { status: 413 },
    { statusCode: 415 },
    new Error("ordinary application failure"),
    null,
    "entity.parse.failed"
  ]) {
    assert.equal(isBodyParserError(error), false);
  }
});
