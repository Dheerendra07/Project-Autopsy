import { createHash } from "node:crypto";

import {
  getLatestCompletedAnalysisRun,
  getRepositoryById,
  listRepositoryCommits,
  listRepositoryHotspots
} from "../repositories/repository.persistence.js";
import { listRepeatedBugAreas } from "../repositories/bug-area.persistence.js";
import { listRepeatedlyModifiedFiles } from "../metrics/change-patterns.persistence.js";
import { listFileChangeCoupling } from "../coupling/coupling.persistence.js";
import { listRefactorSignals } from "../refactors/refactor.persistence.js";
import {
  listArchitectureEvents,
  listDependencyChanges
} from "../evolution/evolution.persistence.js";
import { listCodeComplexityEvents } from "../complexity/complexity.persistence.js";
import { listDatabaseMigrationEvents } from "../schema/schema.persistence.js";
import {
  listTestEvolutionEvents,
  summarizeTestEvolution
} from "../tests/test-evolution.persistence.js";
import { summarizeRuntimeTelemetry } from "../runtime/runtime.persistence.js";
import { generateHistoricalRuntimeReconstruction } from "../runtime/historical-correlation.service.js";
import { buildHistoricalRuntimeSourceContextEvidence } from "../runtime/historical-runtime-source-context.service.js";
import { ANALYZER_VERSION } from "../../workers/queue.constants.js";
import type {
  EvidenceClaim,
  EvidenceRef,
  EvidenceReport,
  EvidenceReportSection,
  ReportBuildInput
} from "./report.types.js";

export const REPORT_VERSION: "1.0" = "1.0";

export class EvidenceReportNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceReportNotReadyError";
  }
}

export class EvidenceReportRepositoryNotFoundError extends Error {
  constructor() {
    super("Repository not found.");
    this.name = "EvidenceReportRepositoryNotFoundError";
  }
}

function evidenceRef(
  source: string,
  key: string,
  options: Pick<EvidenceRef, "commitSha" | "path"> = {}
): EvidenceRef {
  return {
    source,
    key,
    ...(options.commitSha ? { commitSha: options.commitSha } : {}),
    ...(options.path ? { path: options.path } : {})
  };
}

function evidenceClaim(
  id: string,
  statement: string,
  evidence: EvidenceRef[],
  limitation: string
): EvidenceClaim {
  return { id, statement, evidence, limitation };
}

