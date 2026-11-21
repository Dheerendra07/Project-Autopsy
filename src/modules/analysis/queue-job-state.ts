export function isFailedQueueJobState(state: string): boolean {
  return state === "failed";
}
