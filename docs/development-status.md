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
12. Runtime hardening: graceful shutdown, public-response redaction, repository import retry safety, and deployment-path CI verification.

## Current work

Code complexity evolution is merged on main and runs as analyzer version `0.2.1`. It adds AST-derived file-change evidence for TypeScript/JavaScript-family source files and keeps parse failures or oversized files explicitly marked instead of inventing metrics.

Runtime hardening is also merged: API and worker graceful shutdown, public-response redaction of internal paths/errors, TCP port validation, and a deployment-path CI gate using PostgreSQL and Redis service containers.

The deterministic analyzer cache is merged on main. It reuses complexity analysis by Git blob SHA and analyzer version.

Full incremental repository analysis is merged on main. Incremental runs are anchored to a previously completed target head and process only the new commit range for commit/dependency/architecture/complexity evidence. File-churn and coupling aggregates still rebuild from persisted/full Git evidence in v1 so their results remain idempotent and correct on retries.

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

1. Repeatedly modified-file summaries and richer historical change statistics.
2. Runtime telemetry ingestion for observed performance history.
3. Database/schema evolution.
4. Database/schema evolution.
5. Test evolution.
6. Evidence-backed reports and interview stories.

## Verification rule

Every feature branch must pass GitHub Actions `typecheck`, `build`, `test`, PostgreSQL migrations, migration idempotency, API startup/health, and worker startup/shutdown smoke checks before squash-merging to `main`. Do not merge based on code inspection alone.

## Local environment note

Windows local Docker is not currently available on the development machine (`docker` command not found). GitHub Actions provides the current automated compile/build/test verification; PostgreSQL/Redis local end-to-end verification remains pending Docker setup.

## Continuation checkpoint

Locked main baseline for the current hardening work: `6efc30ccfd5d701daeae2e3b93413d83f74d5c8f`. The runtime hardening, deployment verification, and retry-safety changes are now part of main. Preserve all existing API routes, evidence models, migrations, and shutdown behavior when continuing.

## Evidence semantics

- Change coupling means files changed together in the same persisted Git commit; it is not proof of architectural dependency.
- Refactor signals are keyword heuristics, not proof of developer intent.
- Bug-area signals are correlations, not proof of causality.
- Architecture history is based on Git tree structure, not runtime architecture.
- Code complexity is AST-derived from source snapshots; parse failures and size limits remain explicit.

## Change coupling API

GET /api/repositories/:repositoryId/coupling?minCoChanges=2&limit=50

A pair count means the two paths were both changed in the same persisted commit. It is a co-change signal, not proof of architectural dependency.


## Analysis cache v1

Migration: `007_analysis_cache.sql`.

Cache entries are keyed by:
- repository ID
- analyzer name
- analyzer version
- Git blob SHA plus source extension

The cache stores deterministic analysis results only. It does not store repository source code. Cache reads and writes are best-effort optimization paths; a cache failure must not change the analysis result.

The current code-complexity worker exposes cache hit/miss counts in the BullMQ job result. First-pass source parsing remains unchanged; repeated analysis of identical blobs can reuse the cached AST metrics.


## Incremental analysis v1

Migration: `008_incremental_analysis.sql`.

Analysis runs now record:
- `analysis_mode`: full or incremental
- `base_head_sha`
- `target_head_sha`

Repositories record `tracked_branch`, which is the branch selected during import and refreshed during re-analysis.

Re-analysis API:

POST /api/repositories/:repositoryId/analyze

Planning rules:
- target == latest completed head -> up to date
- latest completed head is an ancestor -> incremental
- no valid previous head or divergent history -> full

Only one queued/running analysis is permitted per repository at the database level.

For v1, commit history and historical dependency/architecture/complexity evidence can be appended from a new commit range. File churn and co-change coupling continue to rebuild from complete evidence so repeated execution remains idempotent.

Repository import is asynchronous in the current branch: the HTTP layer persists a pending repository and queues an import job; the worker clones the repository, records its target head, and then queues the initial analysis job.

## Async import v1

POST /api/repositories/import now returns `202 Accepted` after validating and persisting a pending repository. The clone is performed by the background worker instead of the HTTP request.

The import job uses the same BullMQ queue as analysis with an explicit `kind` discriminator. Existing analysis jobs without a kind continue to be treated as analysis jobs for backward compatibility.

Import failure marks the analysis run as failed and the clone service removes partial repository storage. Successful import updates tracked branch, default branch, repository head SHA, and analysis target SHA before enqueueing the analysis job.
