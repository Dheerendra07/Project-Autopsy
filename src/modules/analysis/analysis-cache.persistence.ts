import { db } from "../../config/database.js";

export async function getAnalysisCache(
  repositoryId: string,
  analyzerName: string,
  analyzerVersion: string,
  cacheKey: string
): Promise<unknown | null> {
  const result = await db.query<{ result: unknown }>(
    `SELECT result
     FROM analysis_cache
     WHERE repository_id = $1
       AND analyzer_name = $2
       AND analyzer_version = $3
       AND cache_key = $4
     LIMIT 1`,
    [repositoryId, analyzerName, analyzerVersion, cacheKey]
  );

  return result.rows[0]?.result ?? null;
}

export async function putAnalysisCache(
  repositoryId: string,
  analyzerName: string,
  analyzerVersion: string,
  cacheKey: string,
  value: unknown
): Promise<void> {
  await db.query(
    `INSERT INTO analysis_cache (
       repository_id,
       analyzer_name,
       analyzer_version,
       cache_key,
       result,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (
       repository_id,
       analyzer_name,
       analyzer_version,
       cache_key
     )
     DO UPDATE SET
       result = EXCLUDED.result,
       updated_at = NOW()`,
    [
      repositoryId,
      analyzerName,
      analyzerVersion,
      cacheKey,
      JSON.stringify(value)
    ]
  );
}