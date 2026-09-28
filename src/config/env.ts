import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(5000),

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
    .default(30)
});

export const env = envSchema.parse(process.env);
