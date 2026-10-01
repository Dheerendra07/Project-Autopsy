import { db } from "../../config/database.js";

export async function saveRepositoryAccessCredential(
  repositoryId: string,
  encryptedCredential: string
): Promise<void> {
  await db.query(
    `
      INSERT INTO repository_access_credentials (
        repository_id,
        encrypted_credential
      )
      VALUES ($1, $2)
      ON CONFLICT (repository_id)
      DO UPDATE SET
        encrypted_credential = EXCLUDED.encrypted_credential,
        updated_at = NOW()
    `,
    [repositoryId, encryptedCredential]
  );
}

export async function getRepositoryAccessCredential(
  repositoryId: string
): Promise<string | null> {
  const result = await db.query<{ encrypted_credential: string }>(
    `
      SELECT encrypted_credential
      FROM repository_access_credentials
      WHERE repository_id = $1
    `,
    [repositoryId]
  );

  return result.rows[0]?.encrypted_credential ?? null;
}

export async function hasRepositoryAccessCredential(
  repositoryId: string
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM repository_access_credentials
        WHERE repository_id = $1
      ) AS exists
    `,
    [repositoryId]
  );

  return result.rows[0]?.exists === true;
}

export async function deleteRepositoryAccessCredential(
  repositoryId: string
): Promise<void> {
  await db.query(
    "DELETE FROM repository_access_credentials WHERE repository_id = $1",
    [repositoryId]
  );
}
