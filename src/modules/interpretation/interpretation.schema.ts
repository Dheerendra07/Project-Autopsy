import { z } from "zod";

export const interpretationOutputSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(2_000),
  themes: z
    .array(
      z
        .object({
          id: z.string().trim().min(1).max(64),
          title: z.string().trim().min(1).max(160),
          analysis: z.string().trim().min(1).max(1_200),
          evidenceKeys: z
            .array(z.string().trim().min(1).max(256))
            .min(1)
            .max(5)
        })
        .strict()
    )
    .max(6),
  investigationQuestions: z
    .array(
      z
        .object({
          question: z.string().trim().min(1).max(500),
          evidenceKeys: z
            .array(z.string().trim().min(1).max(256))
            .min(1)
            .max(3)
        })
        .strict()
    )
    .max(6),
  uncertainties: z
    .array(z.string().trim().min(1).max(500))
    .max(8)
}).strict();

export const INTERPRETATION_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    executiveSummary: { type: "string" },
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          analysis: { type: "string" },
          evidenceKeys: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["id", "title", "analysis", "evidenceKeys"]
      }
    },
    investigationQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          evidenceKeys: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["question", "evidenceKeys"]
      }
    },
    uncertainties: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "executiveSummary",
    "themes",
    "investigationQuestions",
    "uncertainties"
  ]
} as const;
