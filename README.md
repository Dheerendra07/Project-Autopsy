# Project Autopsy

Project Autopsy reconstructs the engineering journey of a software project from its development evidence.

It analyzes Git history, code structure, dependencies, tests, database/schema changes, and optional runtime evidence to build an evidence-backed engineering history.

## Current phase

Evidence-backed runtime and provenance analysis — repository history, code structure, dependencies, schema/test evolution, runtime telemetry, deployment evidence, deployment↔runtime reconciliation, reports, interview scaffolds, and grounded AI interpretation.

## Repository structure

```text
src/
├── config/                 # environment, PostgreSQL, Redis
├── middleware/             # HTTP error handling
├── modules/
│   ├── repositories/       # repository acquisition and metadata
│   ├── analysis/           # analysis run types and queue
│   ├── commits/
│   ├── files/
│   ├── metrics/
│   ├── architecture/
│   ├── dependencies/
│   ├── complexity/         # AST-derived complexity evolution
│   ├── reports/
├── interview/
├── deployments/         # observed deployment evidence
│   └── ...
├── runtime/             # runtime telemetry and correlation
│   └── ...
└── interpretation/      # grounded AI interpretation
├── workers/                # background analysis workers
├── routes/                 # API routing
├── app.ts
└── server.ts

database/
└── migrations/             # versioned SQL migrations

storage/
├── repositories/           # ignored repository working copies
├── tmp/                    # ignored temporary analysis data
└── artifacts/              # ignored generated artifacts

tests/
```

## Local development

```powershell
docker compose up -d
npm install
npm run db:migrate
npm run typecheck
npm run dev
```

Run the analysis worker separately:

```powershell
npm run dev:worker
```

API: http://localhost:5100

Health: http://localhost:5100/health
Readiness: http://localhost:5100/ready

`/ready` checks PostgreSQL and Redis and returns `503` when a required dependency is unavailable. `/health` remains a dependency-independent liveness endpoint.

Repository import endpoint:

```http
POST /api/repositories/import
Content-Type: application/json

{
  "url": "https://github.com/owner/repository.git"
}
```

The import endpoint returns `202 Accepted`. Clone and initial analysis execute in the background worker, so large repositories do not keep the HTTP request open.

Poll a specific asynchronous analysis run with `GET /api/repositories/:repositoryId/analysis/:analysisRunId`. The response exposes the persisted run status, mode, analyzer version, base head, target head, and lifecycle timestamps without exposing worker-local storage paths.

List the bounded analysis-run history with `GET /api/repositories/:repositoryId/analysis-runs?page=1&limit=20`. The response is ordered newest-first and exposes the persisted lifecycle state and sanitized failure diagnostics without exposing worker-local storage paths. The frontend overview can load older analysis runs without starting a new analysis.


## Operational observability

Authenticated operators can inspect a bounded service snapshot without exposing repository storage paths or internal error details:

GET /api/observability/summary

The response includes PostgreSQL and Redis dependency readiness/latency, BullMQ analysis queue counts, process uptime, Node.js version, and bounded RSS/heap usage. Dependency and queue inspection are time-bounded; the endpoint returns HTTP 503 with `status: "degraded"` when a required operational check is unavailable.

The endpoint is protected by the same production API access boundary as other `/api` routes and is subject to the normal API rate-limit bucket.

## Evidence policy

Project Autopsy separates observed evidence from interpretation.

- Git history can support change history and correlations.
- Runtime evidence is required before claiming observed performance regressions.
- Historical bug attribution is presented as evidence-backed correlation unless stronger evidence exists.
- AI is an interpretation layer, not the source of truth.

## Security

The API uses Redis-backed bounded rate limiting per client address. Normal API traffic is limited to 120 requests per minute; expensive import, re-analysis, report, interpretation, runtime-ingestion, and deployment-ingestion operations use a 12-request-per-minute bucket. Rate-limiter failures fail open so a Redis outage does not take down the application.


Never commit `.env`, API keys, OAuth tokens, database passwords, private repository credentials, or repository source snapshots.

Repository import is restricted to HTTPS and an allowlist of supported Git hosts in the current implementation.

Private repositories are supported for GitHub, GitLab, and Bitbucket HTTPS remotes. The optional repository access token is accepted during import or can be rotated later from the workspace Settings. The token is encrypted at rest with REPOSITORY_CREDENTIAL_ENCRYPTION_KEY, is never returned by the API, and is not included in BullMQ job payloads. Configure the encryption key before using private-repository credentials in production.

