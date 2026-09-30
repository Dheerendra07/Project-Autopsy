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

## Release readiness

The backend product layers through evidence-backed reports, interview story scaffolds, grounded AI interpretation, runtime correlation, deployment provenance, historical reconstruction, and bounded asynchronous analysis are implemented on `main`.

Hosted Render verification completed on 2026-09-30:
- the production service `project-autopsy` is live on the Free web service
- PostgreSQL migrations completed successfully during deploy
- PostgreSQL and Redis connected successfully after restart
- `/health` returned HTTP 200
- `/ready` returned HTTP 200 with database and Redis ready
- the post-restart runtime produced no Redis `ECONNRESET`, Redis readiness timeout, or optimistic-volatile eviction warning
- the production runtime passed the existing API authentication/security contract checks

The remaining verification items are environment/infrastructure-specific rather than missing backend product functionality:
- local PostgreSQL/Redis integration requires Docker on the development machine
- browser CORS origins must be supplied when the frontend origin exists
- optional AI interpretation requires its production credentials
- GitHub Actions run `855` is currently blocked by a runner/provisioning failure before workflow steps execute; this does not represent a typecheck, build, test, or backend runtime failure

Every future product change must preserve the evidence-first semantics, deterministic fingerprints, security boundaries, explicit evidence-gap behavior, and bounded execution contracts.

## Production hardening continuation — 2026-09-30

Verified hardening merged after the end-to-end acceptance checkpoint:
- Production CORS is now restricted to explicitly configured origins while development/test behavior remains compatible.
- API responses expose `X-Request-Id`; valid UUID request IDs can be propagated, invalid IDs are replaced, and Morgan/error logs carry the same correlation ID.
- Analysis Git operations across all seven discovery modules use a centralized timeout derived from `MAX_ANALYSIS_TIME_MINUTES`.
- Each BullMQ import/refresh/analyze job now receives one shared cooperative deadline. The remaining budget is propagated through `AsyncLocalStorage`, active Git work receives an `AbortSignal`, and stage boundaries refuse to continue after expiry.
- Repository clone/refresh/recovery Git operations and recursive repository-size accounting use the same deadline context.
- `MAX_ANALYSIS_TIME_MINUTES` is bounded to a maximum of 1440 minutes.
- PostgreSQL statement and client query execution are bounded to 120 seconds.
- API HTTP request, header, and keep-alive lifetimes are explicitly bounded.
- The analysis worker uses an explicit 120-second lock duration and 30-second stall check interval to reduce false redelivery during CPU-heavy source analysis.
- AI interpretation Redis cache reads and writes are bounded to a 2-second cache-operation timeout; cache failures remain fail-open.

The worker deadline is cooperative for non-Git asynchronous work: a deadline cannot forcibly interrupt an arbitrary JavaScript or database operation that does not accept cancellation. Git operations use simple-git's abort support so an expired shared deadline can terminate in-flight Git work.

## End-to-end acceptance v1

The CI quality gate now includes a dedicated real-pipeline acceptance flow:

- starts the built API and BullMQ analysis worker against CI PostgreSQL and Redis services
- imports a fresh public HTTPS Git repository through the HTTP API
- polls the exact persisted analysis run until terminal state
- verifies successful analysis target identity
- generates the evidence report from the completed snapshot
- verifies report fingerprint shape, run identity, target identity, and non-empty evidence sections

The acceptance run exposed and locked two PostgreSQL persistence contract bugs that unit-level module coverage had not exercised:
- analysis status parameter type inference in `updateAnalysisRun`
- file churn `binaryChanges` camelCase to `binary_changes` persistence mapping

Both were fixed and covered by database-backed regression tests.

## Verification rule

Every feature branch must pass GitHub Actions `typecheck`, `build`, `test`, PostgreSQL migrations, migration idempotency, API startup/health, and worker startup/shutdown smoke checks before squash-merging to `main`. Do not merge based on code inspection alone.

## Local environment note

Windows local Docker is not currently available on the development machine (`docker` command not found). GitHub Actions provides the current automated compile/build/test verification; PostgreSQL/Redis local end-to-end verification remains pending Docker setup.

## Continuation checkpoint

