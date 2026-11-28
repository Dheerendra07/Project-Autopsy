// Phases built directly on persisted evidence: Overview, History, Structure, Quality,
// Runtime, Evidence, Contributors and Operations. Every number on screen comes from
// an API response for the current snapshot; empty sources say so explicitly.

import { api } from "../core/api.js";
import { getState, load, loadMany } from "../core/store.js";
import { href } from "../core/router.js";
import { esc, num, signed, pct, ms, date, relative, shortSha, plural, debounce, initials, compact } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { notice, empty, stat, miniBar, table, bindTables, inspectButton, filterRows, publicCheckSafe } from "./shared.js";

const pick = (row, keys) => { for (const k of keys) if (row && row[k] !== undefined && row[k] !== null) return row[k]; return null; };

function section({ title, sub = "", right = "", body, id = "", foot = "" }) {
  return `<section class="card" ${id ? `id="${id}"` : ""} style="margin-bottom:18px" data-filterable>
    <div class="card-section-head"><div><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ""}</div>${right}</div>
    ${body}
    ${foot ? `<div class="card-foot">${foot}</div>` : ""}
  </section>`;
}

function failed(errors, key, label) {
  const e = errors[key];
  return e ? notice({ tone: "warn", title: label + " couldn't load", body: esc(e.message) }) : "";
}

function searchTool(tools, root, placeholder) {
  tools.innerHTML = `<label class="sr-only" for="phaseSearch">Filter this phase</label>
    <div style="position:relative;min-width:min(320px,100%)"><input class="input" id="phaseSearch" type="search" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" style="min-height:40px;padding-left:38px;border-radius:999px;font-size:14px">
    <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--muted)">${icon("search")}</span></div>
    <span class="pill mono" id="phaseSearchCount" aria-live="polite"></span>`;
  const input = tools.querySelector("#phaseSearch");
  const count = tools.querySelector("#phaseSearchCount");
  const run = () => filterRows(root, input, count);
  input.addEventListener("input", debounce(run, 120));
  run();
  return run;
}

const commitCell = (sha, subject, at) =>
  `<span style="display:block;color:var(--ink)">${esc(subject || "—")}</span><span class="sub"><span class="mono">${esc(shortSha(sha))}</span> · ${esc(date(at))}</span>`;

// ---------------------------------------------------------------- 01 Overview