Use a repository token with read-only access to the source repository. The UI never persists the repository token in sessionStorage.

Production browser/API access uses account sessions backed by PostgreSQL and opaque HttpOnly cookies. Users authenticate with email and password; unsafe browser requests carry a server-issued CSRF token. Repository resources are scoped to the signed-in account. The /health and /ready endpoints remain public for hosting health checks. Runtime telemetry and deployment evidence ingestion remain machine-to-machine and additionally require their dedicated production ingestion keys.

During the first production deployment, set AUTOPSY_BOOTSTRAP_EMAIL and AUTOPSY_BOOTSTRAP_PASSWORD to create the initial operator account and claim legacy repositories that predate account ownership. Remove those bootstrap variables after the first successful login so future restarts do not retain bootstrap credentials in the service configuration.

Existing browsers that still have the pre-account workspace key can use the one-time workspace migration screen. That migration credential is accepted only by /api/auth/migrate-legacy, after which the browser removes it and normal requests use the account session. Keep AUTOPSY_API_ACCESS_KEY only until all legacy workspaces have been migrated, then remove it from Render and delete the migration path in the subsequent cleanup release.

## Stored commit evidence

GET /api/repositories/:repositoryId/commits?page=1&limit=50

The response is paginated and exposes persisted engineering evidence; repository storage paths are never returned by this endpoint.

## Deterministic hotspots

File-churn discovery and commit change statistics are processed in bounded 500-commit Git pages. Numstat statistics are merged into the page's commits immediately instead of retaining a history-wide duplicate stats map. NUL-delimited records preserve valid filenames containing tabs or newlines.

GET /api/repositories/:repositoryId/hotspots?limit=20

Hotspots are ordered by commit frequency, then total line churn, then path. Binary files contribute to `binary_changes`; line additions/deletions are not fabricated for them.

## Development timeline

GET /api/repositories/:repositoryId/timeline?page=1&limit=50

Timeline event types are derived from commit-subject keyword heuristics and are not proof of intent or causality.

## Evolution evidence

Dependency API: GET /api/repositories/:repositoryId/dependencies?limit=100

Architecture API: GET /api/repositories/:repositoryId/architecture?limit=100

Dependency history is derived from historical package.json snapshots. Architecture history currently tracks repository top-level directories and top-level directories under src. Discovery reads only the relevant top-level Git tree entries rather than recursively scanning every file in each commit. These are structural signals, not claims about runtime architecture.

## Refactor signals

Refactor candidates: GET /api/repositories/:repositoryId/refactors?limit=20

Results are evidence-backed heuristic signals from commit subjects and files_changed. They are not proof that a commit was a refactor.

## Change coupling

Change-coupling API: GET /api/repositories/:repositoryId/coupling?minCoChanges=2&limit=50

A co-change count means both file paths were changed in the same persisted Git commit. This is a historical co-change signal, not proof of architectural dependency.

## Code complexity evolution

Code-complexity API: GET /api/repositories/:repositoryId/complexity?limit=100

Complexity evidence is derived from TypeScript AST parsing for .ts, .tsx, .js, .jsx, .mjs, and .cjs files. The analyzer records source line count, function count, class count, cyclomatic complexity, and maximum control-flow nesting depth for changed files. Complexity cache blob identity is resolved for the exact changed path instead of scanning every blob in each commit.

The API exposes before/after values and deterministic deltas. Deleted files are represented explicitly, while parse failures and oversized source files remain marked instead of receiving fabricated metrics.

The analyzer stores complexity as file-change events rather than pretending every commit has a complete repository-wide AST snapshot. This keeps the historical evidence traceable to actual changed source files.

## Deployment note

TypeScript is a runtime dependency because the background analysis worker performs AST parsing. Production installs must include regular dependencies when starting the worker; do not use a production install mode that omits runtime dependencies.


## Deployment evidence

Optional deployment-system evidence can be ingested without deriving deployment events from Git timestamps:

```http
POST /api/repositories/:repositoryId/deployments
Content-Type: application/json
x-autopsy-deployment-key: <configured key>

{
  "events": [
    {
      "eventId": "deploy-123-succeeded",
      "occurredAt": "2026-09-29T08:15:00.000Z",
      "provider": "github-actions",
      "deploymentId": "deployment-123",
      "environment": "production",
      "state": "succeeded",
      "revisionSha": "<full commit sha>",
      "artifactDigest": "sha256:<64 hex characters>",
      "buildId": "run-123",
      "releaseId": "release-123",
      "metadata": {
        "workflow": "deploy.yml"
      }
    }
  ]
}
```

