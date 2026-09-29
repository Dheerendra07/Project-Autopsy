# Project Autopsy

Project Autopsy reconstructs the engineering journey of a software project from its development evidence.

It analyzes Git history, code structure, dependencies, tests, database/schema changes, and optional runtime evidence to build an evidence-backed engineering history.

## Current phase

Phase 1 — architecture, repository ingestion foundation, database schema foundation, and background analysis worker.

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
│   └── interview/
│   ├── interpretation/  # grounded AI interpretation
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

API: http://localhost:5000

Health: http://localhost:5000/health

Repository import endpoint:

```http
POST /api/repositories/import
Content-Type: application/json

{
  "url": "https://github.com/owner/repository.git"
}
```

The import endpoint returns `202 Accepted`. Clone and initial analysis execute in the background worker, so large repositories do not keep the HTTP request open.

## Evidence policy

Project Autopsy separates observed evidence from interpretation.

- Git history can support change history and correlations.
- Runtime evidence is required before claiming observed performance regressions.
- Historical bug attribution is presented as evidence-backed correlation unless stronger evidence exists.
- AI is an interpretation layer, not the source of truth.

## Security

Never commit `.env`, API keys, OAuth tokens, database passwords, private repository credentials, or repository source snapshots.

Repository import is restricted to HTTPS and an allowlist of supported Git hosts in the current implementation.

## Stored commit evidence

GET /api/repositories/:repositoryId/commits?page=1&limit=50

The response is paginated and exposes persisted engineering evidence; repository storage paths are never returned by this endpoint.

## Deterministic hotspots

GET /api/repositories/:repositoryId/hotspots?limit=20

Hotspots are ordered by commit frequency, then total line churn, then path. Binary files contribute to `binary_changes`; line additions/deletions are not fabricated for them.

## Development timeline

GET /api/repositories/:repositoryId/timeline?page=1&limit=50

Timeline event types are derived from commit-subject keyword heuristics and are not proof of intent or causality.

## Evolution evidence

Dependency API: GET /api/repositories/:repositoryId/dependencies?limit=100

Architecture API: GET /api/repositories/:repositoryId/architecture?limit=100

Dependency history is derived from historical package.json snapshots. Architecture history currently tracks repository top-level directories and top-level directories under src. These are structural signals, not claims about runtime architecture.

## Refactor signals

Refactor candidates: GET /api/repositories/:repositoryId/refactors?limit=20

Results are evidence-backed heuristic signals from commit subjects and files_changed. They are not proof that a commit was a refactor.

## Change coupling

Change-coupling API: GET /api/repositories/:repositoryId/coupling?minCoChanges=2&limit=50

A co-change count means both file paths were changed in the same persisted Git commit. This is a historical co-change signal, not proof of architectural dependency.

## Code complexity evolution

Code-complexity API: GET /api/repositories/:repositoryId/complexity?limit=100

Complexity evidence is derived from TypeScript AST parsing for .ts, .tsx, .js, .jsx, .mjs, and .cjs files. The analyzer records source line count, function count, class count, cyclomatic complexity, and maximum control-flow nesting depth for changed files.

The API exposes before/after values and deterministic deltas. Deleted files are represented explicitly, while parse failures and oversized source files remain marked instead of receiving fabricated metrics.

The analyzer stores complexity as file-change events rather than pretending every commit has a complete repository-wide AST snapshot. This keeps the historical evidence traceable to actual changed source files.

## Deployment note

TypeScript is a runtime dependency because the background analysis worker performs AST parsing. Production installs must include regular dependencies when starting the worker; do not use a production install mode that omits runtime dependencies.


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


## Evidence-backed reports

Generate a bounded evidence-backed engineering report:

GET /api/repositories/:repositoryId/report?limit=10

A report is generated only from a completed analysis run. Each claim carries evidence references, and report fingerprints are deterministic for the same persisted evidence and report inputs.

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

Configuration is optional. Set `AI_API_KEY` to enable the endpoint, with `AI_BASE_URL`, `AI_MODEL`, and `AI_TIMEOUT_MS` available for provider configuration. The default provider configuration targets OpenAI's Responses API with `gpt-5.6-luna`.

In production, a separate `AI_INTERPRETATION_ACCESS_KEY` is required when `AI_API_KEY` is configured. It can be supplied through the `x-autopsy-ai-access-key` header or a Bearer authorization header.

## Repeatedly modified files

Repeated-change API: GET /api/repositories/:repositoryId/repeatedly-modified-files?minTouches=3&limit=20

The endpoint identifies file paths touched by at least the requested number of persisted commits and returns their historical churn, first/last change timestamps, and change span in days. Ordering is deterministic. This is an observed change-frequency signal, not a claim that the file is inherently problematic.