export async function overview({ root, repoId, isCurrent, go }) {
  root.innerHTML = '<div class="skel" style="height:110px;border-radius:20px"></div><div class="grid g2" style="margin-top:18px"><div class="skel" style="height:300px;border-radius:20px"></div><div class="skel" style="height:300px;border-radius:20px"></div></div>';
  const { data, errors } = await loadMany([["commits", { limit: 8 }], ["hotspots", { limit: 6 }], ["contributors", { limit: 5 }], ["timeline", { limit: 1 }, "first"]]);
  if (!isCurrent()) return;
  const s = getState();
  const commits = data.commits ? data.commits.commits || [] : [];
  const totalCommits = data.commits ? data.commits.pagination.total : null;
  const hotspots = data.hotspots ? data.hotspots.hotspots || [] : [];
  const contributors = data.contributors ? data.contributors.contributors || [] : [];
  const first = data.first && data.first.events && data.first.events[0];
  const latest = commits[0];
  const maxTouch = hotspots.reduce((m, h) => Math.max(m, h.commits_touched || 0), 0);
  const maxC = contributors.reduce((m, c) => Math.max(m, c.commitCount || 0), 0);
  const spanYears = first && latest ? ((new Date(latest.committed_at) - new Date(first.committed_at)) / (365.25 * 86400000)) : null;

  root.innerHTML = `
    <div class="cells" style="--cols:4;margin-bottom:18px">
      ${stat("Commits analyzed", num(totalCommits), latest ? "latest " + esc(relative(latest.committed_at)) : "")}
      ${stat("Contributors", num(data.contributors ? data.contributors.totalContributors : null), "exact Git identities")}
      ${stat("History span", spanYears == null ? "—" : spanYears < 1 ? Math.max(1, Math.round(spanYears * 12)) + " mo" : spanYears.toFixed(1) + " yrs", first ? "since " + esc(date(first.committed_at)) : "")}
      ${stat("Most-changed file", hotspots[0] ? `<span class="mono" style="font-size:15px;letter-spacing:0;overflow-wrap:anywhere">${esc(hotspots[0].path)}</span>` : "—", hotspots[0] ? plural(hotspots[0].commits_touched, "commit") : "", true)}
    </div>

    <div class="grid g2" style="margin-bottom:18px">
      <a class="card pad" href="${href("workspace", { repoId, phase: "report" })}" style="display:flex;gap:16px;align-items:flex-start">
        <span class="ph-icon" style="flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--ink);color:#fff">${icon("report")}</span>
        <span style="min-width:0"><span class="eyebrow">Phase 06</span><span style="display:block;font-weight:600;font-size:18px;letter-spacing:-.02em;margin-top:4px">Read the full evidence report</span><span class="muted" style="display:block;font-size:14px;margin-top:4px">Every section with its claims, citations and limitations. Ask it questions and export it.</span></span>
      </a>
      <a class="card pad" href="${href("workspace", { repoId, phase: "interview" })}" style="display:flex;gap:16px;align-items:flex-start">
        <span class="ph-icon" style="flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--accent);color:#fff">${icon("interview")}</span>
        <span style="min-width:0"><span class="eyebrow">Phase 07</span><span style="display:block;font-weight:600;font-size:18px;letter-spacing:-.02em;margin-top:4px">Prepare interview stories</span><span class="muted" style="display:block;font-size:14px;margin-top:4px">Questions matched to your history, with drafts, verification and practice mode.</span></span>
      </a>
    </div>

    ${failed(errors, "hotspots", "Hotspots")}${failed(errors, "commits", "Commits")}${failed(errors, "contributors", "Contributors")}
    <div class="grid g2">
      ${section({
        title: "Most-changed files",
        sub: "Ordered by commits touching the file, then churn.",
        right: `<a class="btn sm ghost" href="${href("workspace", { repoId, phase: "quality" })}">Quality ${icon("arrowRight")}</a>`,
        body: hotspots.length ? `<ul class="timeline">${hotspots.map((h) => `<li class="tl-item" data-item style="grid-template-columns:minmax(0,1fr) auto">
            <div class="tl-body"><div class="t mono" style="font-size:12.5px;overflow-wrap:anywhere">${esc(h.path)}</div><div style="margin:6px 0 2px">${miniBar(h.commits_touched, maxTouch)}</div><div class="m"><span>${plural(h.commits_touched, "commit")}</span><span class="add">+${num(h.additions)}</span><span class="del">−${num(h.deletions)}</span><span>last ${esc(relative(h.last_changed_at))}</span></div></div>
            ${inspectButton(h.path, "file_change_metrics · persisted per-file change totals", h)}
          </li>`).join("")}</ul>` : empty({ iconName: "file", title: "No file-change evidence", body: "This snapshot has no persisted file metrics." })
      })}
      ${section({
        title: "Latest commits",
        sub: "Newest first, from persisted Git history.",
        right: `<a class="btn sm ghost" href="${href("workspace", { repoId, phase: "history" })}">History ${icon("arrowRight")}</a>`,
        body: commits.length ? `<ul class="timeline">${commits.slice(0, 6).map((c) => `<li class="tl-item" data-item style="grid-template-columns:minmax(0,1fr) auto">
            <div class="tl-body"><div class="t">${esc(c.subject)}</div><div class="m"><span class="mono">${esc(shortSha(c.sha))}</span><span>${esc(c.author_name || "unknown author")}</span><span>${esc(relative(c.committed_at))}</span></div></div>
            ${inspectButton(c.subject, "commit · persisted Git commit metadata", c)}
          </li>`).join("")}</ul>` : empty({ iconName: "history", title: "No commits persisted" })
      })}
    </div>
    ${section({
      title: "Most active contributors",
      sub: "By persisted commit count. Descriptive only — not ownership.",
      right: `<a class="btn sm ghost" href="${href("workspace", { repoId, phase: "contributors" })}">Contributors ${icon("arrowRight")}</a>`,
      body: contributors.length ? `<ul class="timeline">${contributors.map((c) => `<li class="tl-item" data-item style="grid-template-columns:36px minmax(0,1fr) minmax(110px,180px)">
          <span class="repo-avatar" style="width:32px;height:32px;border-radius:9px;font-size:11px;background:var(--surface-3);color:var(--ink-2)">${esc(initials(c.authorName))}</span>
          <div class="tl-body"><div class="t">${esc(c.authorName || "unknown")}</div><div class="m"><span>${plural(c.pathsTouched, "path")}</span><span>${esc(compact(c.totalChurn))} churn</span></div></div>
          ${miniBar(c.commitCount, maxC, "accent")}
        </li>`).join("")}</ul>` : empty({ iconName: "contributors", title: "No contributor records" })
    })}
    ${s.runs && s.runs.length ? section({
      title: "Analysis runs",
      sub: "Each run seals its own snapshot. Phases read the latest completed run.",
      body: table([
        { label: "Run", render: (r) => `<span class="mono">${esc(String(r.id).slice(0, 8))}</span>`, sortable: false },
        { label: "Status", render: (r) => `<span class="pill ${r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"}">${esc(r.status)}</span>`, sortable: false },
        { label: "Mode", render: (r) => esc(r.mode || "—"), sortable: false },
        { label: "Target", render: (r) => `<span class="mono">${esc(shortSha(r.targetHeadSha))}</span>`, sortable: false },
        { label: "Started", render: (r) => esc(date(r.startedAt, true)), sortable: false },
        { label: "Analyzer", render: (r) => `<span class="mono">${esc(r.analyzerVersion || "—")}</span>`, sortable: false }
      ], s.runs.slice(0, 8))
    }) : ""}`;
  return null;
}

// ---------------------------------------------------------------- 02 History

const TYPE_LABEL = { feature: "Feature", fix: "Fix", refactor: "Refactor", test: "Test", dependency: "Dependency", database: "Database", docs: "Docs", chore: "Chore", other: "Other" };

export async function history({ root, tools, isCurrent }) {
  const st = { mode: "newest", type: "all", commits: [], commitsPage: 0, commitsTotal: 0, events: [], eventsPage: 0, eventsTotal: 0, loading: false };
  root.innerHTML = '<div class="skel" style="height:420px;border-radius:20px"></div>';

  async function more() {
    if (st.loading) return;
    st.loading = true;
    try {
      if (st.mode === "newest") {
        const body = await load("commits", { page: st.commitsPage + 1, limit: 50 });
        st.commitsPage = body.pagination.page;
        st.commitsTotal = body.pagination.total;
        st.commits = st.commits.concat(body.commits || []);
      } else {
        const body = await load("timeline", { page: st.eventsPage + 1, limit: 50 });
        st.eventsPage = body.pagination.page;
        st.eventsTotal = body.pagination.total;
        st.events = st.events.concat(body.events || []);
      }
    } finally {
      st.loading = false;
    }
  }

  function paint() {
    const rows = st.mode === "newest" ? st.commits : st.events;
    const total = st.mode === "newest" ? st.commitsTotal : st.eventsTotal;
    const counts = {};
    st.events.forEach((e) => { counts[e.eventType] = (counts[e.eventType] || 0) + 1; });
    const visible = st.mode === "timeline" && st.type !== "all" ? rows.filter((e) => e.eventType === st.type) : rows;
    root.innerHTML = `
      <div class="row wrap" style="justify-content:space-between;gap:12px;margin-bottom:14px">
        <div class="row gap-4" role="tablist" aria-label="History order" style="background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:4px">
          <button class="chip ${st.mode === "newest" ? "active" : ""}" role="tab" aria-selected="${st.mode === "newest"}" data-mode="newest" style="border:0">Newest first</button>
          <button class="chip ${st.mode === "timeline" ? "active" : ""}" role="tab" aria-selected="${st.mode === "timeline"}" data-mode="timeline" style="border:0">Typed timeline · from the start</button>
        </div>
        <span class="dim" style="font-size:13px">${num(rows.length)} of ${num(total)} loaded</span>
      </div>
      ${st.mode === "timeline" ? `<div class="row wrap gap-8" style="margin-bottom:14px">
        <button class="chip ${st.type === "all" ? "active" : ""}" data-type="all" aria-pressed="${st.type === "all"}">All <span class="mono dim">${num(st.events.length)}</span></button>
        ${Object.keys(TYPE_LABEL).filter((t) => counts[t]).map((t) => `<button class="chip ${st.type === t ? "active" : ""}" data-type="${t}" aria-pressed="${st.type === t}"><span class="tl-dot ${t}" style="margin:0;width:8px;height:8px;box-shadow:none"></span>${TYPE_LABEL[t]} <span class="mono dim">${num(counts[t])}</span></button>`).join("")}
      </div><p class="hint" style="margin:-4px 0 14px">Types come from commit-subject keywords. They are hints about the kind of change, not proof of intent. Counts cover loaded events.</p>` : ""}
      <section class="card" data-filterable>
        ${visible.length ? `<ul class="timeline">${visible.map((c) => `<li class="tl-item" data-item>
            <span class="tl-date">${esc(date(c.committed_at))}</span>
            <span class="tl-dot ${c.eventType || ""}"></span>
            <div class="tl-body" style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between">
              <div style="min-width:0"><div class="t">${esc(c.subject)}</div>
                <div class="m"><span class="mono">${esc(shortSha(c.sha))}</span><span>${esc(c.author_name || "unknown author")}</span><span>${plural(c.files_changed, "file")}</span>${c.additions != null ? `<span class="add">+${num(c.additions)}</span><span class="del">−${num(c.deletions)}</span>` : ""}${c.eventType ? `<span class="pill" style="height:20px;font-size:11px">${esc(TYPE_LABEL[c.eventType] || c.eventType)}</span>` : ""}</div>
              </div>
              ${inspectButton(c.subject, st.mode === "newest" ? "commit · persisted Git commit metadata" : "timeline event · commit-subject keyword heuristic", c)}
            </div>
          </li>`).join("")}</ul>` : empty({ iconName: "history", title: rows.length ? "No events of this type in the loaded range" : "No commits persisted" })}
        ${rows.length < total ? `<div class="card-foot"><span>${num(total - rows.length)} more in this snapshot</span><button class="btn sm" type="button" data-more>Load 50 more</button></div>` : rows.length ? `<div class="card-foot"><span>All ${num(total)} loaded</span></div>` : ""}
      </section>`;
    runFilter();
  }

  await more();
  if (!isCurrent()) return;
  const runFilter = searchTool(tools, root, "Search subjects, authors, SHAs…");
  paint();

  root.addEventListener("click", async (event) => {
    const modeBtn = event.target.closest("[data-mode]");
    const typeBtn = event.target.closest("[data-type]");
    const moreBtn = event.target.closest("[data-more]");
    if (modeBtn) {
      st.mode = modeBtn.getAttribute("data-mode");
      if (st.mode === "timeline" && !st.events.length) { root.querySelector(".card").style.opacity = ".5"; await more(); }
      if (isCurrent()) paint();
    } else if (typeBtn) {
      st.type = typeBtn.getAttribute("data-type");
      paint();
    } else if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.setAttribute("aria-busy", "true");
      try { await more(); } catch (e) { moreBtn.disabled = false; moreBtn.removeAttribute("aria-busy"); return; }
      if (isCurrent()) paint();
    }
  });
  return null;
}

// ---------------------------------------------------------------- 03 Structure

export async function structure({ root, tools, isCurrent }) {
  root.innerHTML = '<div class="skel" style="height:420px;border-radius:20px"></div>';
  const { data, errors } = await loadMany(["architecture", "dependencies", "complexity", "coupling"]);
  if (!isCurrent()) return;
  const arch = data.architecture ? data.architecture.events || [] : [];
  const deps = data.dependencies ? data.dependencies.changes || [] : [];
  const cx = data.complexity ? data.complexity.events || [] : [];
  const pairs = data.coupling ? data.coupling.pairs || [] : [];

  // Directory surfaces: latest known state per path.
  const surfaces = new Map();
  arch.forEach((e) => {
    const key = (e.root_path === "src" ? "src/" : "") + e.path;
    const cur = surfaces.get(key) || { key, root: e.root_path, events: [] };
    cur.events.push(e);
    surfaces.set(key, cur);
  });
  const surfaceList = [...surfaces.values()].map((s) => {
    const last = s.events[s.events.length - 1];
    return { ...s, present: last.event_type !== "removed", first: s.events[0], last };
  });
  const depCounts = deps.reduce((m, d) => { m[d.change_type] = (m[d.change_type] || 0) + 1; return m; }, {});
  const maxPair = pairs.reduce((m, p) => Math.max(m, p.co_change_count), 0);

  const specs = {
    tblDeps: { rows: deps, columns: [
      { label: "Package", key: "package_name", cls: "path", render: (d) => esc(d.package_name) },
      { label: "Scope", key: "scope", render: (d) => `<span class="pill mono">${esc(d.scope)}</span>` },
      { label: "Change", key: "change_type", render: (d) => `<span class="pill ${d.change_type === "added" ? "good" : d.change_type === "removed" ? "bad" : "warn"}">${esc(d.change_type)}</span>` },
      { label: "Version", key: "current_spec", render: (d) => `<span class="mono" style="font-size:12px">${esc(d.previous_spec || "—")} → ${esc(d.current_spec || "—")}</span>` },
      { label: "Commit", key: "committed_at", sort: (d) => d.committed_at, cls: "subject", render: (d) => commitCell(d.sha, d.subject, d.committed_at) },
      { label: "", sortable: false, render: (d) => inspectButton(d.package_name, "dependency_change · package.json commit snapshots", d) }
    ] },
    tblCx: { rows: cx, columns: [
      { label: "File", key: "path", cls: "path", render: (e) => esc(e.path) },
      { label: "Change", key: "change_type", render: (e) => esc(e.change_type) + (e.analysis_status !== "supported" ? `<span class="sub">${esc(e.analysis_status)}</span>` : "") },
      { label: "Cyclomatic", num: true, sort: (e) => e.after && e.after.cyclomaticComplexity, render: (e) => e.after && e.after.cyclomaticComplexity != null ? `${num(e.before && e.before.cyclomaticComplexity)} → <b>${num(e.after.cyclomaticComplexity)}</b>` : "—" },
      { label: "Δ", num: true, sort: (e) => e.delta && e.delta.cyclomaticComplexity, render: (e) => { const d = e.delta && e.delta.cyclomaticComplexity; return d == null ? "—" : `<span class="${d > 0 ? "del" : d < 0 ? "add" : ""}">${signed(d)}</span>`; } },
      { label: "Functions", num: true, sort: (e) => e.after && e.after.functionCount, render: (e) => num(e.after && e.after.functionCount) },
      { label: "Lines", num: true, sort: (e) => e.after && e.after.sourceLines, render: (e) => num(e.after && e.after.sourceLines) },
      { label: "Commit", sort: (e) => e.committed_at, cls: "subject", render: (e) => commitCell(e.sha, e.subject, e.committed_at) },
      { label: "", sortable: false, render: (e) => inspectButton(e.path, "code_complexity · TypeScript AST file-change snapshot", e) }
    ] },
    tblPairs: { rows: pairs, columns: [
      { label: "File A", key: "path_a", cls: "path", render: (p) => esc(p.path_a) },
      { label: "File B", key: "path_b", cls: "path", render: (p) => esc(p.path_b) },
      { label: "Co-changes", num: true, key: "co_change_count", render: (p) => miniBar(p.co_change_count, maxPair, "accent") },
      { label: "", sortable: false, render: (p) => inspectButton(p.path_a + " ↔ " + p.path_b, "coupling · files changed together in the same commits", p) }
    ] }
  };

  root.innerHTML = `
    <div class="cells" style="--cols:4;margin-bottom:18px">
      ${stat("Directory surfaces", num(surfaceList.length), num(surfaceList.filter((s) => s.present).length) + " present at head")}
      ${stat("Dependency changes", num(deps.length), Object.entries(depCounts).map(([k, v]) => num(v) + " " + esc(k)).join(" · ") || "none recorded")}
      ${stat("Complexity events", num(cx.length), "changed JS/TS files")}
      ${stat("Co-change pairs", num(pairs.length), "≥ 2 shared commits")}
    </div>
    ${failed(errors, "architecture", "Architecture")}
    ${section({
      title: "Directory evolution",
      sub: "Top-level and src/ directories seen in Git tree snapshots. Structural only — not a runtime architecture.",
      body: surfaceList.length ? `<div style="padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px">${surfaceList.map((s) => `
          <div class="card flat" data-item style="padding:14px;border-radius:14px;${s.present ? "" : "opacity:.6"}">
            <div class="row" style="justify-content:space-between;gap:8px"><span class="mono" style="font-size:13px;font-weight:500;overflow-wrap:anywhere">${icon("folder").replace("<svg", '<svg style="width:14px;height:14px;display:inline;vertical-align:-2px;margin-right:6px;color:var(--muted)"')}${esc(s.key)}</span><span class="pill ${s.present ? "good" : "bad"}" style="height:20px;font-size:11px">${s.present ? "present" : "removed"}</span></div>
            <div class="hint" style="margin-top:8px">${esc(s.first.event_type)} ${esc(date(s.first.committed_at))}${s.events.length > 1 ? " · " + plural(s.events.length, "event") : ""}</div>
            <div class="row" style="justify-content:flex-end;margin-top:6px">${inspectButton(s.key, "architecture_event · Git tree directory snapshots", s.events)}</div>
          </div>`).join("")}</div>` : empty({ iconName: "structure", title: "No directory events", body: "No top-level or src/ directory changes were recorded." })
    })}
    ${failed(errors, "dependencies", "Dependencies")}
    ${section({ title: "Dependency changes", sub: "From package.json snapshots at each commit. Newest analysis window first 100.", body: deps.length ? table(specs.tblDeps.columns, deps, { id: "tblDeps" }) : empty({ iconName: "package", title: "No package.json dependency history", body: "Dependency evolution is recorded for package.json manifests." }) })}
    ${failed(errors, "complexity", "Complexity")}
    ${section({ title: "Complexity changes", sub: "AST metrics before and after each change to .ts/.tsx/.js/.jsx/.mjs/.cjs files. Parse failures stay marked, never estimated.", body: cx.length ? table(specs.tblCx.columns, cx, { id: "tblCx" }) : empty({ iconName: "layers", title: "No complexity evidence", body: "No supported JavaScript or TypeScript files changed in this history." }) })}
    ${failed(errors, "coupling", "Coupling")}
    ${section({ title: "Files that change together", sub: "Pairs edited in the same commits at least twice. A coupling signal, not proof of a code dependency.", body: pairs.length ? table(specs.tblPairs.columns, pairs, { id: "tblPairs" }) : empty({ iconName: "link", title: "No repeated co-changes" }) })}`;
  bindTables(root, specs);
  searchTool(tools, root, "Filter paths, packages, commits…");
  return null;
}

// ---------------------------------------------------------------- 04 Quality

export async function quality({ root, tools, isCurrent }) {
  root.innerHTML = '<div class="skel" style="height:420px;border-radius:20px"></div>';
  const { data, errors } = await loadMany(["bugs", "repeated", "refactors", "migrations", "tests", "testSummary"]);
  if (!isCurrent()) return;
  const bugs = data.bugs ? data.bugs.areas || [] : [];
  const repeated = data.repeated ? data.repeated.files || [] : [];
  const refactors = data.refactors ? data.refactors.signals || [] : [];
  const migrations = data.migrations ? data.migrations.events || [] : [];
  const tests = data.tests ? data.tests.events || [] : [];
  const ts = data.testSummary ? data.testSummary.overall : null;
  const maxSig = bugs.reduce((m, b) => Math.max(m, b.signal_commits), 0);
  const maxRep = repeated.reduce((m, r) => Math.max(m, r.commits_touched), 0);

  const specs = {
    tblBugs: { rows: bugs, columns: [
      { label: "File", key: "path", cls: "path", render: (b) => esc(b.path) },
      { label: "Fix-labeled commits", num: true, key: "signal_commits", render: (b) => miniBar(b.signal_commits, maxSig, "bad") },
      { label: "Of total", num: true, key: "total_commits_touched", render: (b) => num(b.total_commits_touched) },
      { label: "Share", num: true, key: "signal_ratio", render: (b) => pct(b.signal_ratio, 0) },
      { label: "Last signal", key: "last_signal_at", render: (b) => esc(date(b.last_signal_at)) },
      { label: "", sortable: false, render: (b) => inspectButton(b.path, "bug_area_signal · commit-subject keyword heuristic", b) }
    ] },
    tblRep: { rows: repeated, columns: [
      { label: "File", key: "path", cls: "path", render: (r) => esc(r.path) },
      { label: "Commits", num: true, key: "commits_touched", render: (r) => miniBar(r.commits_touched, maxRep) },
      { label: "Churn", num: true, key: "total_churn", render: (r) => num(r.total_churn) },
      { label: "Span", num: true, key: "change_span_days", render: (r) => num(r.change_span_days) + " d" },
      { label: "Last changed", key: "last_changed_at", render: (r) => esc(date(r.last_changed_at)) },
      { label: "", sortable: false, render: (r) => inspectButton(r.path, "repeated_file_history · persisted Git file history", r) }
    ] },
    tblRef: { rows: refactors, columns: [
      { label: "Commit", sort: (r) => r.committed_at, cls: "subject", render: (r) => commitCell(r.sha, r.subject, r.committed_at) },
      { label: "Files", num: true, key: "files_changed", render: (r) => num(r.files_changed) },
      { label: "", sortable: false, render: (r) => inspectButton(r.subject, "refactor_signal · commit-subject keyword heuristic", r) }
    ] },
    tblMig: { rows: migrations, columns: [
      { label: "Migration", key: "path", cls: "path", render: (m) => esc(m.path) },
      { label: "Framework", key: "framework", render: (m) => `<span class="pill mono">${esc(m.framework)}</span>` },
      { label: "Kind", key: "migrationKind", render: (m) => esc(m.migrationKind) + (m.analysisStatus && m.analysisStatus !== "supported" ? `<span class="sub">${esc(m.analysisStatus)}</span>` : "") },
      { label: "Ops", num: true, key: "operationCount", render: (m) => num(m.operationCount) },
      { label: "Destructive", key: "destructiveSignals", sort: (m) => (m.destructiveSignals || []).length, render: (m) => (m.destructiveSignals || []).length ? (m.destructiveSignals || []).map((d) => `<span class="pill bad" style="margin:2px">${esc(d)}</span>`).join("") : '<span class="dim">none</span>' },
      { label: "Commit", sort: (m) => m.committedAt, cls: "subject", render: (m) => commitCell(m.sha, m.subject, m.committedAt) },
      { label: "", sortable: false, render: (m) => inspectButton(m.path, "database_migration · parsed migration file", m) }
    ] },
    tblTests: { rows: tests, columns: [
      { label: "Test file", key: "path", cls: "path", render: (t) => esc(t.path) },
      { label: "Framework", key: "framework", render: (t) => `<span class="pill mono">${esc(t.framework || "unknown")}</span>` },
      { label: "Change", key: "changeType", render: (t) => esc(t.changeType) },
      { label: "Test cases", num: true, key: "testCaseCount", render: (t) => `${num(t.previousTestCaseCount)} → <b>${num(t.testCaseCount)}</b>` },
      { label: "Δ", num: true, key: "testCaseDelta", render: (t) => `<span class="${t.testCaseDelta > 0 ? "add" : t.testCaseDelta < 0 ? "del" : ""}">${signed(t.testCaseDelta)}</span>` },
      { label: "Commit", sort: (t) => t.committedAt, cls: "subject", render: (t) => commitCell(t.sha, t.subject, t.committedAt) },
      { label: "", sortable: false, render: (t) => inspectButton(t.path, "test_evolution · test-source text analysis", t) }
    ] }
  };

  root.innerHTML = `
    <div class="cells" style="--cols:4;margin-bottom:18px">
      ${stat("Fix-signal areas", num(bugs.length), "files with ≥ 2 fix-labeled commits")}
      ${stat("Repeatedly modified", num(repeated.length), "files with ≥ 3 commits")}
      ${stat("Test-case delta", ts ? signed(ts.testCaseDelta) : "—", ts ? plural(ts.eventCount, "test-file change") : "")}
      ${stat("Migrations", num(migrations.length), migrations.filter((m) => (m.destructiveSignals || []).length).length + " with destructive markers")}
    </div>
    ${notice({ title: "Signals to investigate, not verdicts", body: "Fix and refactor labels come from commit-subject keywords. Test counts come from source text, not executed runs. Use these to decide where to look, then inspect the records.", iconName: "info" })}
    ${failed(errors, "bugs", "Bug-signal areas")}
    ${section({ title: "Where fixes cluster", sub: "Files whose history includes repeated fix/bug/regression/patch commit subjects.", body: bugs.length ? table(specs.tblBugs.columns, bugs, { id: "tblBugs" }) : empty({ iconName: "quality", title: "No repeated fix signals", body: "No file has two or more fix-labeled commits." }) })}
    ${failed(errors, "repeated", "Repeatedly modified files")}
    ${section({ title: "Repeatedly modified files", sub: "Files touched in three or more commits, by frequency then churn.", body: repeated.length ? table(specs.tblRep.columns, repeated, { id: "tblRep" }) : empty({ iconName: "file", title: "No repeatedly modified files" }) })}
    ${failed(errors, "refactors", "Refactor signals")}
    ${section({ title: "Refactor signals", sub: "Commits whose subjects indicate restructuring.", body: refactors.length ? table(specs.tblRef.columns, refactors, { id: "tblRef" }) : empty({ iconName: "layers", title: "No refactor-labeled commits", body: "No commit subject matched refactor keywords." }) })}
    ${failed(errors, "migrations", "Migrations")}
    ${section({ title: "Database migrations", sub: "Parsed migration files with operation counts and destructive markers.", body: migrations.length ? table(specs.tblMig.columns, migrations, { id: "tblMig" }) : empty({ iconName: "database", title: "No migration files found", body: "No supported migration files were found in this history. That is not proof the project has no schema changes." }) })}
    ${failed(errors, "tests", "Test evolution")}
    ${ts ? `<div class="cells" style="--cols:4;margin-bottom:18px">
      ${stat("Test cases (net Δ)", signed(ts.testCaseDelta), "across changed test files")}
      ${stat("Suites (net Δ)", signed(ts.suiteDelta), "")}
      ${stat("Assertions (net Δ)", signed(ts.assertionDelta), "")}
      ${stat("Observed", ts.firstObservedAt ? esc(date(ts.firstObservedAt)) : "—", ts.lastObservedAt ? "to " + esc(date(ts.lastObservedAt)) : "", true)}
    </div>` : ""}
    ${section({ title: "Test-source changes", sub: "How test files changed over time. Pass/fail and coverage are not established here.", body: tests.length ? table(specs.tblTests.columns, tests, { id: "tblTests" }) : empty({ iconName: "flask", title: "No test-file changes recorded" }) })}`;
  bindTables(root, specs);
  searchTool(tools, root, "Filter files, commits, frameworks…");
  return null;
}

// ---------------------------------------------------------------- 05 Runtime

export async function runtime({ root, isCurrent }) {
  root.innerHTML = '<div class="skel" style="height:320px;border-radius:20px"></div>';
  const { data, errors } = await loadMany(["runtime", "runtimeEvents", "deployments", "historicalSummary"]);
  if (!isCurrent()) return;
  const o = data.runtime ? data.runtime.overall : null;
  const groups = data.runtime ? data.runtime.groups || [] : [];
  const events = data.runtimeEvents ? data.runtimeEvents.events || [] : [];
  const deps = data.deployments ? data.deployments.events || [] : [];
  const hist = data.historicalSummary ? data.historicalSummary.result : null;
  const hasTelemetry = o && o.sampleCount > 0;

  const specs = {
    tblGroups: { rows: groups, columns: [
      { label: "Revision", key: "key", cls: "sha", render: (g) => esc(g.key && g.key.length >= 40 ? shortSha(g.key) : g.key) + (g.revisionKnown === false ? '<span class="sub">not in history</span>' : "") },
      { label: "Samples", num: true, key: "sampleCount", render: (g) => num(g.sampleCount) },
      { label: "Error rate", num: true, key: "errorRate", render: (g) => pct(g.errorRate) },
      { label: "Avg", num: true, key: "avgDurationMs", render: (g) => ms(g.avgDurationMs) },
      { label: "p95", num: true, key: "p95DurationMs", render: (g) => ms(g.p95DurationMs) },
      { label: "", sortable: false, render: (g) => inspectButton("Revision " + g.key, "runtime_telemetry_group · observed telemetry", g) }
    ] },
    tblEvents: { rows: events, columns: [
      { label: "Observed", sort: (e) => pick(e, ["observedAt", "observed_at"]), render: (e) => esc(date(pick(e, ["observedAt", "observed_at"]), true)) },
      { label: "Operation", cls: "path", sort: (e) => pick(e, ["operationName", "operation_name"]), render: (e) => esc(pick(e, ["operationName", "operation_name"]) || "—") + `<span class="sub">${esc(pick(e, ["signalType", "signal_type"]) || "")} · ${esc(pick(e, ["serviceName", "service_name"]) || "")}</span>` },
      { label: "Duration", num: true, sort: (e) => pick(e, ["durationMs", "duration_ms"]), render: (e) => ms(pick(e, ["durationMs", "duration_ms"])) },
      { label: "Status", sort: (e) => pick(e, ["status"]), render: (e) => { const s = pick(e, ["status"]); return `<span class="pill ${s === "error" ? "bad" : "good"}">${esc(s || "—")}</span>`; } },
      { label: "Revision", cls: "sha", sort: (e) => pick(e, ["revisionSha", "revision_sha"]), render: (e) => esc(shortSha(pick(e, ["revisionSha", "revision_sha"]))) },
      { label: "", sortable: false, render: (e) => inspectButton(pick(e, ["operationName", "operation_name"]) || "Telemetry event", "runtime_telemetry · observed event", e) }
    ] },
    tblDeploys: { rows: deps, columns: [
      { label: "When", sort: (d) => pick(d, ["occurredAt", "occurred_at"]), render: (d) => esc(date(pick(d, ["occurredAt", "occurred_at"]), true)) },
      { label: "Environment", sort: (d) => pick(d, ["environment"]), render: (d) => `<span class="pill mono">${esc(pick(d, ["environment"]) || "—")}</span>` },
      { label: "State", sort: (d) => pick(d, ["state"]), render: (d) => { const s = pick(d, ["state"]); return `<span class="pill ${s === "succeeded" ? "good" : s === "failed" ? "bad" : "warn"}">${esc(s || "—")}</span>`; } },
      { label: "Revision", cls: "sha", sort: (d) => pick(d, ["revisionSha", "revision_sha"]), render: (d) => esc(shortSha(pick(d, ["revisionSha", "revision_sha"]))) },
      { label: "Deployment", cls: "path", sort: (d) => pick(d, ["deploymentId", "deployment_id"]), render: (d) => esc(pick(d, ["deploymentId", "deployment_id"]) || "—") + `<span class="sub">${esc(pick(d, ["provider"]) || "")}</span>` },
      { label: "", sortable: false, render: (d) => inspectButton(pick(d, ["deploymentId", "deployment_id"]) || "Deployment", "deployment_evidence · observed external record", d) }
    ] }
  };

  const ingestHelp = `
    <div style="padding:18px 20px;display:grid;gap:12px">
      <p class="muted" style="font-size:14px">Runtime evidence is machine-to-machine. Your services or CI send it to this server; nothing is inferred from Git.</p>
      <div class="kv-list">
        <div class="k">Telemetry</div><div class="v">POST /api/repositories/${esc(getState().repo.id)}/runtime/telemetry</div>
        <div class="k">Deployments</div><div class="v">POST /api/repositories/${esc(getState().repo.id)}/deployments</div>
        <div class="k">Auth</div><div class="v">ingestion key configured by the server operator</div>
      </div>
      <p class="hint">See the project README sections “Runtime telemetry” and “Deployment evidence” for the payload format.</p>
    </div>`;

  root.innerHTML = `
    ${failed(errors, "runtime", "Telemetry summary")}
    ${hasTelemetry ? `<div class="cells" style="--cols:4;margin-bottom:18px">
      ${stat("Samples", num(o.sampleCount), num(o.durationSampleCount) + " with duration")}
      ${stat("Error rate", pct(o.errorRate), num(o.errorCount) + " errors")}
      ${stat("p50 / p95", ms(o.p50DurationMs) + " · " + ms(o.p95DurationMs), "p99 " + ms(o.p99DurationMs), true)}
      ${stat("Observed", esc(date(o.firstObservedAt)), "to " + esc(date(o.lastObservedAt)), true)}
    </div>` : notice({ title: "No runtime telemetry has been sent for this repository", body: "This phase stays empty until your systems report observations. Absence of telemetry is not evidence the application had no runtime issues.", iconName: "runtime" })}
    ${hasTelemetry ? section({ title: "By revision", sub: "Observed measurements grouped by the revision that reported them.", body: table(specs.tblGroups.columns, groups, { id: "tblGroups" }) }) : ""}
    ${hasTelemetry ? section({ title: "Recent telemetry events", sub: "Newest observed events (first 40).", body: table(specs.tblEvents.columns, events, { id: "tblEvents" }) }) : ""}
    ${failed(errors, "deployments", "Deployments")}
    ${section({ title: "Deployment evidence", sub: "Releases reported by your deployment system, tied to exact revisions.", body: deps.length ? table(specs.tblDeploys.columns, deps, { id: "tblDeploys" }) : empty({ iconName: "bolt", title: "No deployment records", body: "No deployment events have been ingested." }) })}
    ${hist && hist.pageCoverage && hist.pageCoverage.ready > 0 ? section({ title: "Historical before/after windows", sub: esc(hist.semantics && hist.semantics.interpretation || ""), body: `<div class="cells" style="--cols:3;margin:16px;box-shadow:none">
        ${stat("Ready comparisons", num(hist.pageCoverage.ready), num(hist.pageCoverage.evidenceGaps) + " evidence gaps")}
        ${stat("Avg duration ↑ / ↓", num(hist.metricDirections.averageDuration.increased) + " / " + num(hist.metricDirections.averageDuration.decreased), "unchanged " + num(hist.metricDirections.averageDuration.unchanged), true)}
        ${stat("Error rate ↑ / ↓", num(hist.metricDirections.errorRate.increased) + " / " + num(hist.metricDirections.errorRate.decreased), "unchanged " + num(hist.metricDirections.errorRate.unchanged), true)}
      </div>` }) : ""}
    ${!hasTelemetry || !deps.length ? section({ title: "How to send runtime evidence", body: ingestHelp }) : ""}`;
  bindTables(root, specs);
  return null;
}

// ---------------------------------------------------------------- 09 Evidence

const FAMILIES = [
  { id: "commits", label: "Commits", key: "commits", field: "commits", title: (r) => r.subject, sub: (r) => shortSha(r.sha) + " · " + (r.author_name || "") + " · " + date(r.committed_at), basis: "commit · persisted Git commit metadata" },
  { id: "files", label: "Files", key: "hotspots", field: "hotspots", title: (r) => r.path, sub: (r) => plural(r.commits_touched, "commit") + " · " + num(r.total_churn) + " churn", basis: "file_change_metrics" },
  { id: "deps", label: "Dependencies", key: "dependencies", field: "changes", title: (r) => r.package_name + " · " + r.change_type, sub: (r) => (r.previous_spec || "—") + " → " + (r.current_spec || "—") + " · " + date(r.committed_at), basis: "dependency_change" },
  { id: "arch", label: "Structure", key: "architecture", field: "events", title: (r) => r.root_path + "/" + r.path + " · " + r.event_type, sub: (r) => shortSha(r.sha) + " · " + date(r.committed_at), basis: "architecture_event" },
  { id: "cx", label: "Complexity", key: "complexity", field: "events", title: (r) => r.path, sub: (r) => r.change_type + " · cyclomatic " + (r.after && r.after.cyclomaticComplexity != null ? r.after.cyclomaticComplexity : "—") + " · " + date(r.committed_at), basis: "code_complexity" },
  { id: "pairs", label: "Coupling", key: "coupling", field: "pairs", title: (r) => r.path_a + " ↔ " + r.path_b, sub: (r) => plural(r.co_change_count, "shared commit"), basis: "coupling" },
  { id: "bugs", label: "Fix signals", key: "bugs", field: "areas", title: (r) => r.path, sub: (r) => plural(r.signal_commits, "fix-labeled commit"), basis: "bug_area_signal" },
  { id: "refactors", label: "Refactors", key: "refactors", field: "signals", title: (r) => r.subject, sub: (r) => shortSha(r.sha) + " · " + date(r.committed_at), basis: "refactor_signal" },
  { id: "migrations", label: "Migrations", key: "migrations", field: "events", title: (r) => r.path, sub: (r) => r.framework + " · " + plural(r.operationCount, "operation"), basis: "database_migration" },
  { id: "tests", label: "Tests", key: "tests", field: "events", title: (r) => r.path, sub: (r) => signed(r.testCaseDelta) + " test cases · " + date(r.committedAt), basis: "test_evolution" }
];

export async function evidence({ root, tools, isCurrent }) {
  root.innerHTML = '<div class="skel" style="height:420px;border-radius:20px"></div>';
  const keys = FAMILIES.map((f) => (f.key === "commits" ? ["commits", { limit: 100 }] : f.key === "hotspots" ? ["hotspots", { limit: 100 }] : f.key));
  const { data, errors } = await loadMany(keys);
  if (!isCurrent()) return;
  const items = [];
  FAMILIES.forEach((f) => {
    const body = data[f.key];
    (body && body[f.field] || []).forEach((r) => items.push({ f, r, text: (f.title(r) + " " + f.sub(r)).toLowerCase() }));
  });
  const counts = FAMILIES.reduce((m, f) => { m[f.id] = items.filter((i) => i.f.id === f.id).length; return m; }, {});
  let family = "all", term = "", limit = 120;

  function paint() {
    const list = items.filter((i) => (family === "all" || i.f.id === family) && (!term || i.text.includes(term)));
    root.querySelector("#evList").innerHTML = list.length
      ? `<ul class="timeline">${list.slice(0, limit).map((i) => `<li class="tl-item" style="grid-template-columns:110px minmax(0,1fr) auto">
          <span><span class="pill" style="font-size:11px">${esc(i.f.label)}</span></span>
          <div class="tl-body"><div class="t" style="word-break:break-word">${esc(i.f.title(i.r))}</div><div class="m">${esc(i.f.sub(i.r))}</div></div>
          ${inspectButton(i.f.title(i.r), i.f.basis, i.r)}
        </li>`).join("")}</ul>${list.length > limit ? `<div class="card-foot"><span>Showing ${num(limit)} of ${num(list.length)}</span><button class="btn sm" data-ev-more>Show more</button></div>` : ""}`
      : empty({ iconName: "search", title: "No records match", body: "Try another term or family." });
    root.querySelector("#evCount").textContent = num(list.length) + " records";
  }

  const failedFamilies = Object.keys(errors);
  root.innerHTML = `
    ${failedFamilies.length ? notice({ tone: "warn", title: "Some evidence families couldn't load", body: esc(failedFamilies.join(", ")) }) : ""}
    <div class="row wrap gap-8" style="margin-bottom:14px" id="evFamilies">
      <button class="chip active" data-family="all" aria-pressed="true">All <span class="mono dim">${num(items.length)}</span></button>
      ${FAMILIES.filter((f) => counts[f.id]).map((f) => `<button class="chip" data-family="${f.id}" aria-pressed="false">${esc(f.label)} <span class="mono dim">${num(counts[f.id])}</span></button>`).join("")}
    </div>
    <section class="card"><div class="card-section-head"><div><h3>Evidence index</h3><p>Records loaded for this snapshot (bounded per family). Open any one for its exact JSON.</p></div><span class="pill mono" id="evCount"></span></div><div id="evList"></div></section>`;
  tools.innerHTML = `<label class="sr-only" for="evSearch">Search evidence</label><div style="position:relative;min-width:min(340px,100%)"><input class="input" id="evSearch" type="search" placeholder="Search paths, packages, subjects, SHAs…" autocomplete="off" spellcheck="false" style="min-height:40px;padding-left:38px;border-radius:999px;font-size:14px"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--muted)">${icon("search")}</span></div>`;
  tools.querySelector("#evSearch").addEventListener("input", debounce((e) => { term = e.target.value.trim().toLowerCase(); limit = 120; paint(); }, 120));
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-family]");
    if (chip) {
      family = chip.getAttribute("data-family");
      root.querySelectorAll("[data-family]").forEach((c) => { const on = c === chip; c.classList.toggle("active", on); c.setAttribute("aria-pressed", String(on)); });
      limit = 120;
      paint();
    }
    if (e.target.closest("[data-ev-more]")) { limit += 120; paint(); }
  });
  paint();
  return null;
}

