import { z } from "zod";

const boundedLabel = (name: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${name} must not be empty.`)
    .max(max, `${name} is too long.`);

const shaSchema = z
  .string()
  .trim()
  .regex(
    /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/,
    "revisionSha must be a full Git commit SHA."
  );

const metadataSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .superRefine((value, ctx) => {
    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "metadata must be JSON serializable."
      });
      return;
    }

    if (Buffer.byteLength(serialized, "utf8") > 8_192) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "metadata exceeds the 8 KiB limit."
      });
      return;
    }

    const sensitiveKeyPattern =
      /(?:secret|token|password|authorization|api[-_]?key|credential)/i;

    const visit = (item: unknown, path: string[]): void => {
      if (Array.isArray(item)) {
        item.forEach((child, index) =>
          visit(child, [...path, String(index)])
        );
        return;
      }

      if (!item || typeof item !== "object") {
        return;
      }

      for (const [key, child] of Object.entries(
        item as Record<string, unknown>
      )) {
        if (sensitiveKeyPattern.test(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["metadata", ...path, key],
            message: "metadata must not contain credential-like fields."
          });
          continue;
        }

        visit(child, [...path, key]);
      }
    };

    visit(value, []);
  });

export const deploymentEvidenceEventSchema = z
  .object({
    eventId: boundedLabel("eventId", 128).regex(
      /^[A-Za-z0-9._:-]+$/,
      "eventId contains unsupported characters."
    ),
    occurredAt: z.coerce.date(),
    provider: boundedLabel("provider", 64).regex(
      /^[A-Za-z0-9._:-]+$/,
      "provider contains unsupported characters."
    ),
    deploymentId: boundedLabel("deploymentId", 256),
    environment: boundedLabel("environment", 64),
    state: z.enum([
      "started",
      "succeeded",
      "failed",
      "cancelled",
      "unknown"
    ]),
    revisionSha: shaSchema.optional(),
    artifactDigest: z
      .string()
      .trim()
      .regex(
        /^sha256:[0-9a-fA-F]{64}$/,
        "artifactDigest must be a sha256 digest."
      )
      .optional(),
    buildId: boundedLabel("buildId", 256).optional(),
    releaseId: boundedLabel("releaseId", 256).optional(),
    metadata: metadataSchema
  })
  .strict();

export const deploymentEvidenceBatchSchema = z.object({
  events: z
    .array(deploymentEvidenceEventSchema)
    .min(1, "At least one deployment evidence event is required.")
    .max(100, "A deployment evidence batch cannot contain more than 100 events.")
}).strict();

export type DeploymentEvidenceEventInput = z.infer<
  typeof deploymentEvidenceEventSchema
>;

export interface PreparedDeploymentEvidenceEvent
  extends DeploymentEvidenceEventInput {
  occurredAtIso: string;
  payloadHash: string;
}