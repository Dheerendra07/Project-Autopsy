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

Historical runtime reconstruction v1 is merged on main via PR #30. It walks persisted commits chronologically, reuses the existing runtime correlation and assessment evidence for each commit, exposes explicit evidence-gap coverage, and records deterministic adjacent-commit/window overlap context.

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

The original planned layers through evidence-backed interview stories are complete on main, and historical runtime reconstruction v1 is now also merged. Further work should be proposed as a new roadmap item and must preserve the existing evidence contracts and verification gates.

## Verification rule

Every feature branch must pass GitHub Actions `typecheck`, `build`, `test`, PostgreSQL migrations, migration idempotency, API startup/health, and worker startup/shutdown smoke checks before squash-merging to `main`. Do not merge based on code inspection alone.

## Local environment note

Windows local Docker is not currently available on the development machine (`docker` command not found). GitHub Actions provides the current automated compile/build/test verification; PostgreSQL/Redis local end-to-end verification remains pending Docker setup.

## Continuation checkpoint

Current verified main baseline: d8421a22219af4730a974000a76541630d80c721.

The current main baseline includes:
- runtime telemetry with PostgreSQL-backed integration verification
- database migration/schema evolution evidence
- test evolution evidence
- state-aware import/refresh/analyze retry recovery
- evidence-backed repository reports
- evidence-backed interview story scaffolds
- runtime↔Git revision correlation and deployment-aware filtering
- deterministic runtime change assessment
- historical runtime reconstruction with bounded pagination and temporal overlap context
- deployment evidence ingestion with idempotency/conflict protection and credential-like metadata rejection
- exact deployment↔runtime identity reconciliation
- deployment provenance completeness/partial/conflict assessment
- production configuration validation for runtime/deployment/API/AI access boundaries
- Render production Blueprint for web API, BullMQ worker, Render Key Value, and Render Postgres
- explicit 0.0.0.0 API binding for hosted traffic
- worker repository-storage rehydration after restart/redeploy
- local Autopsy development default isolated to port 5100; CI continues to use its own isolated test port 5000

Recent verified merge sequence for this continuation:
- PR #42 — AI provider retry hardening
- PR #43 — deployment evidence foundation
- PR #44 — runtime deployment identity link
- PR #46 — deployment-aware runtime correlation
- PR #51 — production deployment-ingestion configuration validation
- PR #52 — deployment provenance reconciliation
- PR #53 — centralized production configuration validation
- PR #54 — worker repository-storage rehydration
- PR #55 — Render production deployment preparation
- PR #56 — production API access gate

Final integrated verification on main:
- GitHub Actions typecheck: passed
- build: passed
- PostgreSQL migrations: passed
- full test suite: passed
- migration idempotency: passed
- server startup/health smoke: passed
- worker startup/shutdown smoke: passed

Preserve all existing API routes, evidence models, migrations, deterministic analyzer behavior, retry semantics, security boundaries, and shutdown behavior when continuing. New roadmap work must start from this verified baseline rather than reworking completed layers.

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

Analyzer version is now 0.4.0.

SQL parser regression coverage now locks comment/string/dollar-quote statement boundaries, deterministic operation classification, and migration-history add/modify/delete behavior.

### Test Evolution v1

Autopsy now reconstructs test-source evolution from Git history. Test events retain commit/path evidence, framework hints, artifact and test-type classification, before/after test/suite/hook/assertion/mock heuristics, deterministic content hashes, and co-changed production files. Source counts do not establish historical execution or pass/fail, and co-change does not establish coverage.

API: GET /api/repositories/:repositoryId/test-evolution
Summary: GET /api/repositories/:repositoryId/test-evolution/summary

The summary intentionally aggregates changed-test evidence rather than claiming a complete repository-wide test inventory.


## Audit hardening checkpoint — 2026-09-29

The runtime telemetry, database migration evidence, and test evolution layers were audited after implementation.

Hardening completed:
- Analysis/import/refresh job redelivery is now state-aware and will not reset a completed run.
- Import retries resume from a persisted clone checkpoint instead of deleting/recloning repository storage.
- Refresh retries resume from a persisted planning checkpoint instead of repeating remote refresh work.
- Runtime revision identity is required to be a full Git SHA (40 or 64 hex characters) so exact commit correlation remains deterministic.
- Runtime trace/span persistence constraints match OpenTelemetry identifier lengths.
- SQL migration classification is case-insensitive for normal SQL keyword syntax.
- Retry-recovery rules have dedicated unit coverage.