function evidenceSection(
  id: string,
  title: string,
  evidenceBasis: string,
  claims: EvidenceClaim[],
  limitation: string
): EvidenceReportSection {
  return { id, title, evidenceBasis, claims, limitation };
}

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function buildSections(input: ReportBuildInput): EvidenceReportSection[] {
  const sections: EvidenceReportSection[] = [];

  sections.push(
    evidenceSection(
      "overview",
      "Repository overview",
      "persisted repository metadata and completed analysis state",
      [
        evidenceClaim(
          "repository-state",
          "Repository \"" + input.repository.name + "\" was analyzed through target " +
            (input.analysis.target_head_sha ?? "an unavailable target head") + ".",
          [
            evidenceRef("repository", input.repository.id),
            ...(input.analysis.target_head_sha
              ? [
                  evidenceRef("analysis_run", input.analysis.id, {
                    commitSha: input.analysis.target_head_sha
                  })
                ]
              : [])
          ],
          "Stored analysis state does not prove the current remote source is unchanged."
        ),
        evidenceClaim(
          "history-size",
          String(input.persistedCommitCount) +
            " Git commits are persisted for this repository.",
          [evidenceRef("commit_history", "repository:" + input.repository.id)],
          "Persisted history may not include unreachable or rewritten remote commits."
        )
      ],
      "Overview describes stored state only."
    )
  );

  sections.push(
    evidenceSection(
      "development-history",
      "Development history sample",
      "persisted Git commit metadata",
      input.commits.map((commit, index) =>
        evidenceClaim(
          "commit-" + String(index + 1),
          commit.sha.slice(0, 12) + ": " + commit.subject,
          [evidenceRef("commit", commit.sha, { commitSha: commit.sha })],
          "Commit subjects do not independently establish intent, impact, or outcome."
        )
      ),
      "Only the configured sample is included; complete persisted history remains available from the commits API."
    )
  );

  sections.push(
    evidenceSection(
      "change-hotspots",
      "Change hotspots",
      "persisted file-change metrics",
      input.hotspots.map((item, index) =>
        evidenceClaim(
          "hotspot-" + String(index + 1),
          item.path +
            " was touched in " +
            String(item.commits_touched) +
            " commits with " +
            String(item.total_churn) +
            " lines of recorded churn.",
          [evidenceRef("file_change_metrics", item.path, { path: item.path })],
          "Change frequency and churn are activity signals, not quality verdicts."
        )
      ),
      "Hotspot ordering is historical activity, not a maintainability ranking."
    )
  );

  sections.push(
    evidenceSection(
      "quality-signals",
      "Quality-related historical signals",
      "bug-subject heuristics and repeated file history",
      [
        ...input.bugAreas.map((item, index) =>
          evidenceClaim(
            "bug-area-" + String(index + 1),
            item.path +
              " has " +
              String(item.signal_commits) +
              " bug/fix-signal commits across " +
              String(item.total_commits_touched) +
              " touched commits.",
            [evidenceRef("bug_area_signal", item.path, { path: item.path })],
            "Bug-area signals are commit-subject heuristics and do not prove defects or root cause."
          )
        ),
        ...input.repeatedlyModified.map((item, index) =>
          evidenceClaim(
            "repeated-file-" + String(index + 1),
            item.path +
              " has " +
              String(item.commits_touched) +
              " persisted touches across a " +
              String(item.change_span_days) +
              "-day observed span.",
            [evidenceRef("repeated_file_history", item.path, { path: item.path })],
            "Touch frequency is historical and is not an architectural or maintainability verdict."
          )
        )
      ].slice(0, input.sampleLimit),
      "These signals are observational and not causal conclusions."
    )
  );

  sections.push(
    evidenceSection(
      "evolution",
      "Architecture and change evolution",
      "persisted coupling, refactor, dependency, architecture, and complexity evidence",
      [
        ...input.coupling.map((item, index) =>
          evidenceClaim(
            "coupling-" + String(index + 1),
            item.path_a +
              " and " +
              item.path_b +
              " were changed together in " +
              String(item.co_change_count) +
              " persisted commits.",
            [
              evidenceRef(
                "file_change_coupling",
                item.path_a + "::" + item.path_b,
                { path: item.path_a }
              )
            ],
            "Co-change is not proof of dependency or architectural coupling."
          )
        ),
        ...input.refactors.map((item, index) =>
          evidenceClaim(
            "refactor-" + String(index + 1),
            item.sha.slice(0, 12) +
              " matches a refactor signal from the commit subject: " +
              item.subject,
            [evidenceRef("refactor_signal", item.sha, { commitSha: item.sha })],
            "Refactor classification is keyword-based and does not establish intent."
          )
        ),
        ...input.dependencyChanges.map((item, index) =>
          evidenceClaim(
            "dependency-" + String(index + 1),
            item.package_name +
              " (" +
              item.scope +
              ") changed from " +
              (item.previous_spec ?? "none") +
              " to " +
              (item.current_spec ?? "none") +
              ".",
            [evidenceRef("dependency_change", item.sha + ":" + item.package_name, { commitSha: item.sha })],
            "Dependency history does not establish runtime compatibility or production impact."
          )
        ),
        ...input.architectureEvents.map((item, index) =>
          evidenceClaim(
            "architecture-" + String(index + 1),
            item.event_type +
              " observed at " +
              item.path +
              " under " +
              item.root_path +
              ".",
            [evidenceRef("architecture_event", item.sha + ":" + item.path, { commitSha: item.sha, path: item.path })],
            "Architecture events are inferred from Git tree structure, not runtime topology."
          )
        ),
        ...input.complexityEvents.map((item, index) =>
          evidenceClaim(
            "complexity-" + String(index + 1),
            item.path +
              ": cyclomatic complexity changed from " +
              String(item.before_cyclomatic_complexity ?? "n/a") +
              " to " +
              String(item.after_cyclomatic_complexity ?? "n/a") +
              ".",
            [
              evidenceRef("code_complexity", item.sha, {
                commitSha: item.sha,
                path: item.path
              })
            ],
            "Complexity is AST-derived source evidence and may be absent when parsing limits apply."
          )
        )
      ].slice(0, input.sampleLimit),
      "Evolution sections describe history without claiming causality or future impact."
    )
  );

  sections.push(
    evidenceSection(
      "database-evolution",
      "Database and schema evolution",
      "parsed migration-file evidence",
      input.migrationEvents.slice(0, input.sampleLimit).map((item, index) =>
        evidenceClaim(
          "migration-" + String(index + 1),
          item.path +
            " in " +
            item.sha.slice(0, 12) +
            " contains " +
            String(item.operationCount) +
            " classified operations (" +
            item.migrationKind +
            ").",
          [
            evidenceRef("database_migration", item.id, {
              commitSha: item.sha,
              path: item.path
            })
          ],
          item.destructiveSignals.length > 0
            ? "Destructive/lock-sensitive markers are text heuristics, not proof of downtime, blocking, or data loss."
            : "Migration analysis describes source evidence and does not execute the target repository."
        )
      ),
      "Unsupported code-based migrations remain explicit rather than receiving fabricated SQL semantics."
    )
  );

  const testClaims = input.testEvolution.events.slice(0, Math.max(input.sampleLimit - 1, 0)).map((item, index) =>
    evidenceClaim(
      "test-" + String(index + 1),
      item.path +
        " changed by " +
        (item.testCaseDelta >= 0 ? "+" : "") +
        String(item.testCaseDelta) +
        " detected test cases in commit " +
        item.sha.slice(0, 12) +
        ".",
      [
        evidenceRef("test_evolution", item.id, {
          commitSha: item.sha,
          path: item.path
        })
      ],
      "Source-text counts do not prove test execution, pass/fail, or coverage."
    )
  );

  if (input.testSummary.eventCount > 0) {
    testClaims.unshift(
      evidenceClaim(
        "test-summary",
        "Persisted test-evolution evidence contains " +
          String(input.testSummary.eventCount) +
          " events with a net detected test-case delta of " +
          String(input.testSummary.testCaseDelta) +
          ".",
        [evidenceRef("test_evolution_summary", "repository:" + input.repository.id)],
        "This aggregates changed-test evidence, not a complete execution or coverage report."
      )
    );
  }

  sections.push(
    evidenceSection(
      "test-evolution",
      "Test evolution",
      "persisted test-source evolution",
      testClaims,
      "Test evolution is historical source evidence; runtime test execution is separate."
    )
  );

  const historicalRuntimeClaims = input.historicalRuntime
    ? input.historicalRuntime.events.map((event, index) =>
        evidenceClaim(
          "historical-runtime-" + String(index + 1),
          event.commit.sha.slice(0, 12) +
            " has runtime status " +
            event.runtimeEvidence.status +
            " with source context " +
            event.sourceContext.status +
            " (" +
            String(event.sourceContext.filesReported) +
            " changed files reported).",
          [
            evidenceRef("historical_runtime_commit", event.commit.sha, {
              commitSha: event.commit.sha
            }),
            ...event.sourceContext.changedFiles.slice(0, 3).map((file) =>
              evidenceRef("historical_runtime_source_file", event.commit.sha + ":" + file.path, {
                commitSha: event.commit.sha,
                path: file.path
              })
            )
          ],
          event.sourceContext.status === "truncated"
            ? "Changed-file context is truncated; runtime evidence remains commit-level and is not attributed to individual files."
            : "Historical runtime evidence is observational and does not establish that this commit caused the observed runtime measurement."
        )
      )
    : [];

  sections.push(
    evidenceSection(
      "historical-runtime",
      "Historical runtime and source context",
      "historical runtime reconstruction joined to persisted commit source-change context",
      historicalRuntimeClaims.slice(0, input.sampleLimit),
      input.historicalRuntime
        ? "Runtime observations are aligned to commit revisions and bounded source context. They do not establish causality, regression, or file-level runtime impact."
        : "Historical runtime reconstruction was unavailable for this report generation."
    )
  );

  const runtime = input.runtimeSummary.overall;
  const runtimeClaims =
    runtime.sampleCount > 0
      ? [
          evidenceClaim(
            "runtime-observations",
            String(runtime.sampleCount) +
              " runtime telemetry observations are persisted, with p95 duration " +
              String(runtime.p95DurationMs ?? "n/a") +
              " ms and observed error rate " +
              String(runtime.errorRate) +
              ".",
            [evidenceRef("runtime_telemetry_summary", "repository:" + input.repository.id)],
            "Runtime telemetry describes observed samples and does not prove that code changes caused a regression."
          ),
          ...input.runtimeSummary.groups.slice(0, input.sampleLimit).map((group, index) =>
            evidenceClaim(
              "runtime-group-" + String(index + 1),
              "Runtime group " +
                group.key +
                " contains " +
                String(group.sampleCount) +
                " observations with average duration " +
                String(group.avgDurationMs ?? "n/a") +
                " ms.",
              [evidenceRef("runtime_telemetry_group", group.key)],
              "Grouped telemetry may be incomplete when instrumentation coverage is partial."
            )
          )
        ]
      : [
          evidenceClaim(
            "runtime-none",
            "No persisted runtime telemetry observations are available for this repository.",
            [evidenceRef("runtime_telemetry_summary", "repository:" + input.repository.id)],
            "Absence of telemetry is not evidence that the application had no runtime activity or performance issues."
          )
        ];

  sections.push(
    evidenceSection(
      "runtime-observations",
      "Runtime observations",
      "observed runtime telemetry",
      runtimeClaims.slice(0, input.sampleLimit),
      "Runtime telemetry is optional and may represent only the instrumented portion of the application."
    )
  );

  return sections;
}

