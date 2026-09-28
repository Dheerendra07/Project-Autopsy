export type TimelineEventType =
  | "fix"
  | "refactor"
  | "database"
  | "dependency"
  | "test"
  | "docs"
  | "feature"
  | "chore"
  | "other";

const rules: Array<{
  type: TimelineEventType;
  pattern: RegExp;
}> = [
  {
    type: "fix",
    pattern: /\b(fix|fixed|fixes|bug|bugfix|hotfix|regression|regressed|patch)\b/i
  },
  {
    type: "refactor",
    pattern: /\b(refactor|restructure|reorganize|rewrite|cleanup|clean-up)\b/i
  },
  {
    type: "database",
    pattern: /\b(database|db|schema|migration|migrate|sql|postgres|mysql)\b/i
  },
  {
    type: "dependency",
    pattern: /\b(dependency|dependencies|deps|package|npm|upgrade|downgrade)\b/i
  },
  {
    type: "test",
    pattern: /\b(test|tests|testing|spec|coverage)\b/i
  },
  {
    type: "docs",
    pattern: /\b(doc|docs|documentation|readme)\b/i
  },
  {
    type: "feature",
    pattern: /\b(add|added|feature|implement|implemented|create|created|introduce|support)\b/i
  },
  {
    type: "chore",
    pattern: /\b(chore|config|configure|ci|build|scaffold)\b/i
  }
];

export function classifyTimelineEvent(
  subject: string
): TimelineEventType {
  for (const rule of rules) {
    if (rule.pattern.test(subject)) {
      return rule.type;
    }
  }

  return "other";
}
