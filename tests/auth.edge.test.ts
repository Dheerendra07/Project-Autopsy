import assert from "node:assert/strict";
import test from "node:test";

import { isApiAccessAuthorized } from "../src/middleware/apiAccess.middleware.js";
import { isAiInterpretationAuthorized } from "../src/modules/interpretation/interpretation.auth.js";

const KEY = "edge-secret-key-abcdefghijklmnopqrstuvwxyz";

for (const [name, authorize] of [
  ["API access", isApiAccessAuthorized],
  ["AI interpretation", isAiInterpretationAuthorized]
] as const) {
  test(`${name} accepts an exact header key`, () => {
    assert.equal(authorize(undefined, KEY, KEY, "production"), true);
  });

  test(`${name} trims header whitespace`, () => {
    assert.equal(authorize(undefined, "  " + KEY + "  ", KEY, "production"), true);
  });

  test(`${name} accepts a case-insensitive Bearer scheme`, () => {
    assert.equal(authorize("bEaReR   " + KEY, undefined, KEY, "production"), true);
  });

  test(`${name} trims bearer token whitespace`, () => {
    assert.equal(authorize("Bearer   " + KEY + "  ", undefined, KEY, "production"), true);
  });

  test(`${name} rejects the wrong key`, () => {
    assert.equal(authorize(undefined, "wrong-key", KEY, "production"), false);
  });

  test(`${name} rejects an empty key`, () => {
    assert.equal(authorize(undefined, "", KEY, "production"), false);
  });

  test(`${name} rejects malformed authorization schemes`, () => {
    for (const header of [
      KEY,
      "Basic " + KEY,
      "Token " + KEY,
      "Bearer",
      "Bearer ",
      "Bearer\t"
    ]) {
      assert.equal(authorize(header, undefined, KEY, "production"), false, header);
    }
  });

  test(`${name} gives header key precedence over bearer fallback only when header key is usable`, () => {
    assert.equal(
      authorize("Bearer " + KEY, "wrong-key", KEY, "production"),
      false
    );
    assert.equal(
      authorize("Bearer " + KEY, "   ", KEY, "production"),
      true
    );
  });

  test(`${name} fails closed in production when no credential is configured`, () => {
    assert.equal(
      authorize(undefined, undefined, undefined, "production"),
      false
    );
  });

  test(`${name} remains usable without configured credentials outside production`, () => {
    assert.equal(
      authorize(undefined, undefined, undefined, "test"),
      true
    );
  });

  test(`${name} does not use the environment fallback when an explicit configured key is supplied`, () => {
    const original = process.env.AUTOPSY_API_ACCESS_KEY;
    process.env.AUTOPSY_API_ACCESS_KEY = "environment-key";

    try {
      const apiResult = authorize(undefined, KEY, KEY, "production");
      assert.equal(apiResult, true);
    } finally {
      if (original === undefined) {
        delete process.env.AUTOPSY_API_ACCESS_KEY;
      } else {
        process.env.AUTOPSY_API_ACCESS_KEY = original;
      }
    }
  });
}

test("API access and AI interpretation keys are independently evaluated", () => {
  assert.equal(
    isApiAccessAuthorized(undefined, KEY, KEY, "production"),
    true
  );
  assert.equal(
    isAiInterpretationAuthorized(undefined, KEY, "different-" + KEY, "production"),
    false
  );
});
