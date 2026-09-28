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
│   ├── timeline/
│   ├── reports/
│   └── interview/
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

Run the worker separately:

```powershell
npm run dev:worker
```

Repository import endpoint:

```http
POST /api/repositories/import
Content-Type: application/json

{
  "url": "https://github.com/owner/repository.git"
}
```

## Evidence policy

Project Autopsy separates observed evidence from interpretation.

- Git history can support change history and correlations.
- Runtime evidence is required before claiming observed performance regressions.
- Historical bug attribution is presented as evidence-backed correlation unless stronger evidence exists.
- AI is an interpretation layer, not the source of truth.

## Security

Never commit `.env`, API keys, OAuth tokens, database passwords, private repository credentials, or repository source snapshots.

Repository import is restricted to HTTPS and an allowlist of supported Git hosts in the current implementation.


Read stored commit evidence:

```http
GET /api/repositories/:repositoryId/commits?page=1&limit=50
```

The response is paginated and exposes only persisted engineering evidence; repository storage paths are never returned by this endpoint.

## Deterministic hotspots

```http
GET /api/repositories/:repositoryId/hotspots?limit=20
```

Hotspots are ordered by commit frequency, then total line churn, then path. Binary files contribute to `binary_changes`; line additions/deletions are not fabricated for them.

## Development timeline

```http
GET /api/repositories/:repositoryId/timeline?page=1&limit=50
```

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
