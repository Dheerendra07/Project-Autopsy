# Project Autopsy architecture

## Current implementation boundary

Project Autopsy is an evidence-backed engineering-history analyzer. Its backend reconstructs repository evolution from persisted Git/code evidence and optionally reconciles it with observed runtime and deployment evidence.

## End-to-end evidence flow

Remote repository
      ↓
HTTPS + host validation
      ↓
Isolated Git storage
      ↓
Git metadata / changed-file discovery
      ↓
Deterministic analysis
      ↓
PostgreSQL evidence + Redis cache/queue
      ↓
Runtime telemetry
      ↓
Runtime ↔ Git correlation
      ↓
Historical runtime reconstruction

Deployment evidence
      ↓
Deployment ↔ runtime identity reconciliation
      ↓
Deployment provenance assessment
      ↓
Evidence-backed reports
      ↓
Interview story scaffolds
      ↓
Grounded AI interpretation

## Evidence rule

Git-derived facts are stored as evidence. Historical conclusions must be derived from evidence and explicitly marked as observed, correlated, or inferred.

Runtime performance claims require runtime evidence. Git history alone can support change history and potential correlations, not proof of observed performance regression or production causality.

Deployment evidence is treated as an observed external input. Autopsy does not derive deployments from Git timestamps, and it does not infer missing artifact, build, release, revision, environment, or deployment identity.

## Analysis consistency

Analysis runs record analyzer version, mode, base head, target head, and status. Incremental analysis is anchored to a previously completed target head; divergent history falls back to a full analysis.

Deterministic caches are keyed by repository identity, analyzer name/version, and Git blob SHA. Cache failure is fail-open and cannot change the evidence result.

## Runtime/deployment consistency

Runtime telemetry may carry an exact external deployment ID. Deployment/runtime reconciliation compares observed revision and environment identifiers without deriving deployment membership from time alone.

Deployment provenance assessment classifies an exact deployment ID as complete, partial, conflicting, or not found from the persisted evidence available for that ID. Conflicts are surfaced rather than resolved by guessing.

## Background processing

The API persists repository/analysis state and queues asynchronous work through BullMQ. The analysis worker performs cloning, refresh, commit discovery, deterministic evidence generation, and chained analysis.

Worker-local repository storage is treated as ephemeral. If a tracked repository clone is missing after worker restart/redeploy, the worker rehydrates it from the persisted repository source URL and tracked branch before refresh planning continues.

## Production deployment

Render deployment is represented by a repository-level Blueprint:
- public web API service
- background worker service
- Render Postgres
- Render Key Value for BullMQ/cache

Production database migrations run as a paid web-service pre-deploy command. Hosted API traffic binds explicitly to 0.0.0.0.

## Security boundary

Repository import accepts HTTPS only for supported Git hosts and avoids shell interpolation.

Production API routes require an application access key. Runtime telemetry and deployment evidence ingestion additionally use dedicated ingestion keys.

Repository storage is isolated by repository ID, storage paths are not exposed through public repository responses, credentials are rejected from deployment metadata, and secrets are supplied through environment configuration rather than committed source.