The ingestion contract is idempotent by repository plus event ID. A repeated identical event is accepted as a duplicate; the same event ID with a different payload is rejected. Deployment records are stored as observed external evidence and do not by themselves prove what currently serves traffic or establish runtime causality.

List recent deployment evidence:

```http
GET /api/repositories/:repositoryId/deployments?limit=50
```

GET /api/repositories/:repositoryId/runtime/deployment-correlation?deploymentId=<deployment-id>&recentEventLimit=25

GET /api/repositories/:repositoryId/deployments/provenance?deploymentId=<deployment-id>

The deployment provenance endpoint reconciles the observed evidence for one exact deployment ID. It reports whether the deployment evidence is complete, partial, or conflicting based on the presence and consistency of environment, revision SHA, artifact digest, build ID, and release ID, and it does not infer missing provenance from timestamps.

This endpoint reconciles exact deployment identity against runtime telemetry. It reports whether deployment evidence or runtime evidence is missing, whether observed revision/environment identities are consistent, partial, or conflicting, and preserves the distinction between observed evidence and causal inference.

`runtime telemetry` may optionally include the same external `deploymentId`. This creates an exact runtime-to-deployment identifier link when the deployment system and application instrumentation agree on the identifier. Existing telemetry without `deploymentId` remains valid and unchanged.

Telemetry APIs accept `deploymentId` as a filter, including runtime summaries and correlation endpoints. The field is observational identity only; Autopsy does not infer deployment membership from timestamps.

In production, `DEPLOYMENT_EVIDENCE_INGEST_KEY` must be configured. Credential-like fields inside deployment metadata are rejected.

## Re-analysis

Refresh the tracked branch and queue a new analysis:

```http
POST /api/repositories/:repositoryId/analyze
```

Repository import is asynchronous: the HTTP request validates the source and queues the import job, while the worker performs the clone and then chains the analysis job.

The service compares the current remote head with the latest completed analysis head.

- unchanged head -> `up_to_date`
- latest analyzed head is an ancestor of the new head -> `incremental`
- no prior analyzed head or divergent history -> `full`

Incremental runs persist the new commit range and seed dependency, architecture, and complexity history from the previous analyzed head. Some repository-wide aggregates, such as file churn and co-change coupling, are still recomputed for correctness in this v1 implementation.

Each analysis run records its mode, base head, target head, and analyzer version. An active queued/running analysis is restricted to one per repository by a PostgreSQL partial unique index.


## Contributor activity evidence

Contributor activity: GET /api/repositories/:repositoryId/contributors?limit=25

The endpoint reconstructs descriptive historical activity from persisted Git author metadata: exact author name/email tuples, commit count, additions, deletions, total churn, distinct changed paths, and first/last persisted commit timestamps. Author aliases are not automatically merged, and the data does not establish ownership, effort, intent, seniority, or business impact.

Contributor activity is also included in generated evidence-backed reports and therefore participates in the deterministic report fingerprint.

## Evidence-backed reports

Generate a bounded evidence-backed engineering report:

GET /api/repositories/:repositoryId/report?limit=10

A report is generated only from a completed analysis run. Each claim carries evidence references, and report fingerprints are deterministic for the same persisted evidence and report inputs.
Report generation revalidates the repository HEAD and exact completed analysis run after evidence collection; if the evidence snapshot changes during generation, the report is rejected rather than mixing analysis states.

The report includes historical runtime evidence when persisted runtime telemetry is available. Historical runtime events are aligned to persisted commit revisions and joined to bounded changed-file source context.

Runtime evidence remains observational. Changed files are evidence for the commit as a whole; runtime measurements are not attributed to individual files, and historical overlap does not establish deployment order, causality, or regression.

## Evidence-backed interview stories

Generate bounded interview story scaffolds from the evidence-backed report:

GET /api/repositories/:repositoryId/interview-stories?limit=6

Stories are evidence anchors for interview preparation rather than claims of personal ownership. Ownership, intent, business impact, and actual engineering outcomes must be verified before they are stated as facts.

