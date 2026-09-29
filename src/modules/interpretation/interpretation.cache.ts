import { createHash } from "node:crypto";

import type {
  AiInterpretationCache,
  InterpretationResult
} from "./interpretation.types.js";
import {
  INTERPRETATION_PROMPT_VERSION,
  INTERPRETATION_VERSION
} from "./interpretation.types.js";
import { interpretationOutputSchema } from "./interpretation.schema.js";

const CACHE_PREFIX = "project-autopsy:ai-interpretation:v1:";
const DEFAULT_TTL_SECONDS = 86_400;

export interface AiInterpretationRedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number
  ): Promise<unknown>;
}

function cacheKeyDigest(
  reportFingerprint: string,
  model: string
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cacheVersion: INTERPRETATION_VERSION,
        promptVersion: INTERPRETATION_PROMPT_VERSION,
        reportFingerprint,
        model
      }),
      "utf8"
    )
    .digest("hex");
}

export function buildAiInterpretationCacheKey(
  reportFingerprint: string,
  model: string
): string {
  return CACHE_PREFIX + cacheKeyDigest(reportFingerprint, model);
}

export class RedisAiInterpretationCache implements AiInterpretationCache {
  constructor(
    private readonly client: AiInterpretationRedisClient,
    private readonly ttlSeconds = DEFAULT_TTL_SECONDS
  ) {}

  async get(key: string): Promise<InterpretationResult | null> {
    try {
      const value = await this.client.get(key);

      if (!value) {
        return null;
      }

      const parsed: unknown = JSON.parse(value);

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      const result = parsed as Partial<InterpretationResult>;

      if (
        result.interpretationVersion !== INTERPRETATION_VERSION ||
        result.provider !== "openai" ||
        typeof result.model !== "string" ||
        typeof result.reportFingerprint !== "string" ||
        typeof result.groundingClaimCount !== "number" ||
        !Number.isInteger(result.groundingClaimCount) ||
        result.groundingClaimCount < 1 ||
        typeof result.generatedAt !== "string" ||
        result.cacheHit !== false
      ) {
        return null;
      }

      const interpretation = interpretationOutputSchema.safeParse(
        result.interpretation
      );

      if (!interpretation.success) {
        return null;
      }

      return {
        interpretationVersion: INTERPRETATION_VERSION,
        provider: "openai",
        model: result.model,
        reportFingerprint: result.reportFingerprint,
        groundingClaimCount: result.groundingClaimCount,
        generatedAt: result.generatedAt,
        cacheHit: false,
        interpretation: interpretation.data
      };
    } catch {
      return null;
    }
  }

  async set(key: string, value: InterpretationResult): Promise<void> {
    try {
      await this.client.set(
        key,
        JSON.stringify({
          ...value,
          cacheHit: false
        }),
        "EX",
        this.ttlSeconds
      );
    } catch {
      // Cache is an optimization. Provider results must remain available
      // when Redis is unavailable or a cache write fails.
    }
  }
}