Current verified main baseline: 089f17d4ae22c978234defc6d41af17b268a8ad7.

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
- Render Key Value production wiring uses the service connection string through `REDIS_URL`, while local host/port configuration remains supported
- HTTP-level API access, health, and authenticated not-found contract coverage in CI
- Report generation is fenced to the latest completed analysis target so partial re-analysis evidence is not surfaced
- Report generation revalidates the repository head and exact completed analysis snapshot after all evidence collection, including historical runtime reconstruction
- Worker analysis can re-hydrate missing or unusable repository Git storage from persisted source/branch metadata without changing the persisted analysis target
- Public `/health` is a dependency-independent liveness endpoint; `/ready` checks PostgreSQL and Redis readiness with bounded Redis probing and returns `503` when required dependencies are unavailable
- Runtime telemetry and deployment revision SHA inputs are canonicalized to lowercase for deterministic cross-source correlation
- Asynchronous analysis runs expose a scoped polling endpoint at `GET /api/repositories/:repositoryId/analysis/:analysisRunId`

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
- PR #58 — Render Redis connection-string hardening
- PR #60 — API HTTP security contract coverage
- PR #62 — report/current-analysis consistency fence
- PR #63 — contributor activity evidence
- PR #64 — contributor evidence in reports
- PR #65 — report snapshot revalidation
- PR #66 — final report snapshot boundary after historical runtime reconstruction
- PR #67 — analysis repository-storage recovery
- PR #68 — dependency-backed readiness endpoint
- PR #69 — bounded Redis readiness checks
- PR #70 — analysis job recovery state-machine regression coverage
- PR #71 — Git revision identity normalization
- PR #72 — asynchronous analysis status endpoint
- PR #73 — development-status continuation checkpoint
- PR #74 — analysis job retry policy
- PR #75 — persisted analysis-status invariants
- PR #76 — production secret boundary / service-role split
- PR #77 — duplicate analysis-status route cleanup and checkpoint sync
- PR #78 — finite resource-limit configuration hardening
- PR #79 — end-to-end import -> analysis -> report acceptance and persistence-boundary hardening
- PR #80 — end-to-end acceptance checkpoint documentation
- PR #81 — production CORS allowlist hardening
- PR #82 — request correlation IDs
- PR #83 — bounded Git discovery operations by analysis timeout
- PR #84 — post-hardening development checkpoint synchronization
- PR #85 — cooperative analysis worker deadline
- PR #86 — post-deadline hardening checkpoint synchronization
- PR #87 — final production execution-time bounds
- PR #88 — production hardening checkpoint documentation
- PR #89 — final release-readiness checkpoint documentation
- PR #90 — zero-cost single-service Render deployment
- PR #94 — direct evidence drill-downs in the frontend
- PR #98 — same-origin frontend delivery
- PR #99 — accurate configured-versus-verified connection state
- PR #100 — hardened free Render delivery path
- PR #101 — newest-first history and safe 404 responses
- PR #102 — runtime filter reset on repository change
- PR #103 — sanitized public analysis failure diagnostics
- PR #104 — stale saved workspace self-recovery
- PR #105 — preserve evidence when analysis discovery fails
- PR #106 — continuation checkpoint synchronization
- PR #107 — refresh frontend repository metadata after analysis
- PR #108 — clear stale derived results on refresh
- PR #109 — prevent stale evidence on partial reload
- PR #110 — hide derived results from stale analysis snapshots
- PR #111 — bound test and migration source reads
- PR #112 — bound telemetry/deployment JSON nesting depth
- PR #113 — NUL-safe Git path parsing for commit and numstat evidence
- PR #114 — bound package.json source reads
- PR #115 — guard stale frontend failure notifications and release runtime loading locks

Final integrated verification on main:
- GitHub Actions typecheck: passed
- build: passed
- PostgreSQL migrations: passed
- full test suite: passed
- migration idempotency: passed
- server startup/health smoke: passed
- worker startup/shutdown smoke: passed

Preserve all existing API routes, evidence models, migrations, deterministic analyzer behavior, retry semantics, security boundaries, and shutdown behavior when continuing. New roadmap work must start from this verified baseline rather than reworking completed layers.

## Continuation checkpoint — 2026-10-01 (latest)

main currently ends at commit `089f17d4ae22c978234defc6d41af17b268a8ad7`. Open pull requests: 0.

