ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_action_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_action_tokens_user_purpose_idx
  ON auth_action_tokens (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_action_tokens_expiry_idx
  ON auth_action_tokens (expires_at)
  WHERE consumed_at IS NULL;
