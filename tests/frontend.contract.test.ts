// Contract tests for the browser workspace in public/. They check behaviour and the
// contracts the UI shares with the API (routes, auth cookies/headers, email links,
// worker progress stages, report schema) rather than pinning exact markup.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

function listFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.posix.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? listFiles(rel) : [rel];
  });
}

const jsFiles = listFiles("public/js").filter((f) => f.endsWith(".js"));
const allFrontend = ["public/index.html", "public/css/app.css", ...jsFiles].map((f) => [f, read(f)] as const);
const importModule = async (rel: string): Promise<any> => import(pathToFileURL(path.join(root, rel)).href);

test("index.html loads one same-origin module and no inline script (CSP script-src 'self')", () => {
  const html = read("public/index.html");
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  assert.deepEqual(scripts, ['<script type="module" src="js/main.js">']);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<\s]+<\/script>/i);
  assert.doesNotMatch(html, /\son[a-z]+=["']/i, "inline event handlers are blocked by script-src-attr 'none'");
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /<link rel="stylesheet" href="css\/app\.css">/);
  for (const href of html.match(/href="https?:[^"]+"/g) ?? []) {
    assert.match(href, /fonts\.(googleapis|gstatic)\.com/, "only font assets may be cross-origin: " + href);
  }
});

test("every frontend module parses and its imports link", async () => {
  for (const file of jsFiles) {
    const check = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(check.status, 0, file + " failed to parse:\n" + check.stderr);
  }
  // main.js touches the DOM at load; every other module must import cleanly in Node.
  for (const file of jsFiles.filter((f) => !f.endsWith("/main.js"))) {
    await assert.doesNotReject(importModule(file), file + " failed to link");
  }
  const main = read("public/js/main.js");
  for (const [, names, spec] of main.matchAll(/import \{([^}]+)\} from "([^"]+)"/g)) {
    const mod = await importModule(path.posix.join("public/js", spec));
    for (const name of names.split(",").map((n) => n.trim()).filter(Boolean)) {
      assert.ok(name in mod, "main.js imports missing export " + name + " from " + spec);
    }
  }
});

test("frontend uses no syntax that older iOS Safari cannot parse", () => {
  for (const [file, text] of allFrontend.filter(([f]) => f.endsWith(".js"))) {
    assert.doesNotMatch(text, /\(\?<[!=]/, file + " uses regex lookbehind");
  }
});

test("API client matches the server session cookie and CSRF contract", () => {
  const api = read("public/js/core/api.js");
  const session = read("src/middleware/session.middleware.ts");
  const csrfCookie = session.match(/CSRF_COOKIE_NAME = "([^"]+)"/)?.[1];
  assert.ok(csrfCookie);
  assert.ok(api.includes(`const CSRF_COOKIE = "${csrfCookie}"`));
  const header = session.match(/request\.header\("(x-autopsy-csrf-token)"\)/i)?.[1] ?? "x-autopsy-csrf-token";
  assert.ok(api.includes(`const CSRF_HEADER = "${header}"`));
  assert.ok(api.includes('credentials: "include"'));
  assert.match(api, /\["GET", "HEAD", "OPTIONS"\]\.includes\(verb\)/);
  assert.ok(api.includes('code === "AUTH_REQUIRED"'), "expired sessions must route back to sign-in");
});

test("split Render UI/API deployments resolve the API origin", async () => {
  const api = read("public/js/core/api.js");
  assert.ok(api.includes('host.endsWith(".onrender.com")'));
  assert.ok(api.includes('label.endsWith("-ui")'));
  for (const [, text] of allFrontend) {
    assert.doesNotMatch(text, /https:\/\/project-autopsy\.onrender\.com/);
  }
});

test("email verification and reset links route to the right screens", async () => {
  const email = read("src/modules/auth/auth.email.ts");
  assert.ok(email.includes('buildPublicUrl("#auth-verify=", token)'));
  assert.ok(email.includes('buildPublicUrl("#auth-reset=", token)'));
  const { parse, safeNext } = await importModule("public/js/core/router.js");
  const token = "a".repeat(43);
  assert.deepEqual(parse("#auth-verify=" + token), { name: "verify", token });
  assert.deepEqual(parse("#auth-reset=" + encodeURIComponent(token)), { name: "reset", token });
  assert.equal(parse("#/p/11111111-2222-3333-4444-555555555555/report").phase, "report");
  assert.equal(safeNext("#/projects?url=https%3A%2F%2Fgithub.com%2Fa%2Fb"), "#/projects?url=https%3A%2F%2Fgithub.com%2Fa%2Fb");
  assert.equal(safeNext("https://evil.example/#/projects"), "");
  assert.equal(safeNext("javascript:alert(1)"), "");
  assert.equal(safeNext("#/p/not-a-uuid"), "");
});

