import assert from "node:assert/strict";
import test from "node:test";

import { requestIdMiddleware } from "../src/middleware/request-id.middleware.js";

function createResponse() {
  const headers = new Map<string, string>();

  return {
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    }
  };
}

function createRequest(requestId?: string) {
  return {
    header(name: string) {
      if (name.toLowerCase() !== "x-request-id") {
        return undefined;
      }
      return requestId;
    }
  };
}

test("generates a UUID request id when none is supplied", () => {
  const req = createRequest();
  const res = createResponse();
  let called = false;

  requestIdMiddleware(
    req as never,
    res as never,
    () => {
      called = true;
    }
  );

  assert.equal(called, true);
  assert.match(
    String(res.getHeader("x-request-id")),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test("preserves a valid UUID request id", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const req = createRequest(requestId);
  const res = createResponse();

  requestIdMiddleware(req as never, res as never, () => undefined);

  assert.equal(res.getHeader("x-request-id"), requestId);
});

test("replaces an invalid request id", () => {
  const req = createRequest("not-a-uuid");
  const res = createResponse();

  requestIdMiddleware(req as never, res as never, () => undefined);

  assert.notEqual(res.getHeader("x-request-id"), "not-a-uuid");
  assert.match(
    String(res.getHeader("x-request-id")),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});
