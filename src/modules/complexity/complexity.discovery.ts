import { extname } from "node:path";
import { simpleGit } from "simple-git";
import ts from "@typescript/typescript6";

import type { DiscoveredCommit } from "../commits/commit.discovery.js";

export type ComplexityAnalysisStatus =
  | "supported"
  | "parse_error"
  | "skipped_too_large";

export interface CodeComplexityMetrics {
  sourceLines: number;
  functionCount: number;
  classCount: number;
  cyclomaticComplexity: number;
  maxNestingDepth: number;
}

export interface CodeComplexityAnalysis {
  status: ComplexityAnalysisStatus;
  metrics: CodeComplexityMetrics | null;
  parseErrorCount: number;
}

export interface CodeComplexityEvent {
  sha: string;
  path: string;
  changeType: "added" | "modified" | "deleted";
  analysisStatus: ComplexityAnalysisStatus;
  before: CodeComplexityMetrics | null;
  after: CodeComplexityMetrics | null;
}

export interface CodeComplexityCache {
  get(cacheKey: string): Promise<unknown | null>;
  set(cacheKey: string, value: CodeComplexityAnalysis): Promise<void>;
}

export interface CodeComplexityEvolutionResult {
  events: CodeComplexityEvent[];
  cacheHits: number;
  cacheMisses: number;
}

const MAX_SOURCE_BYTES = 2_000_000;

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs"
]);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  "out",
  ".next",
  ".nuxt",
  "generated"
]);

const COMPLEXITY_NESTING_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression
]);

function getScriptKind(filePath: string): ts.ScriptKind {
  switch (extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

export function isSupportedSourcePath(filePath: string): boolean {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const segments = normalizedPath.split("/").filter(Boolean);

  if (
    segments.some((segment) => IGNORED_DIRECTORIES.has(segment)) ||
    normalizedPath.endsWith(".d.ts") ||
    normalizedPath.endsWith(".min.js") ||
    normalizedPath.endsWith(".bundle.js")
  ) {
    return false;
  }

  return SUPPORTED_EXTENSIONS.has(extname(normalizedPath).toLowerCase());
}

export function analyzeSourceCode(
  source: string,
  filePath: string
): CodeComplexityAnalysis {
  if (!isSupportedSourcePath(filePath)) {
    return {
      status: "skipped_too_large",
      metrics: null,
      parseErrorCount: 0
    };
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return {
      status: "skipped_too_large",
      metrics: null,
      parseErrorCount: 0
    };
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly unknown[];
    }
  ).parseDiagnostics;

  const parseErrorCount = parseDiagnostics?.length ?? 0;

  if (parseErrorCount > 0) {
    return {
      status: "parse_error",
      metrics: null,
      parseErrorCount
    };
  }

  let functionCount = 0;
  let classCount = 0;
  let cyclomaticComplexity = 1;
  let currentNestingDepth = 0;
  let maxNestingDepth = 0;

  const visitor = (node: ts.Node): void => {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.Constructor:
        functionCount += 1;
        break;
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.ClassExpression:
        classCount += 1;
        break;
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        cyclomaticComplexity += 1;
        break;
      case ts.SyntaxKind.CaseClause:
        cyclomaticComplexity += 1;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const binaryExpression = node as ts.BinaryExpression;
        const operatorKind = binaryExpression.operatorToken.kind;

        if (
          operatorKind === ts.SyntaxKind.AmpersandAmpersandToken ||
          operatorKind === ts.SyntaxKind.BarBarToken ||
          operatorKind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          cyclomaticComplexity += 1;
        }
        break;
      }
      default:
        break;
    }

    const addsNesting = COMPLEXITY_NESTING_KINDS.has(node.kind);

    if (addsNesting) {
      currentNestingDepth += 1;
      maxNestingDepth = Math.max(
        maxNestingDepth,
        currentNestingDepth
      );
    }

    ts.forEachChild(node, visitor);

    if (addsNesting) {
      currentNestingDepth -= 1;
    }
  };

  visitor(sourceFile);

  const lines = source.split(/\r\n|\r|\n/);
  const sourceLines =
    lines.length === 1 && lines[0] === ""
      ? 0
      : source.endsWith("\n") || source.endsWith("\r")
        ? lines.length - 1
        : lines.length;

  return {
    status: "supported",
    metrics: {
      sourceLines,
      functionCount,
      classCount,
      cyclomaticComplexity,
      maxNestingDepth
    },
    parseErrorCount: 0
  };
}