BullMQ job IDs remain deterministic, and the recovery logic treats queue deduplication as an optimization rather than the source of truth; the PostgreSQL analysis-run state is authoritative.


## Evidence-backed reports v1

The reports module now composes persisted repository evidence into an on-demand JSON report.

Endpoint:
GET /api/repositories/:repositoryId/report?limit=10

Report guarantees:
- Every claim carries an evidence source/key, with exact commit SHA/path references where the underlying evidence exposes them.
- The report fingerprint is stable for identical persisted evidence and report inputs; generation time is excluded from the fingerprint.
- Per-section evidence is bounded by the requested report limit.
- A report requires a completed analysis run; missing repositories return 404 and incomplete repositories return 409.
- Heuristics remain explicitly labeled as signals and are never upgraded into causal, quality, outage, coverage, or production-impact claims.

The report currently combines commit history, change hotspots, repeated-change/bug signals, co-change coupling, refactor signals, dependency and architecture evolution, code complexity, database migration evidence, test evolution, and observed runtime telemetry.


## Evidence-backed interview stories v1

Endpoint:
GET /api/repositories/:repositoryId/interview-stories?limit=6

The interview layer composes existing evidence-report sections into bounded story scaffolds for:
- change hotspots
- recurring quality investigation
- architecture/refactoring evolution
- database/schema evolution
- test evolution
- runtime observability

Every story separates evidence from personal ownership, intent, business/runtime outcome, and other details that must be verified before being stated in an interview. The layer does not invent first-person contributions or causal outcomes.


## AI evidence interpretation v1

Endpoint:

GET /api/repositories/:repositoryId/interpretation?limit=10

The interpretation layer is an optional provider-backed interpretation step over the existing evidence report. A Redis-backed result cache is used for repeated requests keyed by report fingerprint, prompt version, and model; cache failures are fail-open and never replace persisted evidence. It builds deterministic grounding from report claims, limits claims per section and total grounding size, and excludes repository source URLs from the provider payload.

Provider output is constrained to a strict structured schema and then validated server-side. Every theme and investigation question must reference evidence keys that were supplied in the grounding payload. Unknown evidence keys are rejected.

The interpretation contract permits:
- an executive summary grounded in supplied claims
- up to six evidence-linked themes
- up to six evidence-linked investigation questions
- explicit uncertainties

The contract forbids the model from becoming a source of truth for ownership, intent, business impact, deployment timing, incidents, root cause, regressions, or production outcomes. Missing evidence remains a verification task.

The default provider configuration uses the OpenAI Responses API structured-output path with `AI_MODEL=gpt-5.6-luna`. The provider key is optional at startup; requests return an explicit not-configured response when `AI_API_KEY` is absent. In production, configuring `AI_API_KEY` also requires `AI_INTERPRETATION_ACCESS_KEY`, and the interpretation endpoint validates that access credential before generating the report or calling the provider.

## End-to-end autopsy completion checkpoint — 2026-09-29

The roadmap that was locked for this continuation is complete on main.

Verified merge sequence:
- Runtime telemetry / database migration evidence / test evolution hardening: merged via PR #20.
- Evidence-backed repository reports: merged via PR #21.
- Evidence-backed interview story scaffolds: merged via PR #22.
- Runtime ↔ Git revision correlation evidence v1: merged via PR #23.
- Runtime correlation hardening: merged via PR #24.
- Deterministic runtime change assessment: merged via PR #28.
- Runtime assessment checkpoint: merged via PR #29.
- Historical runtime reconstruction: merged via PR #30.
- Deterministic runtime change assessment: merged via PR #28.

Current verification policy remains unchanged: feature branches must pass typecheck, build, test, PostgreSQL migrations, migration idempotency, API startup/health, and worker startup/shutdown smoke checks before merge.


## Runtime correlation evidence v1

Endpoint:
GET /api/repositories/:repositoryId/runtime/correlation?revisionSha=<sha>&windowMinutes=60&minSamples=10

The correlation layer aligns a persisted target Git revision with its first parent revision:
- baseline window: parent revision telemetry before the target commit timestamp
- target window: target revision telemetry after the target commit timestamp
- optional filters: environment, operationName, signalType
- explicit readiness states for missing revision/time/parent data and insufficient samples
- observed duration/error deltas are returned only as measurements

