# Database migrations

Migrations are intentionally plain SQL for the first implementation phase.

Rules:
- Never edit an already-applied migration.
- Add a new numbered migration for schema changes.
- Keep database schema changes deterministic and reviewable.
- The application database is the source of truth for persisted analysis state.
