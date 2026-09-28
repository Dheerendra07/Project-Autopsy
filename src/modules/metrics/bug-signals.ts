export const BUG_SIGNAL_PATTERN =
  "(^|[[:space:]:#-])(fix|fixed|fixes|bug|bugfix|hotfix|regression|regressed|patch)($|[[:space:]:#-])";

export function isBugSignalSubject(subject: string): boolean {
  return new RegExp(BUG_SIGNAL_PATTERN, "i").test(subject);
}
