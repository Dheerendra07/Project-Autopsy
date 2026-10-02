import { db } from "../../config/database.js";

export interface StoredUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
  email_verified_at: string | null;
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
        disabled_at,
        email_verified_at
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
        disabled_at,
        email_verified_at
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
        disabled_at,
        email_verified_at
    `,
    [id, email, passwordHash]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
}

export type AuthActionPurpose = "email_verification" | "password_reset";

export const AUTH_EMAIL_TOKEN_RESEND_COOLDOWN_MS = 5 * 60_000;

export async function createAuthActionToken(
  id: string,
  userId: string,
  purpose: AuthActionPurpose,
  tokenHash: string,
  expiresAt: Date
): Promise<boolean> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${userId}:${purpose}`]
    );

    const cooldownSince = new Date(
      Date.now() - AUTH_EMAIL_TOKEN_RESEND_COOLDOWN_MS
    );

    const recent = await client.query(
      `
        SELECT 1
        FROM auth_action_tokens
        WHERE user_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
          AND created_at > $3
        LIMIT 1
      `,
      [userId, purpose, cooldownSince]
    );

    if (recent.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `
        DELETE FROM auth_action_tokens
        WHERE user_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [userId, purpose]
    );

    await client.query(
      `
        INSERT INTO auth_action_tokens (
          id,
          user_id,
          purpose,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [id, userId, purpose, tokenHash, expiresAt]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeAuthActionToken(
  tokenHash: string,
  purpose: AuthActionPurpose
): Promise<{ userId: string } | null> {
  const result = await db.query<{ user_id: string }>(
    `
      UPDATE auth_action_tokens
      SET consumed_at = NOW()
      WHERE token_hash = $1
        AND purpose = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id
    `,
    [tokenHash, purpose]
  );

  const row = result.rows[0];
  return row ? { userId: row.user_id } : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await db.query(
    `
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
        AND disabled_at IS NULL
    `,
    [userId]
  );
}

export async function verifyEmailWithToken(
  tokenHash: string
): Promise<boolean> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<{ user_id: string }>(
      `
        SELECT user_id
        FROM auth_action_tokens
        WHERE token_hash = $1
          AND purpose = 'email_verification'
          AND consumed_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE
      `,
      [tokenHash]
    );

    const token = tokenResult.rows[0];

    if (!token) {
      await client.query("ROLLBACK");
      return false;
    }

    const userResult = await client.query(
      `
        UPDATE users
        SET email_verified_at = COALESCE(email_verified_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
          AND disabled_at IS NULL
      `,
      [token.user_id]
    );

    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `
        UPDATE auth_action_tokens
        SET consumed_at = NOW()
        WHERE token_hash = $1
          AND purpose = 'email_verification'
          AND consumed_at IS NULL
      `,
      [tokenHash]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function invalidateAuthActionTokens(
  userId: string,
  purpose: AuthActionPurpose
): Promise<void> {
  await db.query(
    `
      UPDATE auth_action_tokens
      SET consumed_at = NOW()
      WHERE user_id = $1
        AND purpose = $2
        AND consumed_at IS NULL
    `,
    [userId, purpose]
  );
}

export async function purgeStaleAuthActionTokens(
  batchSize = SESSION_CLEANUP_BATCH_SIZE
): Promise<number> {
  const result = await db.query(
    `
      WITH stale AS (
        SELECT id
        FROM auth_action_tokens
        WHERE expires_at <= NOW()
           OR consumed_at < NOW() - INTERVAL '30 days'
        ORDER BY COALESCE(consumed_at, expires_at), id
        LIMIT $1
      )
      DELETE FROM auth_action_tokens AS t
      USING stale
      WHERE t.id = stale.id
      RETURNING t.id
    `,
    [Math.max(1, Math.min(SESSION_CLEANUP_BATCH_SIZE, Math.floor(batchSize)))]
  );

  return result.rowCount ?? 0;
}

export async function deleteUser(userId: string): Promise<void> {
  await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
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

export const ACTIVE_SESSION_LIMIT = 10;
export const SESSION_CLEANUP_BATCH_SIZE = 1_000;

export async function revokeExcessUserSessions(
  userId: string,
  limit = ACTIVE_SESSION_LIMIT
): Promise<number> {
  const result = await db.query(
    `
      WITH excess AS (
        SELECT id
        FROM sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        ORDER BY last_seen_at DESC, created_at DESC, id DESC
        OFFSET $2
      )
      UPDATE sessions AS s
      SET revoked_at = NOW()
      FROM excess
      WHERE s.id = excess.id
      RETURNING s.id
    `,
    [userId, Math.max(0, Math.floor(limit))]
  );

  return result.rowCount ?? 0;
}

export async function purgeStaleSessions(
  batchSize = SESSION_CLEANUP_BATCH_SIZE
): Promise<number> {
  const result = await db.query(
    `
      WITH stale AS (
        SELECT id
        FROM sessions
        WHERE expires_at <= NOW()
           OR revoked_at < NOW() - INTERVAL '30 days'
        ORDER BY COALESCE(revoked_at, expires_at), id
        LIMIT $1
      )
      DELETE FROM sessions AS s
      USING stale
      WHERE s.id = stale.id
      RETURNING s.id
    `,
    [Math.max(1, Math.min(SESSION_CLEANUP_BATCH_SIZE, Math.floor(batchSize)))]
  );

  return result.rowCount ?? 0;
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

export async function resetPasswordWithToken(
  tokenHash: string,
  passwordHash: string
): Promise<boolean> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<{ user_id: string }>(
      `
        SELECT user_id
        FROM auth_action_tokens
        WHERE token_hash = $1
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE
      `,
      [tokenHash]
    );

    const token = tokenResult.rows[0];

    if (!token) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `
        UPDATE auth_action_tokens
        SET consumed_at = NOW()
        WHERE token_hash = $1
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
      `,
      [tokenHash]
    );

    await client.query(
      `
        UPDATE users
        SET password_hash = $2,
            email_verified_at = COALESCE(email_verified_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
          AND disabled_at IS NULL
      `,
      [token.user_id, passwordHash]
    );

    await client.query(
      `
        UPDATE auth_action_tokens
        SET consumed_at = NOW()
        WHERE user_id = $1
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
      `,
      [token.user_id]
    );

    await client.query(
      `
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [token.user_id]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