function isCodeComplexityAnalysis(
  value: unknown
): value is CodeComplexityAnalysis {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    status?: unknown;
    metrics?: unknown;
    parseErrorCount?: unknown;
  };

  if (
    candidate.status !== "supported" &&
    candidate.status !== "parse_error" &&
    candidate.status !== "skipped_too_large"
  ) {
    return false;
  }

  if (
    !Number.isInteger(candidate.parseErrorCount) ||
    Number(candidate.parseErrorCount) < 0
  ) {
    return false;
  }

  if (candidate.metrics === null) {
    return true;
  }

  if (!candidate.metrics || typeof candidate.metrics !== "object") {
    return false;
  }

  const metrics = candidate.metrics as Record<string, unknown>;

  return [
    "sourceLines",
    "functionCount",
    "classCount",
    "cyclomaticComplexity",
    "maxNestingDepth"
  ].every(
    (key) =>
      Number.isSafeInteger(metrics[key]) &&
      Number(metrics[key]) >= 0
  );
}

export function parseBlobTree(
  output: string
): Map<string, string> {
  const blobShas = new Map<string, string>();

  for (const record of output.split("\0")) {
    if (!record) {
      continue;
    }

    const separatorIndex = record.indexOf("\t");

    if (separatorIndex <= 0) {
      continue;
    }

    const metadata = record.slice(0, separatorIndex).split(" ");
    const filePath = record.slice(separatorIndex + 1);
    const objectType = metadata[1];
    const objectSha = metadata[2];

    if (
      objectType === "blob" &&
      objectSha &&
      /^[0-9a-f]{7,64}$/i.test(objectSha) &&
      filePath
    ) {
      blobShas.set(filePath, objectSha);
    }
  }

  return blobShas;
}

async function readBlobShas(
  git: ReturnType<typeof simpleGit>,
  sha: string
): Promise<Map<string, string>> {
  const output = await git.raw([
    "ls-tree",
    "-r",
    "-z",
    "--full-name",
    sha
  ]);

  return parseBlobTree(output);
}

export async function discoverCodeComplexityEvolution(
  repositoryPath: string,
  commits: DiscoveredCommit[],
  cache?: CodeComplexityCache
): Promise<CodeComplexityEvolutionResult> {
  const git = simpleGit(repositoryPath);
  const previousByPath = new Map<string, CodeComplexityMetrics>();
  const events: CodeComplexityEvent[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const commit of commits) {
    let blobShas = new Map<string, string>();

    if (cache) {
      try {
        blobShas = await readBlobShas(git, commit.sha);
      } catch {
        blobShas = new Map();
      }
    }

    for (const file of commit.files) {
      if (!isSupportedSourcePath(file.path)) {
        continue;
      }

      const previous = previousByPath.get(file.path) ?? null;
      const isDeleted = file.status.startsWith("D");
      const changeType = isDeleted
        ? "deleted"
        : previous
          ? "modified"
          : "added";

      if (isDeleted) {
        if (previous) {
          events.push({
            sha: commit.sha,
            path: file.path,
            changeType,
            analysisStatus: "supported",
            before: previous,
            after: null
          });
          previousByPath.delete(file.path);
        }
        continue;
      }

      let analysis: CodeComplexityAnalysis | null = null;
      const blobSha = blobShas.get(file.path);

      if (cache && blobSha) {
        const cacheKey = `${blobSha}:${extname(file.path).toLowerCase()}`;
        const cachedValue = await cache.get(cacheKey);

        if (isCodeComplexityAnalysis(cachedValue)) {
          analysis = cachedValue;
          cacheHits += 1;
        } else {
          cacheMisses += 1;
        }
      } else if (cache) {
        cacheMisses += 1;
      }

      if (!analysis) {
        let source: string;

        try {
          source = await git.raw([
            "show",
            "--format=",
            "--no-ext-diff",
            "--no-textconv",
            commit.sha + ":" + file.path
          ]);
        } catch {
          continue;
        }

        analysis = analyzeSourceCode(source, file.path);

        if (cache && blobSha) {
          const cacheKey = `${blobSha}:${extname(file.path).toLowerCase()}`;
          try {
            await cache.set(cacheKey, analysis);
          } catch {
            // Cache is an optimization; analysis correctness does not depend
            // on a cache write succeeding.
          }
        }
      }

      if (analysis.status !== "supported" || !analysis.metrics) {
        events.push({
          sha: commit.sha,
          path: file.path,
          changeType,
          analysisStatus: analysis.status,
          before: previous,
          after: null
        });

        previousByPath.delete(file.path);
        continue;
      }

      events.push({
        sha: commit.sha,
        path: file.path,
        changeType,
        analysisStatus: "supported",
        before: previous,
        after: analysis.metrics
      });

      previousByPath.set(file.path, analysis.metrics);
    }
  }

  return {
    events,
    cacheHits,
    cacheMisses
  };
}