Verified hardening since the previous checkpoint:
- frontend repository metadata is refreshed after completed analysis before evidence data is rendered
- derived report/interview/AI state is cleared when a new refresh run is queued
- partial evidence reloads do not reuse data from an older analysis run
- report, interview, and AI interpretation views suppress derived results whose analysis/report snapshot is stale
- Git test/migration/package manifest reads check object size before loading source content
- runtime telemetry and deployment metadata reject excessively deep JSON
- Git commit/name-status and numstat ingestion use NUL-delimited paths so tabs/newlines in valid filenames remain intact
- late frontend errors are scoped to the active analysis run, and the runtime loading lock is released across repository/analysis changes

Automated verification constraint:
- recent GitHub Actions quality runs for PRs #110 through #115 consistently terminated in the `typecheck-build` job with `failure`, `steps: null`, and no project-step logs; this remains a runner/provisioning failure before repository commands execute
- the repository therefore must not represent those runs as application test/build failures

Known remaining release gaps, not silently reclassified as complete:
- GitHub-hosted CI runner/provisioning reliability still needs external resolution before a clean current-commit CI green can be claimed
- a browser-level production smoke still requires the hosted runtime/credential environment; no production credential is embedded in the repo
- full-history Git discovery still buffers large `git log` output in memory; the existing 25,000-commit guard bounds history depth, but streaming/parsing refactoring would further reduce peak memory
- runtime/deployment evidence retention remains an operational/product-policy decision; no arbitrary destructive retention rule has been introduced
- multi-stage evidence persistence uses idempotent/upsert-safe operations but is intentionally not presented as one database transaction; raw evidence endpoints may reflect persisted historical evidence while a newer analysis is still running, while report generation remains fenced to completed snapshots

Continuation rule:
- treat `089f17d4ae22c978234defc6d41af17b268a8ad7` as the current code baseline
- do not rework merged features
- next engineering work must target the remaining release/runtime gaps above, in priority order, with evidence-preserving semantics
- preserve the free single-service deployment contract, deterministic fingerprints, explicit evidence gaps, security boundaries, and bounded execution

## Release-gap hardening — 2026-10-01

Current implementation work on branch `hardening/finish-release-gaps-2026-10-01` closes the remaining code/runtime gaps identified after PR #115:

- Git history discovery now pages commit and numstat output in 500-commit chunks, so the previous full-history `git log` output is no longer held in one large process buffer. The existing 25,000-commit ceiling remains enforced.
- Runtime telemetry and deployment evidence now use a documented 365-day default retention policy, configurable only from 30 to 365 days.
- Retention cleanup runs in bounded 5,000-row batches, caps each sweep at 20,000 deletions, prevents overlapping sweeps, runs every six hours in the web runtime, and is canceled during shutdown.
- Retention indexes were added for the observed/occurred timestamps used by cleanup.
- GitHub quality no longer depends on workflow-level service-container provisioning. The quality runner uses the supported `ubuntu-latest` label, current checkout/setup-node actions, and starts PostgreSQL/Redis explicitly inside the job before executing the existing typecheck/build/test/E2E/startup gates.
- Release invariants and environment tests now cover the retention policy, bounded Git history paging, and the updated CI runner/service setup.

Production verification note:
- Public hosted liveness/auth-boundary verification can be performed without exposing credentials. Full authenticated workspace smoke still requires the production API access key to be supplied through the deployment/CI environment; no credential is stored in the repository.

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
\n## Free deployment architecture — 2026-09-30\n\nThe Render deployment was simplified to target zero monthly infrastructure cost:\n- one Render Free web service runs both the HTTP API and BullMQ analysis worker in the same Node.js process\n- PostgreSQL is supplied through DATABASE_URL rather than a paid Render database\n- Redis is supplied through REDIS_URL rather than a paid Render Key Value instance\n- database migrations run from the compiled migration entrypoint before the combined runtime starts\n- the Render health check uses dependency-independent /health, while /ready remains the dependency readiness probe\n\nThis keeps the existing queue and analysis contracts intact while removing the need for a paid Render worker, Render Postgres, or Render Key Value resource. Free-tier external services remain subject to their own storage, compute, sleep, retention, and usage limits; those operational constraints must be verified during the first hosted deployment.\n

## Product workspace — 2026-09-30

The first production product surface is now implemented in `public/index.html` as a dependency-free static workspace.

Current product flow:
`Import -> async analysis -> evidence workspace -> report -> grounded AI interpretation -> evidence inspection`

