import "dotenv/config";
import { z } from "zod";

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(5100),

    DATABASE_URL: z
      .string()
      .min(1),

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
      .positive()
      .default(500),

    MAX_ANALYSIS_TIME_MINUTES: z.coerce
      .number()
      .positive()
      .default(30),

    RUNTIME_TELEMETRY_INGEST_KEY: z
      .string()
      .min(32)
      .optional(),

    DEPLOYMENT_EVIDENCE_INGEST_KEY: z
      .string()
      .min(32)
      .optional(),

    AUTOPSY_API_ACCESS_KEY: z
      .string()
      .min(32)
      .optional(),

    AI_API_KEY: z
      .string()
      .min(1)
      .optional(),

    AI_BASE_URL: z
      .string()
      .url()
      .default("https://api.openai.com/v1"),

    AI_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("gpt-5.6-luna"),

    AI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000),

    AI_INTERPRETATION_ACCESS_KEY: z
      .string()
      .min(32)
      .optional(),

    AI_INTERPRETATION_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(604_800)
      .default(86_400)
  })
  .superRefine((value, ctx) => {
    if (
      value.NODE_ENV === "production" &&
      !value.RUNTIME_TELEMETRY_INGEST_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RUNTIME_TELEMETRY_INGEST_KEY"],
        message:
          "RUNTIME_TELEMETRY_INGEST_KEY is required in production."
      });
    }

    if (
      value.NODE_ENV === "production" &&
      !value.DEPLOYMENT_EVIDENCE_INGEST_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEPLOYMENT_EVIDENCE_INGEST_KEY"],
        message:
          "DEPLOYMENT_EVIDENCE_INGEST_KEY is required in production."
      });
    }

    if (
      value.NODE_ENV === "production" &&
      !value.AUTOPSY_API_ACCESS_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTOPSY_API_ACCESS_KEY"],
        message:
          "AUTOPSY_API_ACCESS_KEY is required in production."
      });
    }

    if (
      value.NODE_ENV === "production" &&
      value.AI_API_KEY &&
      !value.AI_INTERPRETATION_ACCESS_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_INTERPRETATION_ACCESS_KEY"],
        message:
          "AI_INTERPRETATION_ACCESS_KEY is required in production when AI_API_KEY is configured."
      });
    }
  });

export function parseEnvironment(
  source: NodeJS.ProcessEnv
): z.infer<typeof envSchema> {
  return envSchema.parse(source);
}

export const env = parseEnvironment(process.env);
