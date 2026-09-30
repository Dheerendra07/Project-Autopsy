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

## Superseded continuation checkpoint

The earlier checkpoint at `089f17d4ae22c978234defc6d41af17b268a8ad7` is historical and must not be treated as the current code baseline.

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
- Render production Blueprint for the free combined web/worker runtime with external DATABASE_URL and REDIS_URL connections
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

## Final release checkpoint — 2026-10-01

Authoritative current state:
- Current `main` is the source-of-truth branch; this release-cleanup change is part of the final main checkpoint after merge.
- Current production code baseline: `15eb4ed45cd201ac74b77c93921c76a2fb7cfc46` (PR #118).
- PRs #119 and #120 are documentation-only synchronization commits.
- Open pull requests: 0.

Release-gap hardening merged in PR #118 includes bounded Git history/numstat paging, bounded evidence retention with indexed cleanup, explicit retention configuration, hardened GitHub Actions setup, a manual production-smoke workflow, and corresponding release invariants.

Current product hardening adds a bounded analysis-run history endpoint and an overview lifecycle ledger so users can inspect prior full/incremental/check runs without exposing storage paths or unsanitized internal failure details.

API abuse protection is also hardened with Redis-backed per-client-address rate limiting: 120 requests/minute for normal API traffic and 12 requests/minute for expensive analysis/report/AI/runtime/deployment operations. Report and AI interpretation GET requests use the heavy bucket. Limiter failures fail open to preserve service availability.

Current environment verification status:
- GitHub Actions runs #1223–#1232 for the release-hardening line failed before any repository workflow step executed (`steps: []`). The quality workflow is therefore manual-only until hosted-runner provisioning is demonstrably usable again; the verification commands themselves remain intact and unchanged.
- The public GitHub status page currently reports Actions as operational, so the cause of those historical pre-step failures cannot be established from repository evidence alone.
- The production smoke workflow requires a real hosted URL and the production API access secret and is intentionally manual. No production credential is embedded in source.

Continuation rule:
- Treat this section as the single authoritative current checkpoint.
- Preserve evidence-first semantics, deterministic fingerprints, security boundaries, bounded execution, and the free single-service deployment contract.
- Do not treat external runner/hosting verification as complete until an actual current environment run succeeds.