export function buildEvidenceReport(
  input: ReportBuildInput,
  generatedAt: Date = new Date()
): EvidenceReport {
  const sections = buildSections(input);
  const sectionsWithEvidence = sections.filter((item) => item.claims.length > 0).length;

  const unsigned = {
    reportVersion: REPORT_VERSION,
    analyzerVersion: input.analysis.analyzer_version || ANALYZER_VERSION,
    repository: {
      id: input.repository.id,
      name: input.repository.name,
      sourceType: input.repository.source_type,
      sourceUrl: input.repository.source_url,
      trackedBranch: input.repository.tracked_branch,
      defaultBranch: input.repository.default_branch,
      headSha: input.repository.head_sha
    },
    analysis: {
      runId: input.analysis.id,
      status: input.analysis.status,
      mode: input.analysis.analysis_mode,
      baseHeadSha: input.analysis.base_head_sha,
      targetHeadSha: input.analysis.target_head_sha,
      startedAt: input.analysis.started_at,
      completedAt: input.analysis.completed_at
    },
    coverage: {
      persistedCommits: input.persistedCommitCount,
      reportSampleLimit: input.sampleLimit,
      sectionsWithEvidence,
      sectionsWithoutEvidence: sections
        .filter((item) => item.claims.length === 0)
        .map((item) => item.id)
    },
    sections,
    evidencePolicy: [
      "Historical heuristics are signals, not proof of intent, causality, regression, outage, coverage, or production impact.",
      "Runtime telemetry is observational and depends on instrumentation coverage and the available observation window.",
      "Migration and test-source analysis is derived from persisted Git/source evidence and does not execute the target repository.",
      "Absence of an evidence source must not be interpreted as proof of absence."
    ]
  };

  return {
    ...unsigned,
    generatedAt: generatedAt.toISOString(),
    fingerprint: hashJson(unsigned)
  };
}

