# Project Autopsy architecture

## Current implementation boundary

Phase 1 establishes the backend foundation and the first repository-ingestion boundary.

### Repository ingestion

```text
Remote repository URL
        ↓
HTTPS + host validation
        ↓
isolated repository storage
        ↓
Git metadata discovery
        ↓
repository metadata
        ↓
analysis queue
        ↓
background worker
```

### Evidence rule

Git-derived facts are stored as evidence. Historical conclusions must be derived from evidence and explicitly marked as observed, correlated, or inferred.

Runtime performance claims require runtime evidence; Git history alone only supports potential regressions or correlations.

### Incremental analysis rule

Future analyzers will be keyed by commit SHA and analyzer version. File-level parsing will use blob SHA and analyzer version so unchanged content can be reused safely.

### Security boundary

Repository import must:
- accept HTTPS only for supported Git hosts;
- avoid shell interpolation;
- isolate repository storage by repository ID;
- enforce repository and analysis limits;
- never expose storage paths to clients;
- avoid committing private source or credentials.