Evidence policy:
- "ready" means revision/time alignment and minimum sample requirements are satisfied; it is not a regression verdict.
- The comparison is observational and does not establish that a commit caused a runtime change.
- Workload changes, instrumentation coverage, deployment timing, and environmental factors can affect the comparison.
- The first parent must itself be persisted; a referenced-but-missing parent is returned as an explicit evidence gap.
- Correlation windows now expose the complete persisted aggregate shape: min/avg/p50/p95/p99/max duration, duration sample count, error count/rate, and observed time bounds.

### Runtime Git change context v1

The runtime correlation response now carries deterministic source-change context for the target Git revision:
- exact target commit SHA, subject, parent revision, commit timestamp, and persisted change statistics
- bounded changed-file evidence (maximum 100 paths)
- deterministic changed-file ordering by path/status/statistics
- explicit changedFilesTruncated and changedFilesComplete flags so callers can distinguish an intentional bound from incomplete persisted file evidence
- source-change context is returned even when runtime correlation is blocked by commit-time or parent-revision evidence gaps

This context is source evidence only. It does not turn observed runtime deltas into causal claims about the target commit.

### Runtime change assessment v1

Ready runtime correlations now include deterministic measurement structure for:
- average and p95 duration absolute deltas, relative percentage changes, and numeric direction
- error-rate delta and percentage-point change
- baseline/target sample counts, sample-count ratio, sample imbalance, and duration-data coverage
- exact environment, operation, and signal-type filter scope

Derived metrics are normalized to six decimal places to avoid floating-point representation noise. Assessment output is emitted only when correlation status is ready; insufficient-sample and other evidence-gap states remain explicit without interpretation.

The assessment is observational measurement only. Direction labels do not establish regressions, quality impact, or causality.


### Runtime historical reconstruction v1

Endpoint:

GET /api/repositories/:repositoryId/runtime/historical-correlation?page=1&limit=25&windowMinutes=60&minSamples=10

The historical runtime reconstruction layer walks persisted commits in deterministic chronological order and independently aligns each commit with the existing parent/target runtime-correlation logic.

It exposes:
- one runtime correlation result per persisted commit in the requested page
- deterministic sequence numbers based on chronological commit ordering
- ready versus explicit evidence-gap counts and per-status counts
- the same runtime assessment measurements already established by runtime correlation v1
- optional environment, operationName, and signalType filters applied identically to every commit comparison
- bounded pagination so large histories are reconstructed incrementally
- deterministic temporal context showing adjacent commit spacing and whether the selected runtime windows overlap

Evidence semantics:
- each commit is measured independently; the endpoint does not infer a causal chain between adjacent commits
- a ready correlation means only that the revision/time/parent/sample evidence requirements were satisfied
- missing revision, commit time, parent, or sample evidence remains an explicit status
- the resulting timeline is a historical evidence reconstruction, not a deployment history or proof that a commit produced an observed runtime change


### Runtime historical evidence summary v1

Endpoint:

GET /api/repositories/:repositoryId/runtime/historical-correlation/summary?page=1&limit=25&windowMinutes=60&minSamples=10

This page-level summary derives descriptive aggregates from the deterministic historical runtime reconstruction. It reports:
- ready versus evidence-gap coverage
- observed average-duration, p95-duration, and error-rate direction counts
- baseline/target sample totals and sample-count imbalance counts
- adjacent-commit runtime-window overlap coverage

The summary is intentionally descriptive. Direction counts do not identify regressions or preferred revisions, sample-count differences do not establish workload changes, and window overlap does not establish deployment order or causality.


### Runtime historical source-change context v1

Endpoint:

GET /api/repositories/:repositoryId/runtime/historical-correlation/source-context?page=1&limit=25&windowMinutes=60&minSamples=10

This projection connects each historical runtime comparison to the exact persisted commit-level source-change context already established by runtime correlation. It exposes:
- commit SHA, subject, parent, timestamp, and change statistics
- bounded changed-file evidence with complete/truncated state
- runtime status, observed deltas, and ready assessment measurements
- page-level coverage for source-context completeness and runtime/source-context combinations

The projection validates that source-context commit identity matches the historical commit before returning the event. Changed files remain evidence for the commit as a whole; runtime measurements are not attributed to individual files, and no causal or regression conclusion is inferred.
