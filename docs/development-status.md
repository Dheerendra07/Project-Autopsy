# Project Autopsy — Development Status

This file is the continuation checkpoint for Project Autopsy. Treat the repository state on `main` as the source of truth and do not remove already-merged features when continuing work.

## Product boundary

Project Autopsy reconstructs a software project's engineering journey from Git/code evidence. It is not a code summarizer or generic repository dashboard.

Evidence flow:

Git history + code/runtime evidence -> deterministic analysis -> evidence/metrics -> historical reconstruction -> reports -> AI interpretation

Git history alone must never be used to claim observed runtime performance regressions or proven bug causality.

## Completed on main

1. Backend foundation: Express, TypeScript, PostgreSQL, Redis, BullMQ, security middleware, configuration, migrations.
2. Repository ingestion: supported HTTPS Git hosts, isolated storage, clone size/time limits, repository persistence, queued analysis.
3. Commit evidence: commit metadata and changed-file evidence persisted in PostgreSQL.
4. File hotspots: deterministic commit-frequency/churn metrics with explicit binary-file handling.
5. Repeated bug areas: explicit fix/bug/regression commit-subject signals, minimum two signals per file.
6. Development timeline: chronological commit events with evidence-labeled keyword classification.
7. Architecture evolution: historical repository top-level and `src` top-level directory snapshots/events.
8. Dependency evolution: historical `package.json` dependency snapshots and added/removed/changed package signals, with dependency scope separation.
9. Refactor signals: commit-subject refactor candidates with explicit heuristic semantics.
10. Commit change statistics: per-commit and per-file additions/deletions from Git numstat.
11. File change coupling: deterministic file co-change counts from persisted commit evidence.

## Current work

Code complexity evolution is implemented on branch `feat/code-complexity-v1`. It adds AST-derived file-change evidence for TypeScript/JavaScript-family source files and keeps parse failures or oversized files explicitly marked instead of inventing metrics.

The runtime analyzer dependency is installed as a production dependency because complexity analysis executes inside the background worker.

## Code complexity evidence

API:

GET /api/repositories/:repositoryId/complexity?limit=100

Metrics:

- source line count
- function count
- class count
- cyclomatic complexity
- maximum control-flow nesting depth

Evidence basis: `typescript_ast_file_change_snapshots`.

The API reports before/after metrics and deltas per changed source file. Deleted files have an explicit deletion event; parse failures and oversized files do not produce fabricated after-metrics.

## Next planned layers

1. Incremental analysis keyed by commit SHA and analyzer version.
2. Repeatedly modified-file summaries and richer historical change statistics.
3. Runtime telemetry ingestion for observed performance history.
4. Database/schema evolution.
5. Test evolution.
6. Evidence-backed reports and interview stories.

## Verification rule

Every feature branch must pass GitHub Actions `typecheck`, `build`, and `test` before squash-merging to `main`. Do not merge based on code inspection alone.

## Local environment note

Windows local Docker is not currently available on the development machine (`docker` command not found). GitHub Actions provides the current automated compile/build/test verification; PostgreSQL/Redis local end-to-end verification remains pending Docker setup.

## Continuation checkpoint

The code-complexity branch starts from locked main commit `35cf14bce5d574071df5973450f1d4dc1452ee6e`. Preserve all existing API routes, evidence models, and migration history when continuing.

## Evidence semantics

- Change coupling means files changed together in the same persisted Git commit; it is not proof of architectural dependency.
- Refactor signals are keyword heuristics, not proof of developer intent.
- Bug-area signals are correlations, not proof of causality.
- Architecture history is based on Git tree structure, not runtime architecture.
- Code complexity is AST-derived from source snapshots; parse failures and size limits remain explicit.

## Change coupling API

GET /api/repositories/:repositoryId/coupling?minCoChanges=2&limit=50

A pair count means the two paths were both changed in the same persisted commit. It is a co-change signal, not proof of architectural dependency.
