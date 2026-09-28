import type { EvidenceRef } from "../reports/report.types.js";

export type InterviewStoryType =
  | "change-hotspot"
  | "quality-signal"
  | "architecture-evolution"
  | "database-evolution"
  | "test-evolution"
  | "runtime-observability";

export interface InterviewStory {
  id: string;
  type: InterviewStoryType;
  interviewQuestion: string;
  headline: string;
  context: string;
  technicalFocus: string;
  evidence: EvidenceRef[];
  evidenceSummary: string[];
  draftAnswer: {
    situation: string;
    approach: string;
    evidenceBackedResult: string;
    limitation: string;
  };
  verification: {
    ownership: string;
    result: string;
    runtimeImpact: string;
  };
}

export interface InterviewStoriesResponse {
  storyVersion: "1.0";
  repositoryId: string;
  analysisRunId: string;
  stories: InterviewStory[];
  policy: string[];
}