Current UI surfaces:
- Overview
- History with 50-commit pagination
- Structure with observed directory map and inspectable architecture/dependency records
- Quality evidence
- Runtime & provenance with historical runtime reconstruction and on-demand deployment provenance reconciliation
- Evidence report with claim-level inspection and JSON export
- Interview story scaffolds
- Grounded AI interpretation
- Evidence explorer with search/filter
- Contributor activity reconstructed from exact Git author tuples
- Connection settings with API health/protected-route probe

Frontend security boundary:
- API and AI access keys are entered by the user and retained in browser session storage only.
- No production credential is embedded in the static frontend.
- The frontend remains a client for the protected API; it does not create a second authentication system.

Hosted product verification:
- The Render static frontend service is live on the Free plan at the configured `onrender.com` URL.
- The API service is live after the latest product commits.
- GitHub Actions runs on the latest product commits are still failing before workflow steps execute (`typecheck-build` reports `steps: null`); a targeted rerun has been initiated. This remains an infrastructure/runner verification issue, not evidence of a failing test command.

Next product hardening focus:
- complete CI runner verification
- browser-level production smoke with a real user-supplied access key
- expose remaining high-value evidence drill-downs without weakening evidence/causality semantics
- final release checkpoint after CI and browser verification


## Runtime evidence explorer + analysis diagnostics — 2026-09-30

The static product workspace now exposes the persisted runtime telemetry directly instead of limiting the Runtime view to aggregate cards and historical reconstruction.

Current runtime drill-down:
- paginated observed telemetry events, 40 per page
- filters for deployment ID, revision SHA, environment, operation name, and signal type
- direct evidence inspection for individual telemetry records
- bounded pagination based on API-reported total pages
- filter reset without starting a new analysis

The Overview analysis snapshot now also displays persisted run status, target SHA, started/completed timestamps, elapsed duration, and the persisted failure message when available.

These additions remain evidence-first: runtime filters select observed records; they do not establish causality, regression, deployment order, ownership, or impact.


### CI runner verification — 2026-09-30

The quality workflow now pins the GitHub-hosted runner to `ubuntu-22.04` as a controlled fallback after repeated workflow runs failed before any step executed (`typecheck-build` reported `steps: null`). GitHub currently documents `ubuntu-22.04` as a supported standard Linux runner. This change is a runner-isolation measure; it does not alter application behavior.


## Evidence explorer coverage expansion — 2026-09-30

The Evidence Explorer now includes bounded samples from the remaining high-value persisted evidence families: timeline classification, hotspots, architecture, dependencies, complexity, coupling, bug-area signals, repeated modifications, refactor signals, database migrations, test evolution, runtime telemetry, deployment evidence, and contributors.

Each row remains directly inspectable through the existing evidence drawer. The explorer intentionally uses bounded samples; dedicated views retain their own pagination and filtering controls for larger datasets.


## Adversarial hardening pass — 2026-09-30

A dedicated edge-case layer was added around repository URL validation, runtime telemetry ingestion, HTTP query validation, import boundaries, and API/AI authentication.

Coverage now includes malformed/unsupported repository URLs, embedded credentials, query/hash injection, exact and over-limit telemetry fields, malformed trace/span IDs, HTTP status semantics, timestamp boundary behavior, duplicate event IDs, JSON serialization limits, deterministic payload hashes, 500-event batches, malformed repository IDs, pagination bounds, invalid runtime date windows/revision filters, bounded report/interpretation limits, authentication fallback/precedence, and production fail-closed behavior.

The frontend runtime explorer was also hardened against failed filter requests clearing the currently visible dataset, and connection probes now have a bounded timeout. Overview surfaces when persisted repository head differs from the analyzed target so stale analysis is explicit.


## Release hardening pass — 2026-09-30

The release path was tightened further without adding infrastructure: dependency installation is now performed once per Render/GitHub build (`npm ci` followed by `tsc`), frontend evidence loading is bounded to six concurrent API requests, and runtime filter/connection failures preserve existing UI state where possible.

The quality workflow now uses least-privilege read permissions, cancels superseded runs, and enforces a 45-minute job timeout. A dedicated release-invariant test suite validates the package/build contract, Render Blueprint expectations, CI gate markers, frontend dependency/security boundary, and primary workspace views.


## CI runner isolation result — 2026-09-30

