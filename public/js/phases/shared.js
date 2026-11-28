// Re-exports used by phase modules, plus small helpers specific to phases.

export { notice, empty, stat, miniBar, table, bindTables, inspectButton, filterRows, toast, openEvidence, confirmDialog } from "../ui/components.js";
import { publicCheck } from "../core/api.js";

export async function publicCheckSafe(path) {
  return publicCheck(path);
}

// Human labels for report evidence sources.
export const SOURCE_LABEL = {
  repository: "repository",
  analysis_run: "analysis run",
  commit: "commit",
  commit_history: "commit history",
  contributor_activity: "contributor",
  file_change_metrics: "file metrics",
  bug_area_signal: "fix signal",
  repeated_file_history: "file history",
  refactor_signal: "refactor signal",
  dependency_change: "dependency",
  architecture_event: "structure",
  code_complexity: "complexity",
  database_migration: "migration",
  test_evolution: "test change",
  test_evolution_summary: "test summary",
  historical_runtime_commit: "runtime window",
  historical_runtime_source_file: "runtime source",
  runtime_telemetry_summary: "telemetry",
  runtime_telemetry_group: "telemetry group",
  coupling: "co-change",
  file_change_coupling: "co-change",
  deployment_evidence: "deployment"
};

export function refLabel(ref) {
  const src = SOURCE_LABEL[ref.source] || ref.source;
  const detail = ref.path || (ref.commitSha ? ref.commitSha.slice(0, 8) : ref.key);
  return { src, detail: String(detail || "").length > 60 ? String(detail).slice(0, 57) + "…" : String(detail || "") };
}
