import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";

import {
  getAuthContext,
  getCsrfCookie,
  requireCsrf,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  setAuthCookies
} from "../src/middleware/session.middleware.js";
import { hashOpaqueToken } from "../src/modules/auth/auth.crypto.js";

function response(): Response & { headers: Map<string,string> } {
  const headers = new Map<string,string>();
  return {
    headers,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    }
  } as unknown as Response & { headers: Map<string,string> };
}

test("auth cookies are distinct and the session cookie is HttpOnly", () => {
  const res = response();
  const expiry = new Date(Date.now() + 60_000);
  setAuthCookies(res, "session-token", "csrf-token", expiry);

  const header = res.headers.get("set-cookie") ?? "";
  assert.match(header, new RegExp(SESSION_COOKIE_NAME + "=session-token"));
  assert.match(header, new RegExp(CSRF_COOKIE_NAME + "=csrf-token"));
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
});

test("CSRF middleware rejects a missing token", async () => {
  let called = false;
  const req = {
    method: "POST",
    header(name: string) {
      if (name.toLowerCase() === "cookie") return "";
      return undefined;
    },
    auth: undefined
  } as unknown as Request;
  const res = {
    status(code: number) {
      assert.equal(code, 403);
      return this;
    },
    json(body: unknown) {
      assert.deepEqual(body, {
        success: false,
        error: {
          code: "CSRF_INVALID",
          message: "The security token is invalid or missing. Refresh the page and try again."
        }
      });
      return this;
    }
  } as unknown as Response;

  requireCsrf(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(getAuthContext(req), undefined);
  assert.equal(getCsrfCookie(req), "");
});

test("CSRF middleware accepts a token only when it matches the session-bound token hash", () => {
  const csrfToken = "csrf-token-for-test";
  let called = false;

  const req = {
    method: "POST",
    header(name: string) {
      const key = name.toLowerCase();
      if (key === "cookie") {
        return CSRF_COOKIE_NAME + "=" + encodeURIComponent(csrfToken);
      }
      if (key === "x-autopsy-csrf-token") {
        return csrfToken;
      }
      return undefined;
    },
    auth: {
      userId: "00000000-0000-0000-0000-000000000001",
      email: "owner@example.com",
      sessionId: "00000000-0000-0000-0000-000000000002",
      csrfTokenHash: hashOpaqueToken(csrfToken)
    }
  } as unknown as Request;

  const res = {} as Response;

  requireCsrf(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});
