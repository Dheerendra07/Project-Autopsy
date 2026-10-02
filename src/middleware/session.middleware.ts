import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import {
  getSessionByTokenHash,
  touchSession
} from "../modules/auth/auth.persistence.js";
import {
  createSessionExpiry,
  hashOpaqueToken,
  safeEqualString
} from "../modules/auth/auth.crypto.js";

export const SESSION_COOKIE_NAME = "autopsy_session";
export const CSRF_COOKIE_NAME = "autopsy_csrf";

export interface AuthContext {
  userId: string;
  email: string;
  sessionId: string;
  csrfTokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const output: Record<string, string> = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      output[key] = decodeURIComponent(value);
    } catch {
      output[key] = value;
    }
  }

  return output;
}

export function getSessionCookie(
  request: Request
): string | undefined {
  return parseCookies(request.header("cookie"))[SESSION_COOKIE_NAME];
}

export function getCsrfCookie(
  request: Request
): string | undefined {
  return parseCookies(request.header("cookie"))[CSRF_COOKIE_NAME];
}

export function getAuthContext(
  request: Request
): AuthContext | undefined {
  return request.auth;
}

export async function authenticateSession(
  request: Request
): Promise<AuthContext | undefined> {
  const rawToken = getSessionCookie(request);
  if (!rawToken) {
    return undefined;
  }

  const session = await getSessionByTokenHash(hashOpaqueToken(rawToken));

  if (!session) {
    return undefined;
  }

  const context: AuthContext = {
    userId: session.user_id,
    email: session.email,
    sessionId: session.id,
    csrfTokenHash: session.csrf_token_hash
  };

  request.auth = context;

  const now = Date.now();
  const lastSeen = new Date(session.last_seen_at).getTime();

  if (!Number.isNaN(lastSeen) && now - lastSeen > 15 * 60 * 1_000) {
    await touchSession(session.id, createSessionExpiry());
  }

  return context;
}

export async function optionalSessionMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authenticateSession(request);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireSession(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  void authenticateSession(request)
    .then((auth) => {
      if (!auth) {
        response.status(401).json({
          success: false,
          error: {
            code: "AUTH_REQUIRED",
            message: "A signed-in account is required."
          }
        });
        return;
      }

      next();
    })
    .catch(next);
}

export function requireCsrf(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }

  const cookie = getCsrfCookie(request);
  const header = request.header("x-autopsy-csrf-token")?.trim();
  const auth = getAuthContext(request);
  const tokenMatchesSession =
    Boolean(auth?.csrfTokenHash) &&
    Boolean(cookie) &&
    auth?.csrfTokenHash === hashOpaqueToken(cookie as string);

  if (!cookie || !header || !safeEqualString(cookie, header) || !tokenMatchesSession) {
    response.status(403).json({
      success: false,
      error: {
        code: "CSRF_INVALID",
        message: "The security token is invalid or missing. Refresh the page and try again."
      }
    });
    return;
  }

  next();
}

export function setAuthCookies(
  response: Response,
  sessionToken: string,
  csrfToken: string,
  expiresAt: Date
): void {
  const secure = env.NODE_ENV === "production";
  const cookieBase = [
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000))}`,
    ...(secure ? ["Secure"] : [])
  ].join("; ");

  response.setHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; HttpOnly; ${cookieBase}`,
      `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${cookieBase}`
    ]
  );
}

export function clearAuthCookies(response: Response): void {
  const secure = env.NODE_ENV === "production";
  const cookieBase = [
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : [])
  ].join("; ");

  response.setHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE_NAME}=; HttpOnly; ${cookieBase}`,
      `${CSRF_COOKIE_NAME}=; ${cookieBase}`
    ]
  );
}
