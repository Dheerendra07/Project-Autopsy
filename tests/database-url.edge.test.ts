import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDatabaseConnectionString
} from "../src/config/database-url.js";

test("normalizes PostgreSQL SSL modes to the current secure behavior", () => {
  for (const mode of ["prefer", "require", "verify-ca"]) {
    const normalized = new URL(
      normalizeDatabaseConnectionString(
        "postgresql://user:password@example.com/app?sslmode=" + mode + "&application_name=autopsy"
      )
    );

    assert.equal(normalized.searchParams.get("sslmode"), "verify-full");
    assert.equal(
      normalized.searchParams.get("application_name"),
      "autopsy"
    );
  }
});

test("preserves explicit verify-full and URLs without an SSL mode", () => {
  const explicit = new URL(
    normalizeDatabaseConnectionString(
      "postgresql://user:password@example.com/app?sslmode=verify-full"
    )
  );
  assert.equal(explicit.searchParams.get("sslmode"), "verify-full");

  const withoutMode = new URL(
    normalizeDatabaseConnectionString(
      "postgresql://user:password@example.com/app"
    )
  );
  assert.equal(withoutMode.searchParams.has("sslmode"), false);
});

test("rejects malformed PostgreSQL connection URLs", () => {
  assert.throws(
    () => normalizeDatabaseConnectionString("not-a-database-url"),
    /Invalid URL/
  );
});
