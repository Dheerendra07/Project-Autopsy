# Project Autopsy

Project Autopsy reconstructs the engineering journey of a software project from its development evidence.

It analyzes Git history, code structure, dependencies, tests, database/schema changes, and optional runtime evidence to build an evidence-backed engineering history.

## Current phase

Phase 1 — architecture and implementation foundation.

## Local development

```powershell
docker compose up -d
npm install
npm run typecheck
npm run dev
```

API: http://localhost:5000

Health: http://localhost:5000/health

> Never commit `.env`, API keys, OAuth tokens, database passwords, or private repository credentials.
