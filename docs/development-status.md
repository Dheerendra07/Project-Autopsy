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

## Current work

Refactor signals are implemented on branch `feat/refactor-signals-checkpoint-v1` using commit-subject heuristics and `files_changed` as evidence. The feature must remain a signal, not proof that a particular commit was a refactor.

## Next planned layers

1. Refactor signal API and verification.
2. Commit-level additions/deletions and richer change statistics.
3. Repeatedly modified files and change coupling.
4. Code complexity evolution using AST analysis.
5. Incremental analysis keyed by commit SHA and analyzer version.
6. Runtime telemetry ingestion for observed performance history.
7. Evidence-backed reports and interview stories.

## Verification rule

Every feature branch must pass GitHub Actions `typecheck`, `build`, and `test` before squash-merging to `main`. Do not merge based on code inspection alone.

## Local environment note

Windows local Docker is not currently available on the development machine (`docker` command not found). GitHub Actions provides the current automated compile/build/test verification; PostgreSQL/Redis local end-to-end verification remains pending Docker setup.

## Continuation checkpoint

At the last locked checkpoint, `main` ended at commit `37b929fea8930b35461f643083f0e1937fa5c3f2` before the current refactor-signal branch work. Preserve all existing API routes and evidence models when continuing.
