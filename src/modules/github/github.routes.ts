import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import { createOpaqueToken, safeEqualString } from "../auth/auth.crypto.js";
import {
  getUserByEmail,
  getUserById,
  listRepositoriesForUser,
  updateLastLogin
} from "../auth/auth.persistence.js";
import { startSession } from "../auth/auth.routes.js";
import { authenticateSession, getAuthContext } from "../../middleware/session.middleware.js";
import {
  RepositoryCredentialConfigurationError,
  decryptRepositoryAccessToken,
  encryptRepositoryAccessToken
} from "../repositories/repository-credentials.js";
import { importRepositoryForUser } from "../repositories/repository-import.service.js";
import {
  GitHubApiError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchProfile,
  fetchVerifiedEmail,
  getRepository,
  isGitHubOAuthConfigured,
  listRepositories
} from "./github.client.js";
import {
  createGitHubUser,
  deleteGitHubConnection,
  getGitHubConnection,
  getUserByGitHubId,
  linkGitHubIdentity,
  upsertGitHubConnection,
  userHasPassword
} from "./github.persistence.js";
import {
  FULL_NAME_PATTERN,
  GitHubFlowError,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  appBaseUrl,
  callbackUrl,
  decodeOAuthState,
  encodeOAuthState,
  hasPrivateRepoAccess,
  resolveAccount,
  safeNextHash,
  scopesFor
} from "./github.service.js";

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.header("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

function stateCookie(value: string, maxAgeSeconds: number): string {
  return [
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/api/auth/github",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(env.NODE_ENV === "production" ? ["Secure"] : [])
  ].join("; ");
}

function redirectToApp(request: Request, response: Response, hash: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.redirect(302, appBaseUrl(request) + "/" + hash);
}

function notConfigured(response: Response): void {
  response.status(404).json({
    success: false,
    error: { code: "GITHUB_NOT_CONFIGURED", message: "GitHub sign-in is not enabled on this server." }
  });
}

// ---------------------------------------------------------------- public auth routes

export const githubAuthRouter = Router();

githubAuthRouter.get("/providers", (_request, response) => {
  response.json({
    success: true,
    providers: { github: { enabled: isGitHubOAuthConfigured() } }
  });
});

githubAuthRouter.get("/github/start", async (request, response, next) => {
  try {
    if (!isGitHubOAuthConfigured()) {
      redirectToApp(request, response, "#/signin?oauth=GITHUB_NOT_CONFIGURED");
      return;
    }
    const query = z.object({
      intent: z.enum(["signin", "connect"]).default("signin"),
      access: z.enum(["public", "private"]).default("public"),
      next: z.string().max(300).optional()
    }).safeParse(request.query);
    if (!query.success) {
      redirectToApp(request, response, "#/signin?oauth=GITHUB_STATE_INVALID");
      return;
    }

    let userId: string | null = null;
    if (query.data.intent === "connect") {
      const auth = await authenticateSession(request);
      if (!auth) {
        redirectToApp(request, response, "#/signin?oauth=GITHUB_SESSION_REQUIRED");
        return;
      }
      userId = auth.userId;
    }

    const state = createOpaqueToken();
    response.setHeader("Set-Cookie", stateCookie(encodeOAuthState({
      state,
      intent: query.data.intent,
      access: query.data.access,
      next: safeNextHash(query.data.next),
      userId,
      issuedAt: Date.now()
    }), OAUTH_STATE_TTL_SECONDS));
    response.setHeader("Cache-Control", "no-store");
    response.redirect(302, buildAuthorizeUrl({
      state,
      redirectUri: callbackUrl(request),
      scopes: scopesFor(query.data.access)
    }));
  } catch (error) {
    next(error);
  }
});

githubAuthRouter.get("/github/callback", async (request, response) => {
  const stored = decodeOAuthState(readCookie(request, OAUTH_STATE_COOKIE));
  const failTo = (code: string) => {
    response.append("Set-Cookie", stateCookie("", 0));
    const base = stored && stored.intent === "connect" ? "#/projects" : "#/signin";
    redirectToApp(request, response, base + "?oauth=" + encodeURIComponent(code));
  };

  try {
    if (!isGitHubOAuthConfigured()) return failTo("GITHUB_NOT_CONFIGURED");

    const query = request.query;
    if (typeof query.error === "string") {
      return failTo(query.error === "access_denied" ? "GITHUB_CANCELLED" : "GITHUB_OAUTH_FAILED");
    }
    const code = typeof query.code === "string" ? query.code : "";
    const state = typeof query.state === "string" ? query.state : "";
    if (!stored || !code || !state || !safeEqualString(stored.state, state)) {
      return failTo("GITHUB_STATE_INVALID");
    }

    let sessionUserId: string | null = null;
    if (stored.intent === "connect") {
      const auth = await authenticateSession(request);
      if (!auth || auth.userId !== stored.userId) return failTo("GITHUB_SESSION_REQUIRED");
      sessionUserId = auth.userId;
    }

    const token = await exchangeCodeForToken(code, callbackUrl(request));
    // Encrypt first: without the encryption key the connection cannot be stored.
    const encryptedAccessToken = encryptRepositoryAccessToken(token.accessToken);
    const profile = await fetchProfile(token.accessToken);
    const verifiedEmail = await fetchVerifiedEmail(token.accessToken).catch(() => null);

    const { user } = await resolveAccount(
      { intent: stored.intent, sessionUserId, githubUserId: profile.id, verifiedEmail },
      { getUserById, getUserByGitHubId, getUserByEmail, linkGitHubIdentity, createGitHubUser }
    );

    await upsertGitHubConnection({
      userId: user.id,
      githubUserId: profile.id,
      login: profile.login,
      avatarUrl: profile.avatar_url ?? null,
      encryptedAccessToken,
      scopes: token.scopes
    });

    if (stored.intent === "signin") {
      await updateLastLogin(user.id);
      await startSession(request, response, user);
    }
    response.append("Set-Cookie", stateCookie("", 0));
    const target = stored.next || "#/projects";
    redirectToApp(request, response, target + (target.includes("?") ? "&" : "?") + "github=connected");
  } catch (error) {
    if (error instanceof GitHubFlowError || error instanceof GitHubApiError) return failTo(error.code);
    if (error instanceof RepositoryCredentialConfigurationError) return failTo("GITHUB_TOKEN_STORAGE_UNAVAILABLE");
    console.error("GitHub OAuth callback failed:", error instanceof Error ? error.message : error);
    return failTo("GITHUB_OAUTH_FAILED");
  }
});

// ---------------------------------------------------------------- signed-in GitHub routes

export const githubRouter = Router();

async function connectionToken(userId: string): Promise<{ token: string; scopes: string[]; login: string } | null> {
  const connection = await getGitHubConnection(userId);
  if (!connection) return null;
  return {
    token: decryptRepositoryAccessToken(connection.encrypted_access_token),
    scopes: connection.scopes.split(/\s+/).filter(Boolean),
    login: connection.login
  };
}

function sendGitHubError(response: Response, error: unknown): boolean {
  if (error instanceof GitHubApiError) {
    const code = error.code === "GITHUB_TOKEN_INVALID" ? "GITHUB_RECONNECT_REQUIRED" : error.code;
    response.status(error.code === "GITHUB_TOKEN_INVALID" ? 409 : error.status).json({
      success: false,
      error: { code, message: error.message }
    });
    return true;
  }
  return false;
}

function notConnected(response: Response): void {
  response.status(409).json({
    success: false,
    error: { code: "GITHUB_NOT_CONNECTED", message: "Connect your GitHub account first." }
  });
}

githubRouter.get("/status", async (request, response, next) => {
  try {
    const auth = getAuthContext(request);
    if (!auth) return;
    const enabled = isGitHubOAuthConfigured();
    const connection = await getGitHubConnection(auth.userId);
    response.json({
      success: true,
      enabled,
      connected: Boolean(connection),
      hasPassword: await userHasPassword(auth.userId),
      github: connection
        ? {
            login: connection.login,
            avatarUrl: connection.avatar_url,
            privateRepositories: hasPrivateRepoAccess(connection.scopes.split(/\s+/)),
            connectedAt: connection.created_at
          }
        : null
    });
  } catch (error) {
    next(error);
  }
});

githubRouter.get("/repos", async (request, response, next) => {
  try {
    const auth = getAuthContext(request);
    if (!auth) return;
    if (!isGitHubOAuthConfigured()) return notConfigured(response);
    const page = z.coerce.number().int().min(1).max(50).default(1).parse(request.query.page);
    const connection = await connectionToken(auth.userId);
    if (!connection) return notConnected(response);

    const [listing, imported] = await Promise.all([
      listRepositories(connection.token, page),
      listRepositoriesForUser(auth.userId, 500)
    ]);
    const importedByUrl = new Map(imported.map((r) => [String(r.source_url ?? "").toLowerCase().replace(/\.git$/, ""), r.id]));

    response.json({
      success: true,
      page,
      hasMore: listing.hasMore,
      privateRepositories: hasPrivateRepoAccess(connection.scopes),
      repositories: listing.repositories.map((repo) => ({
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner?.login ?? repo.full_name.split("/")[0],
        private: Boolean(repo.private),
        fork: Boolean(repo.fork),
        archived: Boolean(repo.archived),
        description: repo.description,
        defaultBranch: repo.default_branch,
        pushedAt: repo.pushed_at,
        language: repo.language,
        stars: repo.stargazers_count ?? 0,
        htmlUrl: repo.html_url,
        importedRepositoryId: importedByUrl.get(("https://github.com/" + repo.full_name).toLowerCase()) ?? null
      }))
    });
  } catch (error) {
    if (!sendGitHubError(response, error)) next(error);
  }
});

const importSchema = z.object({
  fullName: z.string().trim().regex(FULL_NAME_PATTERN, "Repository name is invalid."),
  branch: z.string().trim().min(1).max(255).optional()
});

githubRouter.post("/import", async (request, response, next) => {
  try {
    const auth = getAuthContext(request);
    if (!auth) return;
    if (!isGitHubOAuthConfigured()) return notConfigured(response);
    const input = importSchema.parse(request.body);
    const connection = await connectionToken(auth.userId);
    if (!connection) return notConnected(response);

    // Confirms the repository exists and this connection can read it.
    const repo = await getRepository(connection.token, input.fullName);
    const url = "https://github.com/" + repo.full_name;

    const existing = (await listRepositoriesForUser(auth.userId, 500))
      .find((r) => String(r.source_url ?? "").toLowerCase().replace(/\.git$/, "") === url.toLowerCase());
    if (existing) {
      response.status(409).json({
        success: false,
        error: {
          code: "REPOSITORY_ALREADY_IMPORTED",
          message: repo.full_name + " is already in your projects.",
          repositoryId: existing.id
        }
      });
      return;
    }

    const result = await importRepositoryForUser({
      url,
      branch: input.branch,
      // Private repositories are cloned with the connection's token, stored
      // encrypted per repository like a manually supplied access token.
      accessToken: repo.private ? connection.token : undefined,
      ownerUserId: auth.userId
    });
    response.status(202).json({ success: true, ...result });
  } catch (error) {
    if (!sendGitHubError(response, error)) next(error);
  }
});

githubRouter.delete("/connection", async (request, response, next) => {
  try {
    const auth = getAuthContext(request);
    if (!auth) return;
    const removed = await deleteGitHubConnection(auth.userId);
    response.json({ success: true, disconnected: removed });
  } catch (error) {
    next(error);
  }
});
