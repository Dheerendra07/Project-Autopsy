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
12. Repeatedly modified files: deterministic historical file-change summaries derived from persisted Git evidence.

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

1. Runtime telemetry ingestion for observed performance history.
2. Database/schema evolution.
3. Test evolution.
4. Evidence-backed reports and interview stories.

## Verification rule

Every feature branch must pass GitHub Actions `typecheck`, `build`, `test`, PostgreSQL migrations, migration idempotency, API startup/health, and worker startup/shutdown smoke checks before squash-merging to `main`. Do not merge based on code inspection alone.

## Local environment note

Windows local Docker is not currently available on the development machine (`docker` command not found). GitHub Actions provides the current automated compile/build/test verification; PostgreSQL/Redis local end-to-end verification remains pending Docker setup.

## Continuation checkpoint

Locked main baseline for this feature: `8cb2f8a0cc0488bb39ae348f4a238225cc08c014`. The runtime hardening and deployment verification changes are now part of main. Preserve all existing API routes, evidence models, migrations, and shutdown behavior when continuing.

## Evidence semantics

- Change coupling means files changed together in the same persisted Git commit; it is not proof of architectural dependency.
- Refactor signals are keyword heuristics, not proof of developer intent.
- Bug-area signals are correlations, not proof of causality.
- Architecture history is based on Git tree structure, not runtime architecture.
- Code complexity is AST-derived from source snapshots; parse failures and size limits remain explicit.

## Repeatedly modified files API

GET /api/repositories/:repositoryId/repeatedly-modified-files?minTouches=3&limit=20

This endpoint reports files touched by at least the requested number of persisted commits. It exposes line churn and the observed first/last change timestamps. Ordering is deterministic and this is a historical change-frequency signal, not a claim that a file is architecturally problematic.

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

## Asynchronous re-analysis hardening

`POST /api/repositories/:repositoryId/analyze` now only creates a queued refresh/check run. Remote Git refresh, ancestry detection, and full/incremental planning execute in the worker.

The temporary `check` mode is a coordination state. If the refreshed target is already the latest completed analyzed head, the check run completes without creating a false analysis event. Otherwise the worker converts the same run into `full` or `incremental` before chaining the analysis job.

Refresh jobs use bounded retries with exponential backoff. The existing PostgreSQL partial unique index keeps one queued/running analysis or refresh per repository.

Repository import is asynchronous in the current branch: the HTTP layer persists a pending repository and queues an import job; the worker clones the repository, records its target head, and then queues the initial analysis job.

## Async import v1

POST /api/repositories/import now returns `202 Accepted` after validating and persisting a pending repository. The clone is performed by the background worker instead of the HTTP request.

The import job uses the same BullMQ queue as analysis with an explicit `kind` discriminator. Existing analysis jobs without a kind continue to be treated as analysis jobs for backward compatibility.

Import failure marks the analysis run as failed and the clone service removes partial repository storage. Successful import updates tracked branch, default branch, repository head SHA, and analysis target SHA before enqueueing the analysis job.

## Runtime telemetry v1 — feat/runtime-telemetry

Implemented on branch `feat/runtime-telemetry` from baseline `05a99c2718ab23d3dd51b23c8858ba69612a2afa`.

- Migration: `009_runtime_telemetry.sql`
- Ingestion: POST `/api/repositories/:repositoryId/runtime/telemetry`
- Query: GET `/api/repositories/:repositoryId/runtime/telemetry`
- Summary: GET `/api/repositories/:repositoryId/runtime/telemetry/summary`
- Batch limit: 500 events
- Idempotency: repository + eventId + SHA-256 payload fingerprint
- Conflicting event reuse is rejected transactionally; mixed batches never partially commit.
- Production ingestion requires `RUNTIME_TELEMETRY_INGEST_KEY` with bearer/header support and constant-time comparison.
- Events carry operation identity, duration, status, optional revision SHA, trace/span IDs, and bounded attributes.
- Summary exposes min/avg/p50/p95/p99/max duration and error rate with grouping by revision, operation, service, environment, or signal type.
- Revision groups expose whether the observed revision exists in persisted Git commit evidence.
- Runtime telemetry remains observational evidence; regression/cause inference is deferred until compatible windows, revision identity, and sample sufficiency are checked.

### Runtime persistence verification

The feature branch includes PostgreSQL-backed integration coverage for idempotent duplicates, conflicting event IDs, transactional mixed-batch rollback, filtered event reads, percentile aggregates, and revision-to-commit correlation. The CI workflow runs database migrations before the test suite so these checks execute against PostgreSQL rather than mocks.

### Database migration / schema evolution evidence v1

The analyzer now reconstructs database-migration history from Git commit evidence without executing the target repository's migrations.

Supported deterministic SQL evidence includes common CREATE/DROP/ALTER TABLE, column rename/type/nullability changes, constraints, indexes, views, schemas, types, sequences, functions, and common data operations. Code-based migrations are retained as evidence with an explicit unsupported-code status rather than receiving fabricated SQL semantics.

Each migration event stores its source commit, migration path, framework hint, analysis status, schema/data/mixed classification, operation counts, statement/content hashes, destructive or lock-sensitive signals, and warnings. SQL statement splitting handles quoted strings, comments, and PostgreSQL dollar-quoted bodies.

API: GET /api/repositories/:repositoryId/database-migrations

Filters: framework, changeType, migrationKind, operationType, with deterministic historical ordering.

Evidence policy: destructive/lock-sensitive signals are heuristics about migration text. They do not establish that a production deployment experienced downtime, blocking, data loss, or a performance regression.

Analyzer version is now 0.3.0.