// ---------------------------------------------------------------- 10 Contributors

export async function contributors({ root, tools, isCurrent }) {
  root.innerHTML = '<div class="skel" style="height:420px;border-radius:20px"></div>';
  const body = await load("contributors", { limit: 100 });
  if (!isCurrent()) return;
  const rows = body.contributors || [];
  const totalCommits = rows.reduce((m, c) => m + c.commitCount, 0);
  const maxC = rows.reduce((m, c) => Math.max(m, c.commitCount), 0);
  const top = rows[0];
  const specs = { tblContrib: { rows, columns: [
    { label: "Author", key: "authorName", render: (c) => `<span class="row gap-8" style="flex-wrap:nowrap"><span class="repo-avatar" style="width:30px;height:30px;border-radius:9px;font-size:11px;background:var(--surface-3);color:var(--ink-2)">${esc(initials(c.authorName))}</span><span style="min-width:0"><span style="display:block;color:var(--ink)">${esc(c.authorName || "unknown")}</span><span class="sub" style="overflow-wrap:anywhere">${esc(c.authorEmail || "")}</span></span></span>` },
    { label: "Commits", num: true, key: "commitCount", render: (c) => miniBar(c.commitCount, maxC, "accent") },
    { label: "Additions", num: true, key: "additions", render: (c) => `<span class="add">+${num(c.additions)}</span>` },
    { label: "Deletions", num: true, key: "deletions", render: (c) => `<span class="del">−${num(c.deletions)}</span>` },
    { label: "Paths", num: true, key: "pathsTouched", render: (c) => num(c.pathsTouched) },
    { label: "Active", key: "firstCommittedAt", render: (c) => esc(date(c.firstCommittedAt)) + `<span class="sub">to ${esc(date(c.lastCommittedAt))}</span>` },
    { label: "", sortable: false, render: (c) => inspectButton(c.authorName || "Contributor", "contributor_activity · persisted Git author metadata", c) }
  ] } };
  root.innerHTML = `
    <div class="cells" style="--cols:3;margin-bottom:18px">
      ${stat("Contributor identities", num(body.totalContributors), rows.length < body.totalContributors ? "top " + num(rows.length) + " shown" : "all shown")}
      ${stat("Commits by listed authors", num(totalCommits), "")}
      ${stat("Most commits", top ? esc(top.authorName || "unknown") : "—", top && totalCommits ? pct(top.commitCount / totalCommits, 0) + " of listed commits" : "", true)}
    </div>
    ${notice({ title: "Identity is exact, not merged", body: esc(body.semantics && body.semantics.identityBasis || "") + " " + esc(body.semantics && body.semantics.interpretation || ""), iconName: "info" })}
    ${section({ title: "Contributors", sub: "Sorted by commit count. Click a column to re-sort.", body: rows.length ? table(specs.tblContrib.columns, rows, { id: "tblContrib" }) : empty({ iconName: "contributors", title: "No contributor records" }) })}`;
  bindTables(root, specs);
  searchTool(tools, root, "Filter by name or email…");
  return null;
}

