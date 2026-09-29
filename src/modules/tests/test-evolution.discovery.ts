import { createHash } from "node:crypto";
import path from "node:path";
import { simpleGit } from "simple-git";
import { createAnalysisGit } from "../analysis/analysis-git.js";

import type { DiscoveredCommit } from "../commits/commit.discovery.js";
import type {
  TestAnalysisStatus,
  TestArtifactType,
  TestChangeType,
  TestEvolutionEvent,
  TestFramework,
  TestType
} from "./test-evolution.types.js";

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".mts",
  ".cts"
]);

const TEST_CONFIG_BASENAMES = new Set([
  "jest.config.js",
  "jest.config.cjs",
  "jest.config.mjs",
  "jest.config.ts",
  "vitest.config.js",
  "vitest.config.ts",
  "vitest.config.mts",
  "mocha.config.js",
  "mocha.config.cjs",
  "playwright.config.js",
  "playwright.config.ts",
  "cypress.config.js",
  "cypress.config.ts",
  "karma.conf.js",
  "karma.conf.ts"
]);

const TEST_DIRECTORIES = new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "e2e",
  "integration",
  "integrations",
  "contract",
  "contracts",
  "fixtures",
  "__fixtures__"
]);

const FRAMEWORKS: Array<[RegExp, TestFramework]> = [
  [/from\s+["']node:test["']/i, "node_test"],
  [/from\s+["']vitest["']/i, "vitest"],
  [/from\s+["']@jest\/globals["']/i, "jest"],
  [/from\s+["']@playwright\/test["']/i, "playwright"],
  [/from\s+["']cypress["']/i, "cypress"],
  [/from\s+["']mocha["']/i, "mocha"],
  [/from\s+["']ava["']/i, "ava"],
  [/from\s+["']tap["']/i, "tap"]
];

const PACKAGE_FRAMEWORKS: Array<[string[], TestFramework]> = [
  [["@playwright/test"], "playwright"],
  [["cypress"], "cypress"],
  [["vitest"], "vitest"],
  [["jest"], "jest"],
  [["mocha"], "mocha"],
  [["ava"], "ava"],
  [["tap"], "tap"]
];

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function segments(filePath: string): string[] {
  return normalizePath(filePath)
    .toLowerCase()
    .split("/")
    .filter(Boolean);
}

function basename(filePath: string): string {
  return path.basename(normalizePath(filePath)).toLowerCase();
}

function isTestConfigPath(filePath: string): boolean {
  const name = basename(filePath);

  if (TEST_CONFIG_BASENAMES.has(name)) {
    return true;
  }

  return /(?:^|\.)(jest|vitest|mocha|playwright|cypress|karma)(?:\.config|\.conf)?\./i.test(
    name
  );
}

export function isTestEvolutionPath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();

  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }

  if (isTestConfigPath(filePath)) {
    return true;
  }

  const name = basename(filePath);

  if (
    /(?:\.test|\.spec)\.(?:c|m)?(?:j|t)sx?$/.test(name) ||
    /[-_.]test\.(?:c|m)?(?:j|t)sx?$/.test(name) ||
    /[-_.]spec\.(?:c|m)?(?:j|t)sx?$/.test(name)
  ) {
    return true;
  }

  return segments(filePath).some((segment) =>
    TEST_DIRECTORIES.has(segment)
  );
}

function detectArtifactType(filePath: string): TestArtifactType {
  if (isTestConfigPath(filePath)) {
    return "test_config";
  }

  if (
    segments(filePath).some((segment) =>
      ["fixtures", "__fixtures__"].includes(segment)
    )
  ) {
    return "fixture";
  }

  return "test_source";
}

function detectTestType(
  filePath: string,
  artifactType: TestArtifactType,
  framework: TestFramework
): TestType {
  if (artifactType === "test_config") {
    return "config";
  }

  if (artifactType === "fixture") {
    return "fixture";
  }

  const lower = normalizePath(filePath).toLowerCase();
  const parts = segments(filePath);

  if (
    framework === "playwright" ||
    framework === "cypress" ||
    parts.includes("e2e") ||
    /(?:\.e2e\.|[-_]e2e[-_.])/.test(lower)
  ) {
    return "e2e";
  }

  if (
    parts.includes("integration") ||
    parts.includes("integrations") ||
    /(?:\.integration\.|[-_]integration[-_.])/.test(lower)
  ) {
    return "integration";
  }

  if (
    parts.includes("contract") ||
    parts.includes("contracts") ||
    /\bpact\b/.test(lower)
  ) {
    return "contract";
  }

  if (parts.includes("unit") || /(?:\.unit\.|[-_]unit[-_.])/.test(lower)) {
    return "unit";
  }

  return "unknown";
}

function parsePackageFramework(
  packageJsonSource: string | null
): TestFramework {
  if (!packageJsonSource) {
    return "unknown";
  }

  try {
    const parsed = JSON.parse(packageJsonSource) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      scripts?: Record<string, unknown>;
    };

    const packageNames = new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {})
    ]);

    for (const [names, framework] of PACKAGE_FRAMEWORKS) {
      if (names.some((name) => packageNames.has(name))) {
        return framework;
      }
    }

    const testScript = String(parsed.scripts?.test ?? "");

    if (/node\s+--test|node:test/.test(testScript)) {
      return "node_test";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

export function detectTestFramework(
  filePath: string,
  source: string,
  packageJsonSource: string | null
): TestFramework {
  for (const [pattern, framework] of FRAMEWORKS) {
    if (pattern.test(source)) {
      return framework;
    }
  }

  return parsePackageFramework(packageJsonSource);
}

export interface TestSourceMetrics {
  lineCount: number;
  testCaseCount: number;
  suiteCount: number;
  hookCount: number;
  assertionCount: number;
  mockCount: number;
}

export function analyzeTestSource(source: string): TestSourceMetrics {
  return {
    lineCount:
      source.length === 0
        ? 0
        : source.split(/\r\n|\r|\n/).length,
    testCaseCount: (
      source.match(
        /\b(?:test|it|specify)(?:\.(?:each|concurrent|skip|only))?\s*\(/g
      ) ?? []
    ).length,
    suiteCount: (
      source.match(
        /\b(?:describe|suite|context)(?:\.(?:each|skip|only))?\s*\(/g
      ) ?? []
    ).length,
    hookCount: (
      source.match(
        /\b(?:beforeEach|afterEach|beforeAll|afterAll|before|after)\s*\(/g
      ) ?? []
    ).length,
    assertionCount:
      (source.match(/\bexpect\s*\(/g) ?? []).length +
      (source.match(/\bassert(?:\.\w+)?\s*\(/g) ?? []).length,
    mockCount:
      (source.match(
        /\b(?:jest|vi)\.(?:mock|spyOn|fn)\s*\(/g
      ) ?? []).length +
      (source.match(/\bsinon\.(?:stub|spy|mock)\s*\(/g) ?? []).length
  };
}

function sha256(source: string): string {
  return createHash("sha256")
    .update(source, "utf8")
    .digest("hex");
}

async function showFile(
  git: ReturnType<typeof simpleGit>,
  commitSha: string,
  filePath: string
): Promise<string | null> {
  try {
    return await git.show([commitSha + ":" + filePath]);
  } catch {
    return null;
  }
}

async function getPackageJson(
  git: ReturnType<typeof simpleGit>,
  commitSha: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (cache.has(commitSha)) {
    return cache.get(commitSha) ?? null;
  }

  const source = await showFile(git, commitSha, "package.json");
  cache.set(commitSha, source);
  return source;
}

function productionFilesFromCommit(
  commit: DiscoveredCommit
): string[] {
  return commit.files
    .map((file) => file.path)
    .filter((filePath) => {
      const extension = path.extname(filePath).toLowerCase();

      return (
        SOURCE_EXTENSIONS.has(extension) &&
        !isTestEvolutionPath(filePath)
      );
    })
    .sort();
}

function metricDelta(current: number, previous: number): number {
  return current - previous;
}

function buildSignals(
  changeType: TestChangeType,
  artifactType: TestArtifactType,
  testType: TestType,
  testCaseCount: number,
  testCaseDelta: number,
  productionFileCount: number
): string[] {
  const signals = [
    "heuristic:test-source-analysis",
    "heuristic:test-framework-detection"
  ];

  signals.push("change:" + changeType);
  signals.push("artifact:" + artifactType);
  signals.push("test-type:" + testType);

  if (testCaseCount > 0) {
    signals.push("contains:test-cases");
  }

  if (testCaseDelta > 0) {
    signals.push("trend:test-cases-increased");
  } else if (testCaseDelta < 0) {
    signals.push("trend:test-cases-decreased");
  }

  if (productionFileCount > 0) {
    signals.push("coupling:co-changed-production-files");
  }

  return [...new Set(signals)].sort();
}

function buildWarnings(
  analysisStatus: TestAnalysisStatus,
  artifactType: TestArtifactType
): string[] {
  const warnings = [
    "Test/suite/assertion counts are source-text heuristics, not proof of execution or pass/fail.",
    "Framework detection is based on source/config/package evidence and may be incomplete."
  ];

  if (artifactType === "test_source") {
    warnings.push(
      "Co-changed production files indicate Git co-change coupling, not measured test coverage."
    );
  }

  if (analysisStatus === "deleted") {
    warnings.push(
      "Before-metrics describe the last available test content before deletion; after-metrics are zero."
    );
  }

  if (analysisStatus === "read_error") {
    warnings.push(
      "Test content could not be read from the recorded Git object."
    );
  }

  return warnings;
}

export async function discoverTestEvolution(
  repositoryPath: string,
  commits: DiscoveredCommit[]
): Promise<TestEvolutionEvent[]> {
  const git = createAnalysisGit(repositoryPath);
  const packageCache = new Map<string, string | null>();
  const events: TestEvolutionEvent[] = [];

  for (const commit of commits) {
    const testFiles = commit.files.filter((file) =>
      isTestEvolutionPath(file.path)
    );

    if (testFiles.length === 0) {
      continue;
    }

    const coChangedProductionFiles =
      productionFilesFromCommit(commit);

    const packageJsonSource = await getPackageJson(
      git,
      commit.sha,
      packageCache
    );

    for (const file of testFiles) {

      const changeType: TestChangeType =
        file.status === "A"
          ? "added"
          : file.status === "D"
            ? "deleted"
            : "modified";

      const currentSource =
        changeType === "deleted"
          ? null
          : await showFile(git, commit.sha, file.path);

      const previousSource =
        changeType === "added" || !commit.parentShas[0]
          ? null
          : await showFile(git, commit.parentShas[0], file.path);

      const analysisStatus: TestAnalysisStatus =
        currentSource !== null
          ? "supported_source"
          : changeType === "deleted" && previousSource !== null
            ? "deleted"
            : "read_error";

      const sourceForFramework =
        currentSource ?? previousSource ?? "";

      const framework = detectTestFramework(
        file.path,
        sourceForFramework,
        packageJsonSource
      );

      const artifactType = detectArtifactType(file.path);
      const testType = detectTestType(
        file.path,
        artifactType,
        framework
      );

      const emptyMetrics: TestSourceMetrics = {
        lineCount: 0,
        testCaseCount: 0,
        suiteCount: 0,
        hookCount: 0,
        assertionCount: 0,
        mockCount: 0
      };

      const previousMetrics = previousSource
        ? analyzeTestSource(previousSource)
        : emptyMetrics;

      const currentMetrics = currentSource
        ? analyzeTestSource(currentSource)
        : emptyMetrics;

      events.push({
        sha: commit.sha,
        path: file.path,
        changeType,
        framework,
        artifactType,
        testType,
        analysisStatus,
        lineCount: currentMetrics.lineCount,
        previousLineCount: previousMetrics.lineCount,
        testCaseCount: currentMetrics.testCaseCount,
        previousTestCaseCount: previousMetrics.testCaseCount,
        testCaseDelta: metricDelta(
          currentMetrics.testCaseCount,
          previousMetrics.testCaseCount
        ),
        suiteCount: currentMetrics.suiteCount,
        previousSuiteCount: previousMetrics.suiteCount,
        suiteDelta: metricDelta(
          currentMetrics.suiteCount,
          previousMetrics.suiteCount
        ),
        hookCount: currentMetrics.hookCount,
        previousHookCount: previousMetrics.hookCount,
        hookDelta: metricDelta(
          currentMetrics.hookCount,
          previousMetrics.hookCount
        ),
        assertionCount: currentMetrics.assertionCount,
        previousAssertionCount: previousMetrics.assertionCount,
        assertionDelta: metricDelta(
          currentMetrics.assertionCount,
          previousMetrics.assertionCount
        ),
        mockCount: currentMetrics.mockCount,
        previousMockCount: previousMetrics.mockCount,
        mockDelta: metricDelta(
          currentMetrics.mockCount,
          previousMetrics.mockCount
        ),
        contentHash: currentSource ? sha256(currentSource) : null,
        previousContentHash: previousSource
          ? sha256(previousSource)
          : null,
        coChangedProductionFiles,
        signals: buildSignals(
          changeType,
          artifactType,
          testType,
          currentMetrics.testCaseCount,
          metricDelta(
            currentMetrics.testCaseCount,
            previousMetrics.testCaseCount
          ),
          coChangedProductionFiles.length
        ),
        warnings: buildWarnings(
          analysisStatus,
          artifactType
        )
      });
    }
  }

  return events;
}
