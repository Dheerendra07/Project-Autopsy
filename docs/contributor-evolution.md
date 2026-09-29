# Contributor evolution

Project Autopsy can reconstruct descriptive contributor activity from persisted Git author metadata.

Endpoint:

GET /api/repositories/:repositoryId/contributors?limit=25

The endpoint reports exact persisted Git author name/email tuples with:

- commit count
- additions and deletions
- total recorded churn
- distinct changed paths
- first and last persisted commit timestamps

Contributor identities are not automatically merged across aliases. Activity is historical repository evidence; it does not establish personal ownership, effort, intent, seniority, or business impact.

The endpoint reuses the existing persisted commits and commit_files evidence and does not introduce a new analyzer, migration, or runtime inference layer.