Two controlled pull-request runner experiments were executed without product changes. The first used `ubuntu-22.04`; the second used `ubuntu-24.04`. Both workflow jobs completed with `failure` while reporting `steps: null`, and GitHub did not expose a job log blob. The failure therefore occurs before the repository workflow steps execute.

Both experiments were closed and neither was merged into `main`. The production branch remains on the pinned `ubuntu-22.04` workflow configuration; application validation remains independently corroborated by successful Render TypeScript builds.


## Launch hardening — repository boundaries + frontend concurrency — 2026-09-30

Repository ingestion now validates branch names at both the HTTP boundary and the Git service boundary. Ambiguous/unsafe ref forms such as option-looking names, traversal segments, repeated separators, invalid terminal dots/slashes, and Git-special ref syntax are rejected before clone work begins.

Repository storage inspection is symlink-safe: readiness checks do not follow a symlinked `.git` path, and repository size accounting ignores symbolic links and only counts regular files. This prevents a repository-local link from causing the size guard to traverse or account for filesystem content outside the managed checkout.

The static workspace now tags asynchronous repository/data requests with both a workspace token and analysis-run identity. Responses from a previous repository or superseded analysis run are discarded instead of overwriting current state. Runtime pagination loading also keeps its loading lock scoped to the request that owns it.

The corresponding edge/contract tests cover unsafe branch shapes, symlink-safe storage accounting/readiness, frontend stale-response guards, and the existing protected API import boundary.


## Launch hardening — HTTP boundary + client transport safety — 2026-09-30

The API access wall now runs before request-body parsing. Unauthenticated API traffic therefore does not enter JSON/urlencoded parsing, while authenticated malformed and oversized payloads receive explicit client error contracts instead of generic 500 responses.

The browser client now treats successful API responses as JSON objects, rejects malformed success payloads, and enforces HTTPS API base URLs except for localhost development targets. API base credentials, query parameters, and fragments are rejected. Browser session-storage access is failure-safe so a restricted storage environment does not crash the workspace.

The corresponding contract coverage protects auth-before-parser ordering, malformed/oversized body behavior, secure API URL handling, session-storage guards, and the existing stale async response protections.


## Launch hardening — evidence failure semantics + database transport — 2026-09-30

Unexpected Git failures in architecture discovery now fail the analysis instead of being silently represented as an empty architecture result. Dependency manifest lookup distinguishes an actually missing `package.json` from unrelated Git corruption or object/read failures, which are propagated for diagnosis.

Repository service boundaries validate UUID-shaped repository storage identifiers, validate branches before storage allocation, and clean up storage after clone/setup failures.

Database connection URLs now pin the currently secure PostgreSQL SSL interpretation when legacy `prefer`, `require`, or `verify-ca` modes are present, avoiding the repeated pg-connection-string compatibility warning while preserving other URL parameters.


## Launch hardening — analyzer failure transparency — 2026-09-30

Incremental complexity analysis now fails when the base revision tree cannot be read, rather than degrading to empty baseline state. Per-file complexity source read failures are retained as explicit `read_error` evidence events, and reports state that no complexity value is asserted for those files.

Migration and test-evolution Git object readers now distinguish expected missing-path cases from unrelated Git failures. Unrelated object/tree/repository failures propagate to the analysis instead of being silently converted into empty evidence.

Body-parser errors are classified only by explicit parser error type, preventing unrelated application errors that happen to carry HTTP status 400/413/415 from being mislabeled as request parsing failures.


## Launch hardening — final analyzer cleanup semantics — 2026-09-30

Clone cleanup now preserves the original repository/clone failure even when cleanup itself fails; cleanup errors are logged separately for operator diagnosis.

Git branch validation is aligned more closely with Git ref rules, including rejection of `@`, dot-prefixed components, and `.lock`-suffixed components.

Complexity, migration, and test-evolution analyzers now preserve or surface source-read failures rather than silently dropping evidence, while cache-only failures remain non-blocking because cache state is not evidence.


## Launch hardening — bounded history and reproducible runtime — 2026-09-30

Repository analysis now performs a lightweight Git commit-count preflight and refuses histories above the configured `MAX_ANALYZED_COMMITS` ceiling (25,000 by default). This prevents pathological histories from forcing unbounded full-history output into the free runtime memory budget and avoids silently returning partial historical analysis.

The production blueprint declares the same 25,000-commit ceiling. Package metadata now pins the supported Node major range to 24.x, and `package.json`/lockfile root versions are kept identical for deterministic `npm ci` installs.


