-- GitHub OAuth sign-in and repository import.
-- Accounts created through GitHub have no password; password sign-in simply
-- fails for them until a password is set.
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS github_user_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS users_github_user_id_idx
  ON users (github_user_id)
  WHERE github_user_id IS NOT NULL;

-- One GitHub connection per account. The OAuth access token is stored only in
-- encrypted form (REPOSITORY_CREDENTIAL_ENCRYPTION_KEY) and never returned.
CREATE TABLE IF NOT EXISTS github_connections (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_user_id BIGINT NOT NULL,
  login VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  encrypted_access_token TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_connections_github_user_id_idx
  ON github_connections (github_user_id);