test("every server auth error code has a specific message in the auth UI", () => {
  const routes = read("src/modules/auth/auth.routes.ts");
  const ui = read("public/js/pages/auth.js") + read("public/js/pages/account.js");
  const codes = new Set([...routes.matchAll(/code: "([A-Z_]+)"/g)].map((m) => m[1]));
  for (const code of codes) {
    if (code === "SESSION_NOT_FOUND" || code === "PASSWORD_UNCHANGED") continue; // server message is shown verbatim
    assert.ok(ui.includes(code), "auth UI does not handle " + code);
  }
  const min = read("src/modules/auth/auth.crypto.ts").match(/PASSWORD_MIN_LENGTH = (\d+)/)?.[1];
  assert.ok(read("public/js/pages/auth.js").includes("const MIN = " + min + ";"));
});

test("the eleven phases are defined once and each has a renderer and a synced guide", async () => {
  const { PHASES } = await importModule("public/js/phases/meta.js");
  const { PHASE_RENDERERS } = await importModule("public/js/phases/index.js");
  const { SCENES } = await importModule("public/js/ui/scenes.js");
  assert.equal(PHASES.length, 11);
  assert.deepEqual(PHASES.map((p: any) => p.n), ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
  assert.deepEqual(
    PHASES.map((p: any) => p.title),
    ["Overview", "History", "Structure", "Quality", "Runtime", "Report", "Interview", "Insights", "Evidence", "Contributors", "Operations"]
  );
  for (const p of PHASES) {
    assert.equal(typeof PHASE_RENDERERS[p.id], "function", "no renderer for " + p.id);
    const scene = SCENES["g-" + p.id];
    assert.ok(scene, "no guide scene for " + p.id);
    assert.equal(scene.chapters.length, p.guide.length, p.id + " guide steps and animation chapters must stay in sync");
  }
});

test("the live pipeline recognises every progress stage the worker reports", async () => {
  const worker = read("src/workers/analysis.worker.ts");
  const { STAGES, stageIndex } = await importModule("public/js/phases/meta.js");
  const reported = new Set([...worker.matchAll(/stage: "([^"]+)"/g)].map((m) => m[1]));
  assert.ok(reported.size >= 10);
  for (const stage of reported) {
    assert.ok(stageIndex(stage) >= 0, "pipeline has no step for worker stage: " + stage);
  }
  assert.equal(STAGES.length, 11);
  // Order must follow the worker's execution order.
  const order = [...reported].map((s) => stageIndex(s));
  const firstSeen = order.filter((v, i) => order.indexOf(v) === i && v !== 0);
  assert.deepEqual(firstSeen, [...firstSeen].sort((a, b) => a - b));
});

test("every evidence endpoint the UI calls is mounted by the API", async () => {
  const { endpoint } = await importModule("public/js/core/store.js");
  const id = "11111111-2222-3333-4444-555555555555";
  const mounts = read("src/routes/index.ts");
  const repositoryRoutes = read("src/modules/repositories/repository.routes.ts");
  // Sub-routers mounted under /repositories/:repositoryId/<segment> and the file defining them.
  const subRouters: Record<string, string> = {
    runtime: "src/modules/runtime/runtime.routes.ts",
    deployments: "src/modules/deployments/deployment.routes.ts",
    report: "src/modules/reports/report.routes.ts",
    "interview-stories": "src/modules/interview/interview.routes.ts",
    interpretation: "src/modules/interpretation/interpretation.routes.ts",
    contributors: "src/modules/contributors/contributor-evolution.routes.ts"
  };
  const keys = ["commits", "timeline", "hotspots", "repeated", "bugs", "coupling", "refactors", "dependencies", "architecture", "migrations", "tests", "testSummary", "complexity", "contributors", "runtime", "runtimeEvents", "deployments", "historicalSummary", "report", "interview", "interpretation"];
  for (const key of keys) {
    const url: string = endpoint(key, id);
    assert.ok(url, "no endpoint for " + key);
    const parts = url.split("?")[0].replace("/api/repositories/" + id + "/", "").split("/");
    const [segment, ...rest] = parts;
    if (subRouters[segment]) {
      assert.ok(mounts.includes('"/repositories/:repositoryId/' + segment + '"'), key + ": router not mounted at " + segment);
      const sub = "/" + rest.join("/");
      assert.match(read(subRouters[segment]), new RegExp('\\.get\\(\\s*"' + sub.replace(/[/]/g, "\\/") + '"'), key + ": no GET " + sub + " in " + subRouters[segment]);
    } else {
      assert.ok(repositoryRoutes.includes('router.get("/:repositoryId/' + parts.join("/") + '"'), key + ": no repository route for " + parts.join("/"));
    }
  }
});

test("report search only returns the report's own claims, ranked, and exports every claim", async () => {
  const { searchReport, reportToMarkdown } = await importModule("public/js/phases/report.js");
  const report = {
    reportVersion: "1.0", analyzerVersion: "0.4.0", generatedAt: "2026-01-01T00:00:00.000Z", fingerprint: "f".repeat(64),
    repository: { id: "r", name: "demo", sourceType: "github", sourceUrl: "https://github.com/o/demo", trackedBranch: "main", defaultBranch: "main", headSha: "a".repeat(40) },
    analysis: { runId: "run", status: "completed", mode: "full", baseHeadSha: null, targetHeadSha: "a".repeat(40), startedAt: null, completedAt: null },
    coverage: { persistedCommits: 3, reportSampleLimit: 10, sectionsWithEvidence: 2, sectionsWithoutEvidence: ["database-evolution"] },
    sections: [
      { id: "change-hotspots", title: "Change hotspots", evidenceBasis: "persisted file-change metrics", limitation: "Historical only.", claims: [
        { id: "h1", statement: "src/server.ts was touched in 9 commits with 120 lines of recorded churn.", evidence: [{ source: "file_change_metrics", key: "src/server.ts", path: "src/server.ts" }], limitation: "Activity is not quality." }] },
      { id: "quality-signals", title: "Quality-related historical signals", evidenceBasis: "bug-subject heuristics", limitation: "Signals only.", claims: [
        { id: "q1", statement: "lib/index.js has 4 fix-labeled commits.", evidence: [{ source: "bug_area_signal", key: "lib/index.js", path: "lib/index.js" }], limitation: "Not proof of a bug." }] },
      { id: "database-evolution", title: "Database and schema evolution", evidenceBasis: "parsed migration-file evidence", limitation: "Code migrations stay explicit.", claims: [] }
    ],
    evidencePolicy: ["Signals are not proof."]
  };
  const hot = searchReport(report, "which files change most?");
  assert.equal(hot.hits[0].claim.id, "h1");
  const bugs = searchReport(report, "where are the bugs");
  assert.equal(bugs.hits[0].claim.id, "q1");
  assert.deepEqual(searchReport(report, "the and what").hits, []);
  assert.deepEqual(searchReport(report, "kubernetes helm chart").hits, []);
  for (const hit of [...hot.hits, ...bugs.hits]) {
    assert.ok(report.sections.some((s) => s.claims.includes(hit.claim)), "search must return existing claim objects");
  }
  const md = reportToMarkdown(report);
  for (const s of report.sections) {
    assert.ok(md.includes("## " + s.title));
    assert.ok(md.includes(s.limitation));
    for (const c of s.claims) { assert.ok(md.includes(c.statement)); assert.ok(md.includes(c.limitation)); }
  }
  assert.ok(md.includes("No evidence was available for this section"));
  assert.ok(md.includes(report.fingerprint));
});

test("interview UI covers exactly the server's story types and handles a stale snapshot", () => {
  const types = read("src/modules/interview/interview.types.ts");
  const ui = read("public/js/phases/interview.js");
  const serverTypes = [...types.matchAll(/\| "([a-z-]+)"/g)].map((m) => m[1]);
  assert.equal(serverTypes.length, 6);
  for (const t of serverTypes) assert.ok(ui.includes('"' + t + '":'), "interview UI has no label for " + t);
  assert.ok(ui.includes('error.code === "REPORT_NOT_READY"'));
  assert.ok(read("src/modules/interview/interview.routes.ts").includes('code: "REPORT_NOT_READY"'));
});

test("browser storage never holds credentials, tokens or session secrets", () => {
  for (const [file, text] of allFrontend.filter(([f]) => f.endsWith(".js"))) {
    for (const [, keyExpr] of text.matchAll(/(?:session|local)\.set\(([^,]+),/g)) {
      assert.match(keyExpr.trim(), /^"autopsy\.(lastEmail|next|lastRepo)"$|^key$|^NEXT_KEY$/, file + " stores unexpected key " + keyExpr);
    }
    assert.doesNotMatch(text, /(localStorage|sessionStorage)\.setItem\(\s*["'][^"']*(token|password|csrf|key)/i, file);
  }
  const projects = read("public/js/pages/projects.js");
  assert.ok(projects.includes('tokenInput.value = ""'), "repository token field must be cleared after import");
});

test("no sample or invented repository data ships in the frontend", () => {
  const banned = [/lorem ipsum/i, /john doe/i, /jane doe/i, /\bacme\b/i, /Priya Anand/, /Marcus B[eé]langer/, /\b1,840\b/, /rpt_[0-9a-f]{8}/, /PREVIEW DATA/, /CONCEPT PREVIEW/];
  for (const [file, text] of allFrontend) {
    for (const re of banned) assert.doesNotMatch(text, re, file + " contains " + re);
  }
});

test("design system: light grid canvas, safe areas, reduced motion and touch-safe inputs", () => {
  const css = read("public/css/app.css");
  assert.match(css, /color-scheme: light;/);
  assert.match(css, /body \{[\s\S]*?background-image:\s*linear-gradient\(var\(--grid\) 1px, transparent 1px\)/);
  for (const inset of ["safe-area-inset-top", "safe-area-inset-bottom", "safe-area-inset-left", "safe-area-inset-right"]) {
    assert.ok(css.includes(inset), "missing " + inset);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /font-size: 16px; \/\* prevents iOS zoom \*\//);
  assert.match(css, /@media print/);
});
