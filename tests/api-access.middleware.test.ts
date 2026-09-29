import assert from "node:assert/strict";
import test from "node:test";

import { isApiAccessAuthorized } from "../src/middleware/apiAccess.middleware.js";

test("development permits API access when no key is configured", () => {
  assert.equal(
    isApiAccessAuthorized(undefined, undefined, undefined, "development"),
    true
  );
});

test("production rejects API access when no key is configured", () => {
  assert.equal(
    isApiAccessAuthorized(undefined, undefined, undefined, "production"),
    false
  );
});

test("accepts the exact configured API key via header", () => {
  assert.equal(
    isApiAccessAuthorized(
      undefined,
      "production-api-key",
      "production-api-key",
      "production"
    ),
    true
  );
});

test("accepts the exact configured API key via bearer authorization", () => {
  assert.equal(
    isApiAccessAuthorized(
      "Bearer production-api-key",
      undefined,
      "production-api-key",
      "production"
    ),
    true
  );
});

test("rejects an incorrect API key", () => {
  assert.equal(
    isApiAccessAuthorized(
      "Bearer wrong-key",
      undefined,
      "production-api-key",
      "production"
    ),
    false
  );
});

test("header API key takes precedence over bearer fallback", () => {
  assert.equal(
    isApiAccessAuthorized(
      "Bearer wrong-key",
      "production-api-key",
      "production-api-key",
      "production"
    ),
    true
  );
});
