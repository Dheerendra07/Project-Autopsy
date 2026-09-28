import assert from "node:assert/strict";
import test from "node:test";
import { classifyTimelineEvent } from "../src/modules/timeline/timeline.classifier.js";

test("classifies fixes before generic feature keywords", () => {
  assert.equal(
    classifyTimelineEvent("fix: add retry handling"),
    "fix"
  );
});

test("classifies refactor commits", () => {
  assert.equal(
    classifyTimelineEvent("refactor: restructure repository service"),
    "refactor"
  );
});

test("classifies database migrations", () => {
  assert.equal(
    classifyTimelineEvent("migration: add analysis tables"),
    "database"
  );
});

test("classifies dependency upgrades", () => {
  assert.equal(
    classifyTimelineEvent("chore: upgrade npm dependencies"),
    "dependency"
  );
});

test("falls back to other for neutral subjects", () => {
  assert.equal(
    classifyTimelineEvent("update project notes"),
    "other"
  );
});