## Launch hardening — AI provider transport — 2026-09-30

AI provider configuration now rejects endpoint credentials, query parameters, and fragments, and permits plain HTTP only for localhost development endpoints. Provider HTTP requests explicitly disable redirect following so an operator-configured endpoint cannot silently redirect the API-key-bearing request elsewhere.

Provider failures continue to expose bounded generic messages to the application layer rather than forwarding arbitrary third-party error bodies into API responses.


## Launch hardening — repository data lifecycle — 2026-09-30

Repositories now expose an explicit DELETE lifecycle. Deletion is blocked while an analysis is queued or running, preventing workers from writing into a disappearing repository. Once inactive, the exact recorded checkout path is removed first and must remain inside the managed repository-storage root; only then is the repository row deleted, allowing existing database foreign keys to cascade persisted evidence.

The browser workspace exposes this as a clearly separated data-lifecycle action in Settings with explicit confirmation. Successful deletion clears the browser's repository/run state while retaining the saved connection credentials.


## Launch hardening — migration/state consistency — 2026-09-30

Database migrations now use a PostgreSQL advisory lock so concurrent application instances cannot execute the same migration set simultaneously.

Analysis-run state transitions are explicit and forward-only at the application layer, with terminal states protected from resurrection. Migration 015 adds database constraints for valid statuses/modes and terminal timestamp consistency, while normalizing legacy timestamp anomalies before enforcing the constraints.

Repository deletion uses a database row lock plus a retryable storage-cleanup ledger, preventing delete/refresh races and allowing filesystem cleanup to recover after process interruption.


## Launch hardening — private response caching — 2026-09-30

All `/api` responses now carry `Cache-Control: no-store`. Autopsy API payloads can contain repository history, source structure, contributor metadata, runtime telemetry, deployment evidence, and generated reports, so browser/proxy caching is explicitly disabled at the API boundary.


## Launch hardening — final transport/state verification checkpoint — 2026-09-30

Connection diagnostics now keep privileged credentials off public `/health` and `/ready` requests while using a separate API-key-bearing probe for the protected API surface.

Error middleware no longer logs raw parser/application error objects. Request failures are reduced to bounded type/status or name/message fields, preventing malformed request bodies from being copied into application logs.

The cleanup retry loop now serializes ledger processing inside a database transaction with row locks, while retaining the retry-safe filesystem semantics. Analysis terminal timestamps are idempotent and prior failure diagnostics are preserved when a repeated transition has no replacement message.

CI remains externally blocked before workflow steps execute: the latest push-triggered quality runs terminate with the `typecheck-build` job at `failure` and `steps: null`. No project command failure has been observed from those runs, so CI is not being represented as a code regression.


## Continuation checkpoint — 2026-10-01

The previous continuation checkpoint ended at commit 6418e68dc7cf434bfcbe17fa66da6b13e1e8ca60 (PR #105); see the latest checkpoint above for the current main baseline.

Verified continuation hardening now present after PR #87:
- release-readiness documentation was updated through the production checkpoint
- the frontend is served by the same web service and uses a same-origin API base by default
- the frontend distinguishes configured credentials from verified API connectivity
- runtime filters are cleared when the active repository changes or is deleted
- history/report samples use newest-first commit ordering while the timeline remains chronological
- unknown-route 404 responses no longer reflect query strings
- public analysis failure diagnostics are bounded and sanitized at persistence and API boundaries
- stale saved repository/analysis workspace state self-heals after missing-resource 404s
- analysis discovery completes before persisted repository evidence is mutated, preventing later discovery-stage failures from overwriting the last persisted evidence snapshot

Current verification constraint:
- no CI status is attached to the current PR #105 merge commit through the GitHub status/workflow endpoints currently available to this session
- the existing repository documentation records a GitHub-hosted runner/provisioning failure as the blocker for automated workflow execution; this is an infrastructure verification limitation, not evidence of an application test failure

Continuation rule:
- treat commit 089f17d4ae22c978234defc6d41af17b268a8ad7 as the current code baseline
- do not restart or rework merged features
- next engineering work must target remaining release/runtime/user-facing gaps only
- any new change must preserve evidence-first semantics, deterministic report fingerprints, security boundaries, explicit evidence gaps, bounded execution, and the current free single-service deployment contract
