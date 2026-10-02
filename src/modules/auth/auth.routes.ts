import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  createOpaqueToken,
  createSessionExpiry,
  hashOpaqueToken,
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword
} from "./auth.crypto.js";
import {
  createSession,
  createUser,
  getPasswordHashByUserId,
  getUserByEmail,
  revokeAllUserSessions,
  revokeSession,
  updateLastLogin
} from "./auth.persistence.js";
import {
  clearAuthCookies,
  getAuthContext,
  requireCsrf,
  requireSession,
  setAuthCookies
} from "../../middleware/session.middleware.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
});

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function publicUser(user: {
  id: string;
  email: string;
  created_at?: string;
  last_login_at: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    ...(user.created_at ? { createdAt: user.created_at } : {}),
    lastLoginAt: user.last_login_at
  };
}

async function startSession(
  request: Parameters<typeof getAuthContext>[0],
  response: Parameters<typeof setAuthCookies>[0],
  user: { id: string }
): Promise<void> {
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const expiresAt = createSessionExpiry();

  await createSession(
    randomUUID(),
    user.id,
    hashOpaqueToken(sessionToken),
    hashOpaqueToken(csrfToken),
    expiresAt,
    request.get("user-agent")
  );

  setAuthCookies(response, sessionToken, csrfToken, expiresAt);
}

authRouter.post("/register", async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body);
    const existing = await getUserByEmail(input.email);

    if (existing) {
      response.status(409).json({
        success: false,
        error: {
          code: "ACCOUNT_EXISTS",
          message: "An account already exists for that email address."
        }
      });
      return;
    }

    let user: Awaited<ReturnType<typeof createUser>>;
    try {
      user = await createUser(
        randomUUID(),
        input.email,
        await hashPassword(input.password)
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        response.status(409).json({
          success: false,
          error: {
            code: "ACCOUNT_EXISTS",
            message: "An account already exists for that email address."
          }
        });
        return;
      }
      throw error;
    }

    await startSession(request, response, user);

    response.status(201).json({
      success: true,
      user: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body);
    const user = await getUserByEmail(input.email);

    if (!user || user.disabled_at) {
      response.status(401).json({
        success: false,
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Email or password is incorrect."
        }
      });
      return;
    }

    const passwordHash = await getPasswordHashByUserId(user.id);
    const valid = passwordHash
      ? await verifyPassword(input.password, passwordHash)
      : false;

    if (!valid) {
      response.status(401).json({
        success: false,
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Email or password is incorrect."
        }
      });
      return;
    }

    await updateLastLogin(user.id);
    await startSession(request, response, user);

    response.json({
      success: true,
      user: publicUser({
        ...user,
        last_login_at: new Date().toISOString()
      })
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireSession, (request, response) => {
  const auth = getAuthContext(request);

  if (!auth) {
    return;
  }

  response.json({
    success: true,
    user: {
      id: auth.userId,
      email: auth.email
    }
  });
});

authRouter.post(
  "/logout",
  requireSession,
  requireCsrf,
  async (request, response, next) => {
    try {
      const auth = getAuthContext(request);

      if (auth) {
        await revokeSession(auth.sessionId);
      }

      clearAuthCookies(response);

      response.json({
        success: true
      });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  "/sessions/revoke-all",
  requireSession,
  requireCsrf,
  async (request, response, next) => {
    try {
      const auth = getAuthContext(request);

      if (!auth) return;

      await revokeAllUserSessions(auth.userId);
      clearAuthCookies(response);

      response.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);
