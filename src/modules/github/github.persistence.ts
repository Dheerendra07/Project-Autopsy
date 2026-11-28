import { db } from "../../config/database.js";
import type { StoredUser } from "../auth/auth.persistence.js";

const USER_COLUMNS = `
  id,
  email,
  created_at,
  updated_at,
  last_login_at,
  disabled_at,
  email_verified_at
`;

export interface StoredGitHubConnection {
  user_id: string;
  github_user_id: string;
  login: string;
  avatar_url: string | null;
  encrypted_access_token: string;
  scopes: string;
  created_at: string;
  updated_at: string;
}

export async function getUserByGitHubId(githubUserId: number): Promise<StoredUser | null> {
  const result = await db.query<StoredUser>(
    `SELECT ${USER_COLUMNS} FROM users WHERE github_user_id = $1 LIMIT 1`,
    [githubUserId]
  );
  return result.rows[0] ?? null;
}

export async function getGitHubUserIdForUser(userId: string): Promise<string | null> {
  const result = await db.query<{ github_user_id: string | null }>(
    "SELECT github_user_id FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0]?.github_user_id ?? null;
}

// Links a GitHub identity to an account and marks its email verified (GitHub
// returned it as a verified address). Returns false when the identity is
// already linked to a different account.
export async function linkGitHubIdentity(
  userId: string,
  githubUserId: number
): Promise<boolean> {
  const result = await db.query(
    `
      UPDATE users
      SET github_user_id = $2,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
        AND (github_user_id IS NULL OR github_user_id = $2)
        AND NOT EXISTS (
          SELECT 1 FROM users other WHERE other.github_user_id = $2 AND other.id <> $1
        )
    `,
    [userId, githubUserId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createGitHubUser(
  id: string,
  email: string,
  githubUserId: number
): Promise<StoredUser> {
  const result = await db.query<StoredUser>(
    `
      INSERT INTO users (id, email, password_hash, github_user_id, email_verified_at)
      VALUES ($1, $2, NULL, $3, NOW())
      RETURNING ${USER_COLUMNS}
    `,
    [id, email, githubUserId]
  );
  const user = result.rows[0];
  if (!user) throw new Error("Failed to create user.");
  return user;
}

export async function upsertGitHubConnection(connection: {
  userId: string;
  githubUserId: number;
  login: string;
  avatarUrl: string | null;
  encryptedAccessToken: string;
  scopes: string[];
}): Promise<void> {
  await db.query(
    `
      INSERT INTO github_connections
        (user_id, github_user_id, login, avatar_url, encrypted_access_token, scopes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        github_user_id = EXCLUDED.github_user_id,
        login = EXCLUDED.login,
        avatar_url = EXCLUDED.avatar_url,
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        scopes = EXCLUDED.scopes,
        updated_at = NOW()
    `,
    [
      connection.userId,
      connection.githubUserId,
      connection.login.slice(0, 100),
      connection.avatarUrl,
      connection.encryptedAccessToken,
      connection.scopes.join(" ")
    ]
  );
}

export async function getGitHubConnection(userId: string): Promise<StoredGitHubConnection | null> {
  const result = await db.query<StoredGitHubConnection>(
    `
      SELECT user_id, github_user_id, login, avatar_url, encrypted_access_token, scopes, created_at, updated_at
      FROM github_connections
      WHERE user_id = $1
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function deleteGitHubConnection(userId: string): Promise<boolean> {
  const result = await db.query("DELETE FROM github_connections WHERE user_id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function userHasPassword(userId: string): Promise<boolean> {
  const result = await db.query<{ has_password: boolean }>(
    "SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1",
    [userId]
  );
  return Boolean(result.rows[0]?.has_password);
}
