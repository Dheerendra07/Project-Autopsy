import { db } from "../../config/database.js";

export interface StoredUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
}

export interface StoredSession {
  id: string;
  user_id: string;
  email: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  csrf_token_hash: string;
}

export async function getUserByEmail(
  email: string
): Promise<StoredUser | null> {
  const result = await db.query<StoredUser>(
    `
      SELECT
        id,
        email,
        created_at,
        updated_at,
        last_login_at,
        disabled_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function getUserById(
  userId: string
): Promise<StoredUser | null> {
  const result = await db.query<StoredUser>(
    `
      SELECT
        id,
        email,
        created_at,
        updated_at,
        last_login_at,
        disabled_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function createUser(
  id: string,
  email: string,
  passwordHash: string
): Promise<StoredUser> {
  const result = await db.query<StoredUser>(
    `
      INSERT INTO users (id, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        email,
        created_at,
        updated_at,
        last_login_at,
        disabled_at
    `,
    [id, email, passwordHash]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
}

export async function getPasswordHashByUserId(
  userId: string
): Promise<string | null> {
  const result = await db.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  return result.rows[0]?.password_hash ?? null;
}

export async function createSession(
  id: string,
  userId: string,
  tokenHash: string,
  csrfTokenHash: string,
  expiresAt: Date,
  userAgent?: string
): Promise<void> {
  await db.query(
    `
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        csrf_token_hash,
        expires_at,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      id,
      userId,
      tokenHash,
      csrfTokenHash,
      expiresAt,
      userAgent?.slice(0, 512) ?? null
    ]
  );
}

export async function getSessionByTokenHash(
  tokenHash: string
): Promise<StoredSession | null> {
  const result = await db.query<StoredSession>(
    `
      SELECT
        s.id,
        s.user_id,
        u.email,
        s.token_hash,
        s.created_at,
        s.expires_at,
        s.last_seen_at,
        s.revoked_at,
        s.csrf_token_hash
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.disabled_at IS NULL
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
}

export async function touchSession(
  sessionId: string,
  extendUntil: Date
): Promise<void> {
  await db.query(
    `
      UPDATE sessions
      SET
        last_seen_at = NOW(),
        expires_at = GREATEST(expires_at, $2)
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [sessionId, extendUntil]
  );
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.query(
    `
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.query(
    `
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId]
  );
}

export async function updateLastLogin(userId: string): Promise<void> {
  await db.query(
    `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [userId]
  );
}

export interface UserSessionSummary {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
  is_revoked: boolean;
}

export async function listUserSessions(
  userId: string
): Promise<UserSessionSummary[]> {
  const result = await db.query<UserSessionSummary>(
    `
      SELECT
        id,
        created_at,
        last_seen_at,
        expires_at,
        user_agent,
        revoked_at IS NOT NULL AS is_revoked
      FROM sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY last_seen_at DESC, created_at DESC, id DESC
      LIMIT 25
    `,
    [userId]
  );

  return result.rows;
}

export async function revokeSessionForUser(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    `
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
      RETURNING id
    `,
    [sessionId, userId]
  );

  return result.rowCount === 1;
}

export async function changeUserPassword(
  userId: string,
  passwordHash: string
): Promise<void> {
  await db.query(
    `
      UPDATE users
      SET password_hash = $2,
          updated_at = NOW()
      WHERE id = $1
        AND disabled_at IS NULL
    `,
    [userId, passwordHash]
  );
}

export async function getOwnedRepository(
  repositoryId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM repositories
      WHERE id = $1
        AND owner_user_id = $2
      LIMIT 1
    `,
    [repositoryId, userId]
  );

  return result.rowCount === 1;
}

export interface UserRepositorySummary {
  id: string;
  name: string;
  source_url: string | null;
  tracked_branch: string | null;
  head_sha: string | null;
  updated_at: string;
}

export async function listRepositoriesForUser(
  userId: string,
  limit = 50
): Promise<UserRepositorySummary[]> {
  const result = await db.query<UserRepositorySummary>(
    `
      SELECT
        id,
        name,
        source_url,
        tracked_branch,
        head_sha,
        updated_at
      FROM repositories
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

export async function claimUnownedRepositories(
  userId: string
): Promise<number> {
  const result = await db.query(
    `
      UPDATE repositories
      SET
        owner_user_id = $1,
        updated_at = NOW()
      WHERE owner_user_id IS NULL
    `,
    [userId]
  );

  return result.rowCount ?? 0;
}

export async function countUsers(): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users`
  );

  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}