The runtime-observability story can combine historical runtime/source-change evidence with current runtime observations when both sections contain evidence. When historical runtime evidence is unavailable, the story falls back to the runtime-observations section without fabricating historical context.



## AI evidence interpretation

Generate a grounded AI interpretation of the existing evidence-backed report:

GET /api/repositories/:repositoryId/interpretation?limit=10

The interpretation layer sends a bounded set of report claims to the configured AI provider and requires structured output. Model output may reference only evidence keys supplied by the server; unknown evidence references are rejected.

The interpretation can summarize recurring themes, identify evidence-backed investigation questions, and list uncertainties. It must not invent personal ownership, developer intent, business impact, deployment history, incidents, root causes, regressions, or production outcomes.

Configuration is optional. Set `AI_API_KEY` to enable the endpoint, with `AI_BASE_URL`, `AI_MODEL`, and `AI_TIMEOUT_MS` available for provider configuration. The default provider configuration targets OpenAI's Responses API with `gemini-2.5-flash`.

AI interpretation is available to signed-in users. The provider credential remains server-side in `AI_API_KEY` and is never sent to the browser. Account security includes active-session visibility, individual session revocation, and password rotation. Password changes invalidate all existing sessions and immediately issue a new session for the current device. Authentication and password-changing endpoints use a dedicated rate-limit bucket. The server keeps at most 10 active sessions per account and periodically removes expired or long-revoked session rows. Transactional email recovery is supported through Brevo when `BREVO_API_KEY`, `AUTOPSY_EMAIL_FROM`, and `AUTOPSY_PUBLIC_URL` are configured together. The Brevo sender address/domain must be verified before recovery mail is sent. New accounts then require email verification before sign-in; password reset links expire after 1 hour and are single-use. When the email provider is not configured, the existing account signup path remains usable without pretending that recovery email delivery is available. Repeated requests for the same report fingerprint and model are served from Redis for the configured cache TTL, reducing duplicate provider calls.

## Repeatedly modified files

Repeated-change API: GET /api/repositories/:repositoryId/repeatedly-modified-files?minTouches=3&limit=20

The endpoint identifies file paths touched by at least the requested number of persisted commits and returns their historical churn, first/last change timestamps, and change span in days. Ordering is deterministic. This is an observed change-frequency signal, not a claim that the file is inherently problematic.

## Render deployment

The repository includes a render.yaml Blueprint for a zero-cost deployment shape: one Render Free web service runs the HTTP API and BullMQ analysis worker together in the same Node.js process. PostgreSQL and Redis are supplied through DATABASE_URL and REDIS_URL, so no paid Render database, Key Value store, or worker is required. The compiled database migration entrypoint runs before the combined runtime starts, and /health is used for the hosting health check.

Secrets and external connection strings are declared with sync: false and must be supplied in the Render dashboard. Free-tier PostgreSQL/Redis providers retain their own storage, sleep, retention, and usage limits; those limits are environment-specific and must be verified during deployment.
Render Free web services spin down after 15 minutes without inbound traffic and lose local filesystem changes on restart/spindown. Because repository working copies are intentionally ephemeral, a queued analysis can be interrupted by service spindown; persisted analysis state and repository source metadata allow the worker to recover storage when the service is active again. The first hosted verification must therefore test import, analysis polling, retry/recovery, and redeploy/spindown behavior explicitly.

Render web services must listen on 0.0.0.0; Project Autopsy binds explicitly to all interfaces. Repository storage remains ephemeral and the worker can re-clone a tracked repository from its persisted source URL when local Git storage is missing after a restart or redeploy.

## Release readiness

The current main branch is the source-of-truth application checkpoint. The repository contains automated quality checks for typechecking, builds, migrations, tests, end-to-end acceptance, API startup, and worker startup.

GitHub-hosted Actions execution is an environment-level dependency for those checks; when hosted-runner execution is unavailable, that does not change the application contract or the persisted evidence model.

The Render Blueprint is designed as a zero-cost single web service: the same service serves the browser workspace from public/index.html, exposes the API, and runs the BullMQ analysis worker in the combined runtime. PostgreSQL and Redis are supplied through DATABASE_URL and REDIS_URL. The service uses /health for hosting health checks, while production API access and optional evidence ingestion/AI features remain protected by environment-configured credentials.

The remaining hosted setup work is environment-specific: supply the required production connection strings and secrets in the deployment platform, then perform the first real import -> analysis -> report smoke test against the live service.
