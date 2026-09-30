import assert from "node:assert/strict";
import test from "node:test";

import {
  isCorsOriginAllowed,
  parseCorsOrigins
} from "../src/config/cors.js";
import { requestIdMiddleware } from "../src/middleware/request-id.middleware.js";

test("CORS origin parsing trims whitespace and removes empty entries", () => {
  assert.deepEqual(
    parseCorsOrigins(" https://a.example,https://b.example, , https://a.example "),
    ["https://a.example", "https://b.example", "https://a.example"]
  );
  assert.deepEqual(parseCorsOrigins(undefined), []);
  assert.deepEqual(parseCorsOrigins("   "), []);
});

test("CORS allows requests without an Origin header", () => {
  assert.equal(
    isCorsOriginAllowed(undefined, "production", []),
    true
  );
});

test("non-production CORS mode permits arbitrary request origins", () => {
  for (const environment of ["development", "test"]) {
    assert.equal(
      isCorsOriginAllowed(
        "https://unlisted.example",
        environment,
        ["https://allowed.example"]
      ),
      true
    );
  }
});

test("production CORS mode requires an exact configured origin", () => {
  assert.equal(
    isCorsOriginAllowed(
      "https://allowed.example",
      "production",
      ["https://allowed.example"]
    ),
    true
  );

  for (const origin of [
    "https://allowed.example/",
    "HTTPS://allowed.example",
    "https://allowed.example.evil.example",
    "https://unlisted.example"
  ]) {
    assert.equal(
      isCorsOriginAllowed(
        origin,
        "production",
        ["https://allowed.example"]
      ),
      false
    );
  }
});

test("request id middleware preserves a valid UUID v4", () => {
  const request = {
    header: (name: string) =>
      name === "x-request-id"
        ? "550e8400-e29b-41d4-a716-446655440000"
        : undefined
  } as any;

  let nextCalled = false;
  let responseValue = "";

  requestIdMiddleware(
    request,
    {
      setHeader: (_name: string, value: string) => {
        responseValue = value;
        return {} as any;
      }
    } as any,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(responseValue, "550e8400-e29b-41d4-a716-446655440000");
});

test("request id middleware replaces invalid, empty and non-v4 UUID values", () => {
  for (const value of [
    "",
    "   ",
    "550e8400-e29b-11d4-a716-446655440000",
    "550e8400-e29b-41d4-c716-446655440000",
    "550e8400-e29b-41d4-a716-44665544000",
    "not-a-request-id"
  ]) {
    let responseValue = "";

    requestIdMiddleware(
      {
        header: () => value
      } as any,
      {
        setHeader: (_name: string, nextValue: string) => {
          responseValue = nextValue;
          return {} as any;
        }
      } as any,
      () => undefined
    );

    assert.match(
      responseValue,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  }
});

test("request id matching is case-insensitive but value is preserved", () => {
  const requestId = "550E8400-E29B-41D4-A716-446655440000";
  let responseValue = "";

  requestIdMiddleware(
    {
      header: () => requestId
    } as any,
    {
      setHeader: (_name: string, value: string) => {
        responseValue = value;
        return {} as any;
      }
    } as any,
    () => undefined
  );

  assert.equal(responseValue, requestId);
});
