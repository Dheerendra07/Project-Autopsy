import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYSIS_DEADLINE_EXCEEDED_MESSAGE,
  createAnalysisDeadline,
  getAnalysisDeadline,
  runWithAnalysisDeadline
} from "../src/modules/analysis/analysis-deadline.js";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

test("propagates the active deadline through async work", async () => {
  let seenDeadline: Awaited<ReturnType<typeof createAnalysisDeadline>> | null =
    null;

  await runWithAnalysisDeadline(async (deadline) => {
    seenDeadline = deadline;
    assert.equal(getAnalysisDeadline(), deadline);
    assert.equal(deadline.signal.aborted, false);
    assert.ok(deadline.remainingMs() > 0);
  }, 1_000);

  assert.ok(seenDeadline);
  assert.equal(getAnalysisDeadline(), null);
});

test("aborts and reports an expired deadline", async () => {
  const deadline = createAnalysisDeadline(25);

  try {
    await wait(60);

    assert.equal(deadline.expired, true);
    assert.equal(deadline.signal.aborted, true);
    assert.equal(deadline.remainingMs(), 0);
    assert.throws(
      () => deadline.assertNotExpired(),
      new RegExp(ANALYSIS_DEADLINE_EXCEEDED_MESSAGE)
    );
  } finally {
    deadline.dispose();
  }
});

test("rejects an invalid deadline budget", () => {
  assert.throws(
    () => createAnalysisDeadline(0),
    /finite positive/
  );
  assert.throws(
    () => createAnalysisDeadline(Number.NaN),
    /finite positive/
  );
});
