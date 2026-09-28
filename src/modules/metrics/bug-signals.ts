export const BUG_SIGNAL_PATTERN =
  "(^|[[:space:]:#-])(fix|fixed|fixes|bug|bugfix|hotfix|regression|regressed|patch)($|[[:space:]:#-])";

const BUG_SIGNAL_REGEX =
  /\b(fix|fixed|fixes|bug|bugfix|hotfix|regression|regressed|patch)\b/i;

export function isBugSignalSubject(subject: string): boolean {
  return BUG_SIGNAL_REGEX.test(subject);
}
