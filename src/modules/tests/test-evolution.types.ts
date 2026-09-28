export type TestFramework =
  | "node_test"
  | "jest"
  | "vitest"
  | "mocha"
  | "ava"
  | "tap"
  | "playwright"
  | "cypress"
  | "unknown";

export type TestArtifactType =
  | "test_source"
  | "test_config"
  | "fixture";

export type TestType =
  | "unit"
  | "integration"
  | "e2e"
  | "contract"
  | "fixture"
  | "config"
  | "unknown";

export type TestChangeType =
  | "added"
  | "modified"
  | "deleted";

export type TestAnalysisStatus =
  | "supported_source"
  | "deleted"
  | "read_error";

export interface TestEvolutionEvent {
  sha: string;
  path: string;
  changeType: TestChangeType;
  framework: TestFramework;
  artifactType: TestArtifactType;
  testType: TestType;
  analysisStatus: TestAnalysisStatus;
  lineCount: number;
  previousLineCount: number;
  testCaseCount: number;
  previousTestCaseCount: number;
  testCaseDelta: number;
  suiteCount: number;
  previousSuiteCount: number;
  suiteDelta: number;
  hookCount: number;
  previousHookCount: number;
  hookDelta: number;
  assertionCount: number;
  previousAssertionCount: number;
  assertionDelta: number;
  mockCount: number;
  previousMockCount: number;
  mockDelta: number;
  contentHash: string | null;
  previousContentHash: string | null;
  coChangedProductionFiles: string[];
  signals: string[];
  warnings: string[];
}

export interface TestEvolutionFilters {
  framework?: TestFramework;
  artifactType?: TestArtifactType;
  testType?: TestType;
  changeType?: TestChangeType;
  analysisStatus?: TestAnalysisStatus;
}

export interface StoredTestEvolutionEvent extends TestEvolutionEvent {
  id: string;
  repositoryId: string;
  subject: string;
  committedAt: string | null;
}

export type TestEvolutionGroupBy =
  | "framework"
  | "artifactType"
  | "testType"
  | "changeType";

export interface TestEvolutionAggregate {
  eventCount: number;
  testCaseCount: number;
  testCaseDelta: number;
  suiteCount: number;
  suiteDelta: number;
  hookCount: number;
  hookDelta: number;
  assertionCount: number;
  assertionDelta: number;
  mockCount: number;
  mockDelta: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface TestEvolutionGroupAggregate
  extends TestEvolutionAggregate {
  key: string;
}
