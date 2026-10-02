import { Router } from "express";
import { env } from "../../config/env.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  createOpaqueToken,
  createSessionExpiry,
  hashOpaqueToken,
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
  safeEqualString
} from "./auth.crypto.js";
import {
  changeUserPassword,
  claimUnownedRepositories,
  createSession,
  createUser,
  getPasswordHashByUserId,
  getUserByEmail,
  listUserSessions,
  revokeAllUserSessions,
  revokeSession,
  revokeSessionForUser,
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

authRouter.post("/migrate-legacy", async (request, response, next) => {
  try {
    const configuredKey = env.AUTOPSY_API_ACCESS_KEY;
    const providedKey = request.header("x-autopsy-api-key")?.trim();

    if (
      !configuredKey ||
      !providedKey ||
      !safeEqualString(configuredKey, providedKey)
    ) {
      response.status(401).json({
        success: false,
        error: {
          code: "LEGACY_MIGRATION_UNAUTHORIZED",
          message: "The legacy workspace migration credential is invalid."
        }
      });
      return;
    }

    const input = credentialsSchema.parse(request.body);
    let user = await getUserByEmail(input.email);

    if (user) {
      if (user.disabled_at) {
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
    } else {
      try {
        user = await createUser(
          randomUUID(),
          input.email,
          await hashPassword(input.password)
        );
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        user = await getUserByEmail(input.email);
        if (!user) {
          throw error;
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
      }
    }

    const claimedRepositories = await claimUnownedRepositories(user.id);

    await startSession(request, response, user);

    response.json({
      success: true,
      user: publicUser(user),
      migration: {
        repositoriesClaimed: claimedRepositories
      }
    });
  } catch (error) {
    next(error);
  }
});

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

authRouter.get("/sessions", requireSession, async (request, response, next) => {
  try {
    const auth = getAuthContext(request);

    if (!auth) {
      return;
    }

    const sessions = await listUserSessions(auth.userId);

    response.json({
      success: true,
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.created_at,
        lastSeenAt: session.last_seen_at,
        expiresAt: session.expires_at,
        userAgent: session.user_agent,
        isCurrent: session.id === auth.sessionId
      }))
    });
  } catch (error) {
    next(error);
  }
});

authRouter.delete(
  "/sessions/:sessionId",
  requireSession,
  requireCsrf,
  async (request, response, next) => {
    try {
      const auth = getAuthContext(request);

      if (!auth) {
        return;
      }

      const sessionId = z.string().uuid().parse(
        Array.isArray(request.params.sessionId)
          ? request.params.sessionId[0]
          : request.params.sessionId
      );

      const revoked = await revokeSessionForUser(sessionId, auth.userId);

      if (!revoked) {
        response.status(404).json({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: "The session no longer exists or is already signed out."
          }
        });
        return;
      }

      if (sessionId === auth.sessionId) {
        clearAuthCookies(response);
      }

      response.json({
        success: true,
        signedOutCurrentSession: sessionId === auth.sessionId
      });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  "/password",
  requireSession,
  requireCsrf,
  async (request, response, next) => {
    try {
      const auth = getAuthContext(request);

      if (!auth) {
        return;
      }

      const input = z.object({
        currentPassword: z
          .string()
          .min(PASSWORD_MIN_LENGTH)
          .max(PASSWORD_MAX_LENGTH),
        newPassword: z
          .string()
          .min(PASSWORD_MIN_LENGTH)
          .max(PASSWORD_MAX_LENGTH)
      }).parse(request.body);

      if (input.currentPassword === input.newPassword) {
        response.status(400).json({
          success: false,
          error: {
            code: "PASSWORD_UNCHANGED",
            message: "Choose a new password that is different from the current password."
          }
        });
        return;
      }

      const passwordHash = await getPasswordHashByUserId(auth.userId);
      const valid = passwordHash
        ? await verifyPassword(input.currentPassword, passwordHash)
        : false;

      if (!valid) {
        response.status(401).json({
          success: false,
          error: {
            code: "PASSWORD_INVALID",
            message: "Current password is incorrect."
          }
        });
        return;
      }

      const newPasswordHash = await hashPassword(input.newPassword);

      await changeUserPassword(auth.userId, newPasswordHash);

      await revokeAllUserSessions(auth.userId);

      await startSession(request, response, {
        id: auth.userId
      });

      response.json({
        success: true,
        message: "Password changed. Other active sessions were signed out."
      });
    } catch (error) {
      next(error);
    }
  }
);

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