// ---------------------------------------------------------------- 11 Operations

export async function operations({ root, tools, isCurrent }) {
  let timer = 0;
  tools.innerHTML = `<span class="pill mono" id="opsUpdated"></span><button class="btn sm" type="button" id="opsRefresh">${icon("refresh")}Refresh</button>`;
  async function paint() {
    const [summary, health, ready] = await Promise.all([
      api("/api/observability/summary").then((b) => ({ ok: true, b }), (e) => ({ ok: false, e })),
      publicCheckSafe("/health"),
      publicCheckSafe("/ready")
    ]);
    if (!isCurrent()) return;
    const s = summary.ok ? summary.b : null;
    const dep = s && s.dependencies || {};
    const q = s && s.analysisQueue || {};
    const tile = (name, ok, detail) => `<div class="card health"><div class="h-top"><span class="h-name">${esc(name)}</span><span class="pill ${ok ? "good" : "bad"}"><span class="dot"></span>${ok ? "ready" : "unavailable"}</span></div><div class="hint">${detail}</div></div>`;
    root.innerHTML = `
      ${summary.ok ? "" : notice({ tone: "bad", title: "Service summary unavailable", body: esc(summary.e.message) })}
      <div class="health-grid" style="margin-bottom:18px">
        ${tile("API", health.ok, health.ok ? "GET /health → 200" : "GET /health failed (" + esc(health.status || "no response") + ")")}
        ${tile("PostgreSQL", dep.database && dep.database.status === "ready", dep.database && dep.database.latencyMs != null ? "latency " + num(dep.database.latencyMs) + " ms" : "no measurement")}
        ${tile("Redis", dep.redis && dep.redis.status === "ready", dep.redis && dep.redis.latencyMs != null ? "latency " + num(dep.redis.latencyMs) + " ms" : "no measurement")}
        ${tile("Readiness", ready.ok, ready.ok ? "GET /ready → 200" : "GET /ready → " + esc(ready.status || "no response"))}
      </div>
      ${s ? `<div class="cells" style="--cols:4;margin-bottom:18px">
        ${stat("Uptime", s.process ? formatUptime(s.process.uptimeSeconds) : "—", s.process ? "Node " + esc(s.process.nodeVersion) : "")}
        ${stat("Memory (RSS)", s.process ? num(s.process.rssMb) + " MB" : "—", s.process ? "heap " + num(s.process.heapUsedMb) + " MB" : "")}
        ${stat("Queue active", num(q.active), num(q.waiting) + " waiting · " + num(q.delayed) + " delayed")}
        ${stat("Queue finished", num(q.completed), num(q.failed) + " failed")}
      </div>` : ""}
      ${notice({ title: "Operational data is separate from evidence", body: "These numbers describe the running service. Refreshing them never changes any repository snapshot.", iconName: "shield" })}`;
    const up = tools.querySelector("#opsUpdated");
    if (up) up.textContent = "updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  root.innerHTML = '<div class="skel" style="height:260px;border-radius:20px"></div>';
  await paint();
  tools.querySelector("#opsRefresh").addEventListener("click", async (e) => { e.currentTarget.setAttribute("aria-busy", "true"); await paint(); tools.querySelector("#opsRefresh")?.removeAttribute("aria-busy"); });
  timer = setInterval(() => { if (!document.hidden) paint(); }, 30000);
  return () => clearInterval(timer);
}

function formatUptime(sec) {
  const s = Number(sec) || 0;
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
  return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
}
