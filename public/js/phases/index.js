// Maps each of the eleven phase ids to its renderer.

import { overview, history, structure, quality, runtime, evidence, contributors, operations } from "./evidence-phases.js";
import { report } from "./report.js";
import { interview } from "./interview.js";
import { insights } from "./insights.js";

export const PHASE_RENDERERS = {
  overview,
  history,
  structure,
  quality,
  runtime,
  report,
  interview,
  insights,
  evidence,
  contributors,
  operations
};
