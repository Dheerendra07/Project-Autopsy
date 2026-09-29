import type { EvidenceRef } from "../reports/report.types.js";

export const INTERPRETATION_VERSION = "1.0" as const;

export interface InterpretationGroundingClaim {
  evidenceKey: string;
  sectionId: string;
  sectionTitle: string;
  claimId: string;
  statement: string;
  limitation: string;
  evidence: EvidenceRef[];
}

export interface AiInterpretationTheme {
  id: string;
  title: string;
  analysis: string;
  evidenceKeys: string[];
}

export interface AiInterpretationQuestion {
  question: string;
  evidenceKeys: string[];
}

export interface AiInterpretation {
  executiveSummary: string;
  themes: AiInterpretationTheme[];
  investigationQuestions: AiInterpretationQuestion[];
  uncertainties: string[];
}

export interface InterpretationResult {
  interpretationVersion: typeof INTERPRETATION_VERSION;
  provider: "openai";
  model: string;
  reportFingerprint: string;
  groundingClaimCount: number;
  generatedAt: string;
  interpretation: AiInterpretation;
}

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}
