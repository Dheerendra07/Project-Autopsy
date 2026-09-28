import assert from "node:assert/strict";
import test from "node:test";
import { diffDependencyMaps } from "../src/modules/dependencies/dependency.discovery.js";
import { diffDirectorySets } from "../src/modules/architecture/architecture.discovery.js";

test("detects dependency additions, removals, and spec changes deterministically", () => {
  const changes = diffDependencyMaps(
    { express: "^5.1.0", lodash: "^4.17.21" },
    { express: "^5.2.1", zod: "^4.6.5" }
  );

  assert.deepEqual(changes, [
    { packageName: "express", changeType: "changed", previousSpec: "^5.1.0", currentSpec: "^5.2.1" },
    { packageName: "lodash", changeType: "removed", previousSpec: "^4.17.21", currentSpec: null },
    { packageName: "zod", changeType: "added", previousSpec: null, currentSpec: "^4.6.5" }
  ]);
});

test("detects architecture directory additions and removals", () => {
  const events = diffDirectorySets(
    new Set(["modules", "routes"]),
    new Set(["modules", "workers"])
  );

  assert.deepEqual(events, [
    { eventType: "added", path: "workers" },
    { eventType: "removed", path: "routes" }
  ]);
});
