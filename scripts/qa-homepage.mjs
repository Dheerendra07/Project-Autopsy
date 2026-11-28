// Fast, dependency-free frontend gate (runs before `npm ci` in CI).
// Verifies the browser workspace in public/ is CSP-safe, parseable, complete across the
// eleven phases, wired to the real API, and free of sample or invented repository data.

import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (rel) => readFile(path.join(root, rel), "utf8");

async function list(dir) {
  const out = [];
  for (const name of await readdir(path.join(root, dir))) {
    const rel = path.posix.join(dir, name);
    if ((await stat(path.join(root, rel))).isDirectory()) out.push(...(await list(rel)));
    else out.push(rel);
  }
  return out;
}

const html = await read("public/index.html");
const css = await read("public/css/app.css");
const jsFiles = (await list("public/js")).filter((f) => f.endsWith(".js"));
const js = Object.fromEntries(await Promise.all(jsFiles.map(async (f) => [f, await read(f)])));
const allJs = Object.values(js).join("\n");

// 1. CSP: one same-origin module script, no inline script or inline handlers.
assert.deepEqual(html.match(/<script\b[^>]*>/gi), ['<script type="module" src="js/main.js">'], "index.html must load only js/main.js as a module");
assert.doesNotMatch(html, /\son[a-z]+=["']/i, "inline event handlers are blocked by CSP");
assert.match(html, /viewport-fit=cover/, "iPhone safe-area layout requires viewport-fit=cover");

// 2. Every module parses.
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  assert.equal(result.status, 0, file + " does not parse:\n" + result.stderr);
}

// 3. The eleven phases, in order, each with a renderer and an animated guide.
const meta = js["public/js/phases/meta.js"];
const titles = [...meta.matchAll(/id: "([a-z]+)", n: "(\d\d)", title: "([A-Za-z]+)"/g)];
assert.deepEqual(titles.map((m) => m[2]), ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"], "the workspace must define phases 01–11");
for (const [, id, , title] of titles) {
  assert.ok(js["public/js/phases/index.js"].includes(id), "no renderer registered for " + title);
  assert.ok(js["public/js/ui/scenes.js"].includes('"g-' + id + '"'), "no animated guide for " + title);
}

// 4. Real API wiring (no mock data source).
for (const endpoint of [
  "/api/auth/login", "/api/auth/register", "/api/auth/verify-email", "/api/auth/forgot-password", "/api/auth/reset-password",
  "/api/auth/sessions", "/api/auth/password", "/api/auth/logout", "/api/auth/me", "/api/repositories/import",
  "/report", "/interview-stories", "/interpretation", "/analysis-runs", "/api/observability/summary"
]) {
  assert.ok(allJs.includes(endpoint), "frontend is not wired to " + endpoint);
}
assert.ok(js["public/js/core/api.js"].includes('credentials: "include"'), "API calls must send the session cookie");

// 5. No sample or invented repository data.
for (const banned of [/lorem ipsum/i, /john doe/i, /\bacme\b/i, /Priya Anand/, /rpt_[0-9a-f]{8}/, /PREVIEW DATA/, /CONCEPT PREVIEW/, /\bmock(ed)? (repo|data)\b/i]) {
  assert.doesNotMatch(html + css + allJs, banned, "synthetic content must not ship: " + banned);
}

// 6. Design system essentials.
assert.match(css, /color-scheme: light;/, "light design system expected");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "reduced-motion handling is required");
assert.ok(css.includes("safe-area-inset-bottom"), "iPhone safe-area insets are required");

console.log("Frontend QA passed: CSP-safe module entry, " + jsFiles.length + " parseable modules, 11 phases with renderers and animated guides, real API wiring, no synthetic data.");
