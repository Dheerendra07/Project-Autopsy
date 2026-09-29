import { generateEvidenceReport } from "../reports/report.service.js";
import type { EvidenceReport } from "../reports/report.types.js";
import type { EvidenceClaim, EvidenceRef, EvidenceReportSection } from "../reports/report.types.js";
import type {
  InterviewStoriesResponse,
  InterviewStory,
  InterviewStoryType
} from "./interview.types.js";

type StoryDefinition = {
  type: InterviewStoryType;
  sectionIds: string[];
  question: string;
  focus: string;
  framing: string;
  ownership: string;
  runtimeImpact: string;
};

const STORY_DEFINITIONS: StoryDefinition[] = [
  {
    type: "change-hotspot",
    sectionIds: ["change-hotspots"],
    question: "Tell me about an area of the codebase that required repeated engineering attention.",
    focus: "change frequency, churn, file boundaries, and how the change was investigated",
    framing: "Use the historical hotspot as the starting signal, then add the real technical context and decision made.",
    ownership: "Verify which changes were personally designed, implemented, reviewed, or only observed before using first-person language.",
    runtimeImpact: "Only state runtime effects when independently verified by tests, telemetry, or deployment evidence."
  },
  {
    type: "quality-signal",
    sectionIds: ["quality-signals"],
    question: "Describe a recurring quality problem you investigated.",
    focus: "bug/fix signals, repeated modifications, evidence gathering, and root-cause verification",
    framing: "Treat the repository signal as an investigation lead, not as proof that a bug or root cause existed.",
    ownership: "Confirm the actual incident, defect, or remediation work from project records before claiming personal involvement.",
    runtimeImpact: "Do not infer regression, outage, or performance impact from commit-subject signals alone."
  },
  {
    type: "architecture-evolution",
    sectionIds: ["evolution"],
    question: "Tell me about an architectural or refactoring change you worked on.",
    focus: "co-change patterns, refactors, dependency changes, directory evolution, and complexity deltas",
    framing: "Explain the before/after structure, the trade-off, and why the change was made using the repository evidence as an anchor.",
    ownership: "Verify the exact scope of personal contribution and distinguish implementation from review or collaboration.",
    runtimeImpact: "Only connect architecture changes to runtime outcomes when there is compatible test or telemetry evidence."
  },
  {
    type: "database-evolution",
    sectionIds: ["database-evolution"],
    question: "Describe a database or schema change and how you handled its risk.",
    focus: "migration operations, destructive markers, ordering, rollback considerations, and verification",
    framing: "Use the parsed migration evidence to explain what changed; add deployment and rollback details only from verified records.",
    ownership: "Confirm whether the migration was authored, reviewed, deployed, or only analyzed.",
    runtimeImpact: "Migration text alone does not prove blocking, downtime, data loss, or production impact."
  },
  {
    type: "test-evolution",
    sectionIds: ["test-evolution"],
    question: "How did testing evolve around a significant change?",
    focus: "test-source changes, test-case deltas, assertions, mocks, and test-type coverage",
    framing: "Explain what test behavior was added or changed and why; distinguish source evolution from actual execution results.",
    ownership: "Verify which tests were authored or maintained personally.",
    runtimeImpact: "Do not describe a test source change as proof of coverage or a passing suite without execution evidence."
  },
  {
    type: "runtime-observability",
    sectionIds: ["historical-runtime", "runtime-observations"],
    question: "How would you investigate a performance or reliability issue using runtime evidence?",
    focus: "observed duration, error rate, revisions, operation groups, and instrumentation limits",
    framing: "Use runtime observations to frame an investigation and correlate them with compatible revision and time-window evidence before drawing conclusions.",
    ownership: "Verify what instrumentation, dashboards, or analysis work was actually performed.",
    runtimeImpact: "Telemetry is observational; causal claims require compatible revision identity, time window, and sufficient samples."
  }
];

function selectSections(
  sections: EvidenceReportSection[],
  sectionIds: string[]
): EvidenceReportSection[] {
  return sectionIds
    .map((sectionId) => sections.find((section) => section.id === sectionId) ?? null)
    .filter((section): section is EvidenceReportSection => section !== null);
}

function selectEvidence(claims: EvidenceClaim[]): EvidenceRef[] {
  return claims.flatMap((claim) => claim.evidence);
}

function buildStory(
  definition: StoryDefinition,
  storySections: EvidenceReportSection[]
): InterviewStory {
  const claims = storySections
    .flatMap((section) => section.claims)
    .slice(0, 3);
  const evidence = selectEvidence(claims);
  const evidenceSummary = claims.map((claim) => claim.statement);
  const anchor = claims[0]?.statement ?? "No evidence statement is available.";

  return {
    id: "story-" + definition.type,
    type: definition.type,
    interviewQuestion: definition.question,
    headline: anchor,
    context:
      "Repository evidence provides this historical anchor: " +
      anchor,
    technicalFocus: definition.focus,
    evidence,
    evidenceSummary,
    draftAnswer: {
      situation:
        "Start with the verified project context around this evidence. " +
        "Do not add an incident, requirement, scale, or constraint unless it is independently known.",
      approach:
        definition.framing +
        " Relevant evidence: " +
        evidenceSummary.join(" | "),
      evidenceBackedResult:
        "The repository evidence establishes the historical change or observation described above. " +
        "Add the actual engineering, user, or business result only after verification.",
      limitation: storySections
        .map((section) => section.limitation)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(" ")
    },
    verification: {
      ownership: definition.ownership,
      result:
        "Fill this with a verified outcome such as test evidence, deployment evidence, measured improvement, or accepted design decision.",
      runtimeImpact: definition.runtimeImpact
    }
  };
}

export function buildInterviewStoriesFromReport(
  report: EvidenceReport,
  repositoryId: string,
  limit = 6
): InterviewStoriesResponse {
  const safeLimit = Math.max(1, Math.min(6, limit));
  const selected: InterviewStory[] = [];

  for (const definition of STORY_DEFINITIONS) {
    if (selected.length >= safeLimit) {
      break;
    }

    const storySections = selectSections(report.sections, definition.sectionIds);

    if (
      storySections.length === 0 ||
      storySections.every((section) => section.claims.length === 0)
    ) {
      continue;
    }

    selected.push(buildStory(definition, storySections));
  }

  return {
    storyVersion: "1.0",
    repositoryId,
    analysisRunId: report.analysis.runId,
    stories: selected,
    policy: [
      "Stories are interview scaffolds built from repository evidence, not claims about personal ownership.",
      "Ownership, intent, business impact, and runtime outcomes must be verified before being stated as facts.",
      "Heuristic signals remain signals and are never upgraded into causal or quality conclusions.",
      "Missing evidence is represented as a verification task rather than being filled with invented detail."
    ]
  };
}

export async function generateInterviewStories(
  repositoryId: string,
  limit = 6
): Promise<InterviewStoriesResponse> {
  const report = await generateEvidenceReport(repositoryId, Math.max(3, limit));
  return buildInterviewStoriesFromReport(report, repositoryId, limit);
}
