import assert from "node:assert/strict";
import test from "node:test";

import {
  isCorsOriginAllowed,
  parseCorsOrigins
} from "../src/config/cors.js";

test("parses comma-separated CORS origins deterministically", () => {
  assert.deepEqual(
    parseCorsOrigins(" https://app.example.com,https://admin.example.com "),
    ["https://app.example.com", "https://admin.example.com"]
  );
  assert.deepEqual(parseCorsOrigins(undefined), []);
  assert.deepEqual(parseCorsOrigins("   "), []);
});

test("allows non-browser requests without an Origin header", () => {
  assert.equal(
    isCorsOriginAllowed(undefined, "production", []),
    true
  );
});

test("keeps non-production CORS behavior permissive", () => {
  assert.equal(
    isCorsOriginAllowed("https://local.example", "test", []),
    true
  );
});

test("production accepts only explicitly configured origins", () => {
  const origins = parseCorsOrigins("https://app.example.com");

  assert.equal(
    isCorsOriginAllowed("https://app.example.com", "production", origins),
    true
  );
  assert.equal(
    isCorsOriginAllowed("https://evil.example.com", "production", origins),
    false
  );
});
