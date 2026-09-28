export type RefactorSignalType =
  | "refactor"
  | "rewrite"
  | "restructure"
  | "reorganize"
  | "cleanup"
  | "extract"
  | "split"
  | "merge"
  | "move"
  | "rename";

const REFACTOR_SIGNAL_RULES: Array<{
  type: RefactorSignalType;
  pattern: RegExp;
}> = [
  { type: "refactor", pattern: /\brefactor\b/i },
  { type: "rewrite", pattern: /\brewrite\b/i },
  { type: "restructure", pattern: /\brestructure\b/i },
  { type: "reorganize", pattern: /\breorganize|reorganise\b/i },
  { type: "cleanup", pattern: /\bclean[- ]?up\b/i },
  { type: "extract", pattern: /\bextract\b/i },
  { type: "split", pattern: /\bsplit\b/i },
  { type: "merge", pattern: /\bmerge\b/i },
  { type: "move", pattern: /\bmove\b/i },
  { type: "rename", pattern: /\brename\b/i }
];

export function classifyRefactorSignal(subject: string): RefactorSignalType | null {
  for (const rule of REFACTOR_SIGNAL_RULES) {
    if (rule.pattern.test(subject)) {
      return rule.type;
    }
  }

  return null;
}