export async function generateEvidenceReport(
  repositoryId: string,
  sampleLimit = 10
): Promise<EvidenceReport> {
  const repository = await getRepositoryById(repositoryId);
  if (!repository) {
    throw new EvidenceReportRepositoryNotFoundError();
  }

  const analysis = await getLatestCompletedAnalysisRun(repositoryId);
  if (!analysis) {
    throw new EvidenceReportNotReadyError(
      "A completed analysis is required before a report can be generated."
    );
  }

  const [
    commitsResult,
    hotspots,
    bugAreas,
    repeatedlyModified,
    coupling,
    refactors,
    dependencyChanges,
    architectureEvents,
    complexityEvents,
    migrationResult,
    testResult,
    testSummary,
    runtimeSummary
  ] = await Promise.all([
    listRepositoryCommits(repositoryId, 1, sampleLimit),
    listRepositoryHotspots(repositoryId, sampleLimit),
    listRepeatedBugAreas(repositoryId, sampleLimit),
    listRepeatedlyModifiedFiles(repositoryId, 3, sampleLimit),
    listFileChangeCoupling(repositoryId, 2, sampleLimit),
    listRefactorSignals(repositoryId, sampleLimit),
    listDependencyChanges(repositoryId, sampleLimit),
    listArchitectureEvents(repositoryId, sampleLimit),
    listCodeComplexityEvents(repositoryId, sampleLimit),
    listDatabaseMigrationEvents(repositoryId, sampleLimit),
    listTestEvolutionEvents(repositoryId, sampleLimit),
    summarizeTestEvolution(repositoryId, {}, "testType", sampleLimit),
    summarizeRuntimeTelemetry(repositoryId, {}, "revision", sampleLimit)
  ]);

  const historicalRuntime =
    runtimeSummary.overall.sampleCount > 0
      ? buildHistoricalRuntimeSourceContextEvidence(
          await generateHistoricalRuntimeReconstruction(
            repositoryId,
            1,
            Math.min(sampleLimit, 10),
            60,
            10,
            {}
          )
        )
      : undefined;

  return buildEvidenceReport({
    repository,
    analysis,
    persistedCommitCount: commitsResult.total,
    sampleLimit,
    commits: commitsResult.commits,
    hotspots,
    bugAreas,
    repeatedlyModified,
    coupling,
    refactors,
    dependencyChanges,
    architectureEvents,
    complexityEvents,
    migrationEvents: migrationResult.events,
    testEvolution: testResult,
    testSummary: {
      eventCount: testSummary.overall.eventCount,
      testCaseCount: testSummary.overall.testCaseCount,
      testCaseDelta: testSummary.overall.testCaseDelta,
      assertionCount: testSummary.overall.assertionCount,
      assertionDelta: testSummary.overall.assertionDelta
    },
    runtimeSummary,
    historicalRuntime
  });
}
