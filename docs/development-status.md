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
- Current `main` HEAD: `39e13f079292a31641b6fc5c38667cb70b6cafca` (PR #145 squash merge; includes PRs #142/#143 and operational observability).
- PR #118 introduced the release-gap production hardening baseline; PRs #119–#122 synchronized the release/CI state, including the manual quality workflow while hosted-runner provisioning is unavailable.
- PR #123 added bounded analysis-run history, PR #124 added API rate limiting, PR #125 completed environment-example parity and 429 UX, PR #126 exposed historical runtime source context, PR #128 hardened historical-filter lifecycle resets, PR #129 invalidated analysis-history load races, PR #130 normalized historical numeric filter inputs, and PR #131 restored the missing history/filter UI layers on the current main frontend.
- Open pull requests: 0.

Release-gap hardening merged in PR #118 includes bounded Git history/numstat paging, bounded evidence retention with indexed cleanup, explicit retention configuration, hardened GitHub Actions setup, a manual production-smoke workflow, and corresponding release invariants.

Current product hardening adds a bounded analysis-run history endpoint and an overview lifecycle ledger so users can inspect prior full/incremental/check runs without exposing storage paths or unsanitized internal failure details. File-churn discovery is also paged in 500-commit chunks with NUL-delimited numstat parsing to keep large-history reads bounded and preserve unusual valid filenames. Commit-level numstat statistics are now merged page-by-page, eliminating the previous history-wide duplicate stats map. Architecture discovery now uses non-recursive Git tree reads because it only needs top-level directory entries. Complexity cache blob lookups now resolve exact changed paths with Git object references instead of recursively scanning each commit tree. Repository storage readiness now validates actual Git work-tree/git-dir integrity so corrupt ephemeral storage is re-cloned instead of being treated as usable.

API abuse protection is also hardened with Redis-backed per-client-address rate limiting: 120 requests/minute for normal API traffic and 12 requests/minute for expensive analysis/report/AI/runtime/deployment operations. Report and AI interpretation GET requests use the heavy bucket. Limiter failures fail open to preserve service availability.

The historical runtime source-context projection is now exposed in the frontend runtime workspace, pairing each reconstructed commit with exact persisted changed-file evidence and explicit complete/truncated/unavailable coverage. Historical runtime reconstruction filters are now configurable in the UI and are applied consistently to summary, correlation, and source-context requests. Analysis-run lifecycle history can be paged without starting a new analysis; bounded API rate limiting, environment-example parity, and actionable rate-limit UX are also part of the current main product hardening.

Current environment verification status:
- GitHub Actions runs #1223–#1232 for the release-hardening line failed before any repository workflow step executed (`steps: []`). The quality workflow is therefore manual-only until hosted-runner provisioning is demonstrably usable again; the verification commands themselves remain intact and unchanged.
- The public GitHub status page currently reports Actions as operational, so the cause of those historical pre-step failures cannot be established from repository evidence alone.
- The production smoke workflow requires a real hosted URL and the production API access secret and is intentionally manual. No production credential is embedded in source.

Continuation rule:
- Treat this section as the single authoritative current checkpoint.
- Preserve evidence-first semantics, deterministic fingerprints, security boundaries, bounded execution, and the free single-service deployment contract.
- Do not treat external runner/hosting verification as complete until an actual current environment run succeeds.


## Recent merged hardening sequence — 2026-10-01

- PR #123 — bounded analysis-run history endpoint and overview lifecycle ledger; corrected frontend contract testing for the external app.js architecture.
- PR #124 — Redis-backed bounded API rate limiting with heavy-operation protection and fail-open behavior.
- PR #125 — environment example parity and actionable frontend 429 retry guidance.
- PR #126 — historical runtime source-context evidence exposed in the Runtime & provenance workspace.
- PR #128 — historical-filter lifecycle reset hardening.
- PR #129 — analysis-history load-token invalidation across repository context changes.
- PR #130 — historical runtime numeric-filter normalization.
- PR #131 — restored analysis-history pagination and configurable historical-runtime filter UI on current main.


## Final verified checkpoint — 2026-10-01

This is the current release-verification checkpoint for main.

- PR #142 merged the product UI/interaction hardening layer: evidence navigation, inspectable evidence drawers, workspace-safe loading, stale-request protection, progressive runtime/historical filters, single-flight actions, safer destructive confirmation, navigation-state preservation, keyboard/focus handling, and clearer current-snapshot gating.
- PR #143 synchronized the release invariants with the intentional PR #142 frontend contracts and added regression coverage for the historical filter busy-state cleanup.
- Current main HEAD is `fda08e55f3bb62795e72c085fc418adec2dda3e3`.
- GitHub Actions quality run #1322 completed successfully on the post-merge main commit. The gate passed dependency setup, TypeScript application/test typechecks, build, migrations, the full 486-test suite, real import -> analysis -> report E2E acceptance, migration idempotency, API startup, combined API/worker startup, and worker startup/shutdown smoke tests.
- The previous GitHub Actions runner/provisioning blocker is closed. The current quality workflow executes repository steps successfully using the hardened runner/setup path.
- Hosted Render verification was independently rechecked on 2026-10-01: `/` returned HTTP 200 and the production workspace HTML loaded; `/health` returned HTTP 200 with healthy status; `/ready` returned HTTP 200 with PostgreSQL and Redis both ready; unauthenticated `/api/` returned HTTP 401 with the expected `API_ACCESS_UNAUTHORIZED` contract.
- Render Blueprint parity is currently aligned: single Free web service, compiled migration before combined runtime, `/health` health check, `autoDeployTrigger: commit`, external database/Redis connection strings, bounded analysis limits, evidence retention, API/ingestion/AI credentials, and production CORS configuration.
- No product code change remains blocked by the earlier CI runner issue. Remaining work is operational/observability expansion rather than a missing core analysis workflow; external runtime/deployment evidence sources remain optional integrations and require their real production credentials when enabled.

Continuation rule: treat this section as the newest authoritative checkpoint. Preserve the evidence-first semantics, deterministic report fingerprints, security boundaries, bounded execution, explicit evidence gaps, and zero-cost Render deployment contract.


## Next working checkpoint — 2026-10-01

PR #145 is merged and the operational observability layer is verified.

- `GET /api/observability/summary` is an authenticated operational endpoint under the existing `/api` access boundary.
- The snapshot reports bounded PostgreSQL/Redis dependency readiness and latency, BullMQ analysis queue counts, process uptime, Node.js version, and bounded RSS/heap usage.
- Dependency and queue inspection failures produce a degraded snapshot with no internal error details exposed to clients.
- Operational dependency probes are lazy-loaded so merely importing the observability service does not initialize database, Redis, or BullMQ clients in test code that supplies injected dependencies.
- PR #145 quality run #1331 passed: application/test typecheck, build, full test suite (491 tests; 489 passed with 1 intentionally skipped), E2E import -> analysis -> report acceptance, migration idempotency, server startup, combined API/worker startup, and worker startup/shutdown smoke tests.
- Post-merge main quality run #1332 also completed successfully with the same full gate.
- Hosted Render was rechecked after deployment on 2026-10-01: the workspace root and `/health` returned HTTP 200; unauthenticated `/api/observability/summary` returned HTTP 401 with the expected `API_ACCESS_UNAUTHORIZED` contract.
- README now documents the observability endpoint and its bounded/security semantics.
- No open pull requests remain after this checkpoint unless new roadmap work is started.

Continuation rule: start subsequent work from main at `39e13f079292a31641b6fc5c38667cb70b6cafca`, preserve the evidence-first boundary, and keep new operational endpoints behind the established API authentication and bounded execution contracts.


## UI production audit checkpoint — 2026-10-01

This checkpoint records the latest product-UI hardening after the operational observability integration.

- Current main HEAD: `52a25d9befc48f61eb3010a13ae28657e3bc56cd`.
- PR #148 added live Operations monitoring and completed quality run #1347: application/test typecheck, build, migrations, 491-test suite, real import -> analysis -> report E2E acceptance, migration idempotency, API startup, combined API/worker startup, and worker startup/shutdown smoke.
- PR #149 fixed the remaining Operations lifecycle edge case: analysis refresh now resumes live Operations monitoring. Quality run #1349 passed the complete same repository gate.
- The UI audit added release contracts for static control wiring, delegated generated actions, all 11 workspace views, Operations monitoring lifecycle, scroll preservation, and malformed drawer CSS prevention.
- Live browser verification on Render confirmed Settings opens and closes without submitting credentials or starting analysis.
- Live mobile inspection at approximately 386px viewport width found no horizontal overflow for the landing header, repository form, or getting-started content.
- Render served the current Operations navigation and the `Operate` navigation group after deployment.
- No open repository issues or pull requests remain after PR #149.

Product boundary: the core workspace continues to preserve evidence-first semantics. Operational telemetry remains separate from persisted repository evidence. Authentication and protected API actions remain gated; production credentials are never embedded in source or documentation.

Continuation rule: begin subsequent work from main at `52a25d9befc48f61eb3010a13ae2866d9ad4b511cb`. Keep the existing evidence-first, bounded-execution, security, stale-state, focus-management, mobile-layout, and release-invariant contracts intact.

## Private repository access checkpoint — 2026-10-01

PR #151 is merged on main at `98d996d86f7c90ff3252f09cdac7624384dfee9b`.

- Private GitHub, GitLab, and Bitbucket HTTPS repositories now accept an optional read-only repository access token.
- Repository access credentials are encrypted at rest with AES-256-GCM and are never returned by repository APIs.
- Repository tokens are kept out of BullMQ job payloads and are supplied to Git through a scoped askpass environment only for the clone/fetch operation.
- Settings supports repository credential replacement and removal without revealing the current token.
- Repository access credential storage is deleted with the repository through the database foreign-key cascade.
- Missing private-repository encryption configuration returns an actionable `REPOSITORY_ACCESS_NOT_CONFIGURED` response instead of exposing internal errors.
- Quality run #1358 passed the complete release gate: application/test typecheck, build, migrations, 497 tests, real import -> analysis -> report E2E acceptance, migration idempotency, server startup, combined API/worker startup, and worker startup/shutdown smoke.
- Production Render was rechecked after merge: `/` returned HTTP 200 with the updated private-repository access UI; `/health` returned HTTP 200 with service status healthy.
- The private-repository encryption key is a production secret and must be configured before private-repository credentials can be stored. Public repositories remain usable without that optional secret.

Continuation rule: treat this section as the newest authoritative checkpoint. Preserve the evidence-first boundary, protected API access, bounded execution, secret non-disclosure, credential server-side storage, and existing 11-view product UI.
## UI product-surface checkpoint — 2026-10-02

The evidence-first workspace UI has now received a focused production-surface pass across the remaining high-value views.

- PR #153 added the landing-page workspace preview and a clearer evidence-to-analysis product story without introducing fake metrics or external UI dependencies.
- PR #154 turned Overview into a command center with the current analysis snapshot, journey state, run boundary, persisted metrics and stale-head visibility.
- PR #155 rebuilt History as an investigation surface with event signals, recent commit footprint, chronology and full ledger views.
- PR #156 surfaced the existing architecture map in Structure and added dependency/complexity/coupling summary panels using persisted analysis data.
- PR #157 organized Quality into a historical/test/schema evidence matrix while retaining the existing signal semantics.
- PR #158 added the bounded Evidence Explorer index, descriptive contributor activity pulse and Runtime evidence posture surface.
- PR #159 strengthened Report, Interview and Insights with explicit evidence/verification/grounding posture.
- PR #161 added a visible Runtime provenance chain and analysis-target/run boundary; correlation remains explicitly distinct from causality.
- PR #162 added a dashboard-style Operations posture with live snapshot freshness, monitoring state, dependency/queue visibility and an explicit operational-vs-repository boundary.
- Frontend regression invariants were added alongside these surfaces; source-level checks verified JavaScript brace balance, HTML div balance, CSS brace balance and the new view markers. No backend analysis semantics were changed by these UI passes.
- Render auto-deploy is active for both the static UI and API services. The Runtime commit is live on the API service; the latest Operations commit is being deployed to the static UI at checkpoint time.

Continuation rule: preserve evidence-first semantics, deterministic report fingerprints, protected API access, bounded execution, secret non-disclosure, stale-state handling, focus management and mobile-layout contracts while continuing remaining product polish.

## Authentication production-smoke checkpoint — 2026-10-02

PR #171 is merged on main at `fac98d487d79e6d2e2aee6b955128572b014d9aa`.

- Account sessions, password change, session listing/revocation, email verification, resend verification, forgot-password, and password reset are implemented behind the existing account/CSRF boundary.
- Verification and reset tokens are PostgreSQL-backed, hashed at rest, single-use, expiry-bound, and stale tokens are purged during startup and the recurring cleanup sweep.
- Transactional auth email is opt-in through Brevo using `BREVO_API_KEY`, `AUTOPSY_EMAIL_FROM`, and `AUTOPSY_PUBLIC_URL`; when configured, new accounts require email verification before sign-in.
- Legacy workspace migration remains intentionally available until all pre-account workspaces have been migrated; do not remove `AUTOPSY_API_ACCESS_KEY` or the migration route based only on time.
- Render production deploy for `fac98d4…` completed successfully. Migration `018_auth_email_recovery.sql` applied, PostgreSQL and Redis connected, and the API reached its listening port.
- Live `/health` verification returned HTTP 200 with `status: healthy`; the canonical production root also returned the expected Project Autopsy UI.
- The production smoke contract now covers authenticated `/api/auth/sessions` and rejects state-changing logout without the session-bound CSRF token.
- Hosted production-smoke execution still requires the configured bootstrap credentials; source code contains no production credential.

Post-checkpoint production cleanup merged through PRs #172, #173, and #174: authenticated production smoke now covers session listing and CSRF rejection; the frontend ships an explicit favicon asset; legacy `/favicon.ico` requests are served from that asset to eliminate browser-default 404s. The current main application baseline is `30ceb26d239c9b8ddaca802c34d4789f8abb9f85`.

## Production smoke hygiene checkpoint — 2026-10-02

The hosted production smoke flow now explicitly closes the session it creates. The authenticated checks are wrapped in a cleanup-safe `try/finally`, and a valid CSRF-protected logout is used to revoke the smoke session even when an earlier assertion fails. This prevents repeated manual production-smoke runs from accumulating active bootstrap-account sessions.

## Automated production-smoke checkpoint — 2026-10-02

The production smoke workflow is now both manually dispatchable and scheduled every six hours against the canonical hosted URL. Manual runs may override the URL, while scheduled runs use `https://project-autopsy.onrender.com`.

The smoke now checks the public HTML/app asset surface, both favicon routes, a valid `X-Request-Id` on health responses, dependency readiness, the unauthenticated API wall, authenticated session establishment, session listing, CSRF rejection, protected-route ownership boundary, and smoke-session cleanup.

The schedule intentionally runs the existing bounded smoke only; it does not import repositories or mutate repository evidence. Bootstrap credentials remain GitHub Actions secrets and are not stored in source.


## UI production audit checkpoint — 2026-10-02

PR #178 is merged on main at `bcac9aa14cf8b05aab31eefd8006b3b5538d8049`.

- Responsive workspace navigation now keeps section labels on their own full-width grid rows at tablet/mobile widths; view buttons remain the only interactive navigation controls in those rows.
- Frontend release invariants now lock unique static DOM IDs, exactly one navigation control and renderer for each of the 11 workspace views, complete delegated root-action coverage without duplicates, and the responsive navigation grouping contract.
- The release gate was exercised to completion on the PR after correcting only test-contract assumptions; the final PR quality run passed application/test typecheck, build, migrations, the full test suite, real import -> analysis -> report E2E acceptance, migration idempotency, API startup, combined API/worker startup, and worker startup/shutdown smoke checks.
- The post-merge main quality run `#1474` also completed all substantive repository checks successfully.
- Render API deploy `dep-davskm5ckfvc73c5jb80` and static UI deploy `dep-davskm5ckfvc73c5jbjg` are live on `bcac9aa...`.
- The production deploy completed migrations and connected PostgreSQL and Redis before serving the updated application. The deploy window had no application error or warning logs.
- Live production surface was re-scraped after deployment; the canonical page remains the evidence-first Project Autopsy product surface and its app asset is served from the hosted application.
- Open pull requests: 0.

Continuation rule: treat `bcac9aa...` as the newest verified main baseline. Preserve the existing 11-view information architecture, one-place navigation model, evidence-first semantics, stale-state handling, focus management, mobile layout contracts, protected API boundary, and bounded execution contracts. Do not re-introduce duplicate navigation surfaces or parallel renderer/action wiring.

## Hidden overlay production blocker checkpoint — 2026-10-02

PR #180 merged on main at `e0d8a1c078f34b06336d68290cfea09fb801fd20`.

- Root cause: author CSS declared `.drawer`, `.modal`, and `.toast` with explicit display values while relying on the HTML `hidden` attribute, so the CSS could override the browser's hidden display behavior.
- Fix: add an explicit `[hidden]` display override for transient overlays.
- Regression invariant now verifies the overlay hidden-display contract and initial hidden state for auth, settings, destructive-confirmation, evidence-inspector, and toast surfaces.
- Full PR quality gate passed, including import -> analysis -> report acceptance, migration idempotency, API startup, combined API/worker startup, and worker startup smoke tests.
- Both Render services are live on `e0d8a1c...`.
- Live browser verification on the canonical URL confirmed `#drawer` is hidden on initial load; simulating a click on `#drawerClose` returns it to `hidden=true`, computed `display:none`, with no uncaught exception.
- Open pull requests: 0.

Continuation rule: preserve explicit hidden-overlay behavior for every transient UI surface; never rely on `hidden` alone when author CSS supplies an explicit display rule.

## Current release checkpoint — 2026-10-03

Main is currently at `951c5ebc0558c6cb8a36217ea83df2834839c84e` after merging PR #192 (outputs and Evidence Explorer hardening).

- PR #192 added evidence-count/clear controls to Evidence Explorer, functional report-map navigation, evidence-specific interview draft copy, and actionable Insights failure states.
- The final PR quality run `b530835f4b0a33a056e70b8f3d9e3803bbe6fe03` passed the full repository gate. The post-merge main quality run `37097708805` also completed all substantive checks successfully.
- The repository currently has 0 open pull requests and 0 open issues.
- PR #184 was closed as superseded because its landing/auth navigation changes are already contained in the newer main baseline; it was not merged.
- The production-smoke workflow is scheduled every six hours and is manually dispatchable. It consumes the GitHub Actions repository secrets `AUTOPSY_BOOTSTRAP_EMAIL` and `AUTOPSY_BOOTSTRAP_PASSWORD`.
- GitHub Actions secrets are separate from Render runtime environment variables. The first production bootstrap account must exist in the production database, which is normally created by configuring the same bootstrap variables in the Render service for an initial deployment/startup. After the first successful login, those Render bootstrap variables can be removed as documented; the GitHub Actions smoke credentials can remain independently configured for recurring authentication checks against the existing account.
- Live canonical production HTML was successfully retrieved after the latest release and returned HTTP 200 with the current Project Autopsy surface.
- The raw source still explicitly marks transient overlays and the workspace as `hidden`; do not re-introduce CSS/HTML patterns that rely on JavaScript alone for initial overlay state.
- Firecrawl verification is currently credit-constrained; preserve credits for targeted production checks rather than broad recrawls.

Continuation rule: treat `951c5ebc0558c6cb8a36217ea83df2834839c84e` as the newest code baseline. Preserve the existing 11-view information architecture, evidence-first semantics, protected API boundary, bounded execution contracts, stale-state handling, focus management, mobile layout, deterministic report fingerprints, and secret non-disclosure.

- The 2026-10-03 configuration audit also moved the default interpretation provider from OpenAI to Google's Gemini `gemini-2.5-flash` across runtime configuration, Render configuration, examples, documentation, and interpretation tests.
