import "dotenv/config";
import { z } from "zod";

function emptyToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    AUTOPSY_SERVICE_ROLE: z
      .enum(["web", "worker"])
      .default("web"),

    AUTOPSY_CORS_ORIGINS: z
      .string()
      .trim()
      .optional(),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(5100),

    DATABASE_URL: z
      .string()
      .min(1),

    REDIS_URL: z
      .string()
      .trim()
      .refine(
        (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
        "REDIS_URL must use redis:// or rediss://."
      )
      .optional(),

    REDIS_HOST: z
      .string()
      .min(1)
      .default("localhost"),

    REDIS_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(6379),

    REPOSITORY_STORAGE_PATH: z
      .string()
      .min(1)
      .default("./storage/repositories"),

    MAX_REPOSITORY_SIZE_MB: z.coerce
      .number()
      .refine(Number.isFinite, "MAX_REPOSITORY_SIZE_MB must be finite.")
      .positive()
      .default(500),

    MAX_ANALYSIS_TIME_MINUTES: z.coerce
      .number()
      .refine(Number.isFinite, "MAX_ANALYSIS_TIME_MINUTES must be finite.")
      .positive()
      .max(
        24 * 60,
        "MAX_ANALYSIS_TIME_MINUTES must not exceed 1440 minutes."
      )
      .default(30),

    MAX_ANALYZED_COMMITS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(25_000),

    API_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(10)
      .max(3_600)
      .default(60),

    API_RATE_LIMIT_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(10)
      .max(10_000)
      .default(120),

    API_RATE_LIMIT_HEAVY_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000)
      .default(12),

    RUNTIME_TELEMETRY_INGEST_KEY: z
      .string()
      .min(32)
      .optional(),

    DEPLOYMENT_EVIDENCE_INGEST_KEY: z
      .string()
      .min(32)
      .optional(),

    AUTOPSY_BOOTSTRAP_EMAIL: z
      .string()
      .trim()
      .email()
      .max(320)
      .optional(),

    AUTOPSY_BOOTSTRAP_PASSWORD: z
      .string()
      .min(12)
      .max(256)
      .optional(),

    AUTOPSY_API_ACCESS_KEY: z
      .string()
      .min(32)
      .optional(),

    BREVO_API_KEY: z
      .string()
      .min(1)
      .optional(),

    AUTOPSY_EMAIL_FROM: z
      .string()
      .trim()
      .email()
      .optional(),

    AUTOPSY_EMAIL_FROM_NAME: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .default("Project Autopsy"),

    AUTOPSY_PUBLIC_URL: z
      .string()
      .trim()
      .url()
      .optional(),

    REPOSITORY_CREDENTIAL_ENCRYPTION_KEY: z
      .string()
      .regex(
        /^[0-9a-f]{64}$/i,
        "REPOSITORY_CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters."
      )
      .optional(),

    AI_API_KEY: z
      .string()
      .min(1)
      .optional(),

    AI_BASE_URL: z
      .string()
      .url()
      .default("https://generativelanguage.googleapis.com/v1beta"),

    AI_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("gemini-3.8-flash"),

    AI_FALLBACK_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("gemini-3.7-flash"),

    AI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000),

    EVIDENCE_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(30)
      .max(365)
      .default(365),

    AI_INTERPRETATION_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(604_800)
      .default(86_400),

    // Optional GitHub OAuth sign-in and repository import. Enabled only when both
    // the client id and secret are set.
    // Empty values (e.g. a copied .env.example) mean "not configured".
    GITHUB_OAUTH_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
    GITHUB_OAUTH_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
    // Exact callback URL registered on the GitHub OAuth app. When unset it is
    // derived from the incoming request: <origin>/api/auth/github/callback.
    GITHUB_OAUTH_CALLBACK_URL: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
    GITHUB_OAUTH_BASE_URL: z.string().trim().url().default("https://github.com"),
    GITHUB_API_BASE_URL: z.string().trim().url().default("https://api.github.com")
  })
  .superRefine((value, ctx) => {
    const hasBootstrapEmail = Boolean(value.AUTOPSY_BOOTSTRAP_EMAIL);
    const hasBootstrapPassword = Boolean(value.AUTOPSY_BOOTSTRAP_PASSWORD);

    if (hasBootstrapEmail !== hasBootstrapPassword) {
      const path = hasBootstrapEmail
        ? ["AUTOPSY_BOOTSTRAP_PASSWORD"]
        : ["AUTOPSY_BOOTSTRAP_EMAIL"];

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message:
          "AUTOPSY_BOOTSTRAP_EMAIL and AUTOPSY_BOOTSTRAP_PASSWORD must be configured together."
      });
    }

    const hasEmailProviderKey = Boolean(value.BREVO_API_KEY);
    const hasEmailFrom = Boolean(value.AUTOPSY_EMAIL_FROM);
    const hasPublicUrl = Boolean(value.AUTOPSY_PUBLIC_URL);

    if (hasEmailProviderKey || hasEmailFrom || hasPublicUrl) {
      if (!hasEmailProviderKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BREVO_API_KEY"],
          message:
            "BREVO_API_KEY is required when transactional email is configured."
        });
      }
      if (!hasEmailFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUTOPSY_EMAIL_FROM"],
          message:
            "AUTOPSY_EMAIL_FROM is required when transactional email is configured."
        });
      }
      if (!hasPublicUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUTOPSY_PUBLIC_URL"],
          message:
            "AUTOPSY_PUBLIC_URL is required when transactional email is configured."
        });
      }
    }

    const hasGitHubClientId = Boolean(value.GITHUB_OAUTH_CLIENT_ID);
    const hasGitHubClientSecret = Boolean(value.GITHUB_OAUTH_CLIENT_SECRET);

    if (hasGitHubClientId !== hasGitHubClientSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasGitHubClientId ? "GITHUB_OAUTH_CLIENT_SECRET" : "GITHUB_OAUTH_CLIENT_ID"],
        message:
          "GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET must be configured together."
      });
    }

    // GitHub tokens are stored encrypted; production must not enable GitHub
    // sign-in without the credential encryption key.
    if (
      value.NODE_ENV === "production" &&
      hasGitHubClientId &&
      hasGitHubClientSecret &&
      !value.REPOSITORY_CREDENTIAL_ENCRYPTION_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REPOSITORY_CREDENTIAL_ENCRYPTION_KEY"],
        message:
          "REPOSITORY_CREDENTIAL_ENCRYPTION_KEY is required when GitHub sign-in is configured."
      });
    }

  });

export function parseEnvironment(
  source: NodeJS.ProcessEnv
): z.infer<typeof envSchema> {
  return envSchema.parse(source);
}

export const env = parseEnvironment(process.env);
