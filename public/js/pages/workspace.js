// Workspace shell: phase navigation (desktop sidebar + mobile phase bar), the
// animated guide rail, live analysis tracking, and repository settings.

import { api, ApiError } from "../core/api.js";
import {
  getState, openRepository, refreshRuns, refreshRepo, snapshotStatus, invalidate, clearRepo, loadRepositories
} from "../core/store.js";
import { href, go } from "../core/router.js";
import { esc, relative, shortSha, initials, repoLabel, duration, safeExternalUrl, num, local } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { toast, notice, empty, popover, closePopover, confirmDialog, modal, bindEvidence } from "../ui/components.js";
import { demo, mountDemos, demoController } from "../ui/player.js";
import { PHASES, GROUPS, phase as phaseMeta, neighbours, PHASE_IDS, STAGES, stageIndex } from "../phases/meta.js";
import { PHASE_RENDERERS } from "../phases/index.js";

let ctx = null; // live workspace context

export function leaveWorkspace() {
  if (ctx) {
    clearInterval(ctx.pollTimer);
    ctx.alive = false;
    ctx = null;
  }
}

export async function renderWorkspace(view, route) {
  leaveWorkspace();
  const repoId = route.repoId;
  view.innerHTML = '<div class="container" style="padding:48px 0"><div class="skel" style="height:44px;width:280px"></div><div class="skel" style="height:220px;margin-top:20px"></div></div>';
  try {
    await openRepository(repoId, { force: true });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      view.innerHTML = '<div class="container" style="padding:64px 0"><div class="card pad" style="max-width:560px;margin:0 auto">' +
        empty({ iconName: "folder", title: "Repository not found", body: "It may have been deleted, or it belongs to another account.", action: '<a class="btn primary" href="' + href("projects") + '">Back to projects</a>' }) + "</div></div>";
      return null;
    }
    throw error;
  }

  local.set("autopsy.lastRepo", repoId);
  ctx = { repoId, phase: PHASE_IDS.includes(route.phase) ? route.phase : "overview", view, alive: true, pollTimer: 0, maxStage: -1, cleanupPhase: null };
  const handle = {
    repoId,
    update: async (r) => {
      if (!ctx) return;
      const next = PHASE_IDS.includes(r.phase) ? r.phase : "overview";
      if (next === ctx.phase) return;
      ctx.phase = next;
      paintNav();
      paintGuide();
      await paintPhase({ scroll: true });
    },
    cleanup: () => leaveWorkspace()
  };

  buildShell(view);
  paintNav();
  paintGuide();
  await paintPhase();
  startPollingIfNeeded();
  return handle;
}

// ---------- Shell ----------

function buildShell(view) {
  view.innerHTML = `
    <div class="mobile-phases" id="mobilePhases"></div>
    <div class="app with-guide">
      <nav class="sidebar" id="sidebar" aria-label="Workspace phases"></nav>
      <div class="main"><div class="main-inner">
        <div id="wsStatus"></div>
        <details class="card guide-inline" id="guideInline"><summary>${icon("play")}<span id="guideInlineTitle">How this phase works</span>${icon("chevronDown", "chev")}</summary><div id="guideInlineBody"></div></details>
        <div id="phaseRoot"></div>
        <nav class="pager" id="pager" aria-label="Phase navigation"></nav>
      </div></div>
      <aside class="guide-rail" id="guideRail" aria-label="How this phase works"></aside>
    </div>`;
  bindEvidence(view);

  view.addEventListener("click", (event) => {
    if (event.target.closest("[data-repo-menu]")) return openRepoMenu(event.target.closest("[data-repo-menu]"));
    if (event.target.closest("[data-refresh-analysis]")) return startRefresh(event.target.closest("[data-refresh-analysis]"));
    if (event.target.closest("[data-repo-settings]")) return openSettings();
  });
}

function paintNav() {
  const s = getState();
  const repo = s.repo;
  const sidebar = ctx.view.querySelector("#sidebar");
  const groups = GROUPS.map((g) => {
    const items = PHASES.filter((p) => p.group === g.id).map((p) =>
      `<a class="phase-link" href="${href("workspace", { repoId: ctx.repoId, phase: p.id })}"${p.id === ctx.phase ? ' aria-current="page"' : ""}><span class="n">${p.n}</span>${icon(p.icon, "ico")}<span>${esc(p.title)}</span></a>`).join("");
    return `<div class="grp">${esc(g.label)}</div>${items}`;
  }).join("");
  sidebar.innerHTML = `
    <button class="repo-switch" type="button" data-repo-menu aria-haspopup="menu" aria-expanded="false">
      <span class="repo-avatar">${esc(initials(repo.name))}</span>
      <span class="meta"><span class="name truncate" style="display:block">${esc(repo.name)}</span><span class="branch truncate" style="display:block">${esc(repo.tracked_branch || repo.default_branch || "default branch")}</span></span>
      ${icon("chevronDown").replace("<svg", '<svg style="width:16px;height:16px;color:var(--muted);flex:none"')}
    </button>
    <div class="phase-nav">${groups}</div>
    <div class="side-foot">
      <a class="phase-link" href="${href("projects")}">${icon("folder", "ico")}<span>All projects</span></a>
      <button class="phase-link" type="button" data-repo-settings style="border:0;background:none;width:100%;text-align:left">${icon("key", "ico")}<span>Repository settings</span></button>
    </div>`;

  const mobile = ctx.view.querySelector("#mobilePhases");
  mobile.innerHTML = `
    <div class="mp-top">
      <button class="repo-switch" type="button" data-repo-menu aria-haspopup="menu" aria-expanded="false" style="padding:6px 10px;box-shadow:none;width:auto;max-width:100%">
        <span class="repo-avatar" style="width:26px;height:26px;border-radius:8px;font-size:11px">${esc(initials(repo.name))}</span>
        <span class="repo-name truncate">${esc(repo.name)}</span>
        ${icon("chevronDown").replace("<svg", '<svg style="width:14px;height:14px;color:var(--muted);flex:none"')}
      </button>
      <span class="spacer"></span>
      <span id="mobileSnap"></span>
    </div>
    <div class="mp-scroll" role="tablist" aria-label="Workspace phases">
      ${PHASES.map((p) => `<a class="mp-chip" role="tab" href="${href("workspace", { repoId: ctx.repoId, phase: p.id })}"${p.id === ctx.phase ? ' aria-current="page" aria-selected="true"' : ' aria-selected="false"'}><span class="n">${p.n}</span>${esc(p.title)}</a>`).join("")}
    </div>`;
  const active = mobile.querySelector('[aria-current="page"]');
  if (active) {
    const scroller = mobile.querySelector(".mp-scroll");
    scroller.scrollLeft = Math.max(0, active.offsetLeft - scroller.clientWidth / 2 + active.clientWidth / 2);
  }

  const { prev, next } = neighbours(ctx.phase);
  ctx.view.querySelector("#pager").innerHTML =
    (prev ? `<a class="prev" href="${href("workspace", { repoId: ctx.repoId, phase: prev.id })}"><span class="eyebrow">← Previous · ${prev.n}</span><b>${esc(prev.title)}</b></a>` : "<span></span>") +
    (next ? `<a class="next" href="${href("workspace", { repoId: ctx.repoId, phase: next.id })}"><span class="eyebrow">Next · ${next.n} →</span><b>${esc(next.title)}</b></a>` : "");

  document.title = phaseMeta(ctx.phase).title + " · " + repo.name + " — Project Autopsy";
  paintStatus();
}

function guideCard(p) {
  return `
    <div class="g-head"><h4>How ${esc(p.title)} works</h4><span class="pill mono">${p.n} / 11</span></div>
    ${demo("g-" + p.id, { compact: true, label: "How " + p.title + " works" })}
    <ol class="g-steps">${p.guide.map((g, i) => `<li data-guide-step="${i + 1}">${esc(g)}</li>`).join("")}</ol>
    <div class="g-foot">${esc(p.question)}</div>`;
}

function paintGuide() {
  const p = phaseMeta(ctx.phase);
  const rail = ctx.view.querySelector("#guideRail");
  rail.innerHTML = `<div class="card guide-card">${guideCard(p)}</div>`;
  const inline = ctx.view.querySelector("#guideInline");
  ctx.view.querySelector("#guideInlineTitle").textContent = "How " + p.title + " works";
  const inlineBody = ctx.view.querySelector("#guideInlineBody");
  inlineBody.innerHTML = '<div class="guide-card">' + guideCard(p) + "</div>";
  // Desktop rail visible → inline stays collapsed; on smaller screens, open it the first time.
  [rail, inlineBody].forEach((root) => {
    mountDemos(root);
    const player = demoController(root.querySelector("[data-demo]"));
    if (!player) return;
    const steps = [...root.querySelectorAll("[data-guide-step]")];
    player.onStep((s) => steps.forEach((li) => li.classList.toggle("active", Number(li.dataset.guideStep) === s)));
    steps.forEach((li) => li.addEventListener("click", () => player.seek(Number(li.dataset.guideStep))));
  });
  inline.open = false;
}

function snapshotPill() {
  const snap = snapshotStatus();
  return `<span class="pill ${snap.tone}${snap.running ? " live" : ""}"><span class="dot"></span>${esc(snap.label)}</span>`;
}

function paintStatus() {
  const s = getState();
  const repo = s.repo;
  const done = s.latestCompleted;
  const snap = snapshotStatus();
  const mobileSnap = ctx.view.querySelector("#mobileSnap");
  if (mobileSnap) mobileSnap.innerHTML = snapshotPill();
  const source = safeExternalUrl(repo.source_url);
  const host = ctx.view.querySelector("#wsStatus");
  host.innerHTML = `
    <div class="snapshot-bar">
      ${snapshotPill()}
      ${source ? `<a class="kv" href="${esc(source)}" target="_blank" rel="noopener noreferrer">${icon("git").replace("<svg", '<svg style="width:13px;height:13px;align-self:center"')}<b>${esc(repoLabel(repo.source_url, repo.name))}</b></a>` : ""}
      ${repo.head_sha ? `<span class="kv">head <b>${esc(shortSha(repo.head_sha))}</b></span>` : ""}
      ${done ? `<span class="kv">analyzed <b>${esc(relative(done.completedAt))}</b></span><span class="kv">run <b>${esc(String(done.id).slice(0, 8))}</b></span>` : ""}
      <span class="spacer"></span>
      <button class="btn sm" type="button" data-refresh-analysis ${snap.running ? "disabled" : ""}>${icon("refresh")}${snap.running ? "Analysis running" : "Refresh analysis"}</button>
    </div>
    ${statusNotice(snap)}`;
}

function statusNotice(snap) {
  const s = getState();
  if (snap.running) {
    // Overview, and any phase without an earlier snapshot, render the full pipeline instead.
    if (ctx.phase === "overview" || !s.latestCompleted) return "";
    return notice({ tone: "", title: "Analysis in progress", body: "Showing the previous snapshot where available. This page refreshes automatically when the new snapshot is sealed.", actions: `<a class="btn sm" href="${href("workspace", { repoId: ctx.repoId, phase: "overview" })}">Watch progress</a>`, iconName: "timer" });
  }
  const latest = s.runs && s.runs[0];
  if (snap.failed || snap.failedRefresh) {
    return notice({ tone: snap.failed ? "bad" : "warn", title: snap.failed ? "The analysis failed" : "The latest refresh failed", body: esc((latest && latest.errorMessage) || "The worker reported a failure.") + (snap.failedRefresh ? " The previous snapshot is still shown." : ""), actions: '<button class="btn sm" type="button" data-refresh-analysis>Try again</button>' });
  }
  if (s.latestCompleted && !snap.current) {
    return notice({ tone: "warn", title: "This snapshot is older than the repository head", body: "Report, Interview and Insights need a snapshot of the current head. Refresh the analysis to bring them up to date.", actions: '<button class="btn sm" type="button" data-refresh-analysis>Refresh analysis</button>' });
  }
  return "";
}

// ---------- Phase rendering ----------

async function paintPhase({ scroll = false } = {}) {
  const root = ctx.view.querySelector("#phaseRoot");
  if (ctx.cleanupPhase) { try { ctx.cleanupPhase(); } catch { /* ignore */ } ctx.cleanupPhase = null; }
  paintStatus();
  const p = phaseMeta(ctx.phase);
  const s = getState();
  if (scroll) window.scrollTo({ top: 0 });
  const header = `
    <header class="page-head">
      <div class="t"><div class="num">PHASE ${p.n} · ${esc((GROUPS.find((g) => g.id === p.group) || {}).label || "").toUpperCase()}</div><h1>${esc(p.title)}</h1><p>${esc(p.summary)}</p></div>
      <div class="tools" id="phaseTools"></div>
    </header>`;
  const needsSnapshot = !["operations"].includes(p.id);
  if (needsSnapshot && !s.latestCompleted) {
    root.innerHTML = header + (s.activeRun ? pipelineCard() : noSnapshotCard());
    if (s.activeRun) paintPipeline();
    return;
  }
  root.innerHTML = header + (p.id === "overview" && s.activeRun ? pipelineCard() : "") + '<div id="phaseBody"></div>';
  if (p.id === "overview" && s.activeRun) paintPipeline();
  const body = root.querySelector("#phaseBody");
  const renderer = PHASE_RENDERERS[p.id];
  const token = (ctx.renderToken = (ctx.renderToken || 0) + 1);
  try {
    const cleanup = await renderer({
      root: body,
      tools: root.querySelector("#phaseTools"),
      repo: s.repo,
      repoId: ctx.repoId,
      isCurrent: () => ctx && ctx.alive && ctx.renderToken === token,
      go: (phaseId) => go(href("workspace", { repoId: ctx.repoId, phase: phaseId }))
    });
    if (ctx && ctx.renderToken === token) ctx.cleanupPhase = cleanup || null;
    else if (typeof cleanup === "function") cleanup();
  } catch (error) {
    if (!ctx || ctx.renderToken !== token) return;
    console.error(error);
    body.innerHTML = notice({ tone: "bad", title: "This phase couldn't load", body: esc(error.message || "Unexpected error."), actions: '<button class="btn sm" type="button" data-phase-retry>Retry</button>' });
    body.querySelector("[data-phase-retry]").addEventListener("click", () => paintPhase());
  }
}

function noSnapshotCard() {
  const s = getState();
  const latest = s.runs && s.runs[0];
  if (latest && latest.status === "failed") {
    return '<div class="card">' + empty({ iconName: "alert", title: "No snapshot yet — the analysis failed", body: esc(latest.errorMessage || "The worker reported a failure.") + "<br>Check the URL, branch and access token, then try again.", action: '<button class="btn primary" type="button" data-refresh-analysis>Run analysis again</button> <button class="btn" type="button" data-repo-settings>Repository settings</button>' }) + "</div>";
  }
  return '<div class="card">' + empty({ iconName: "timer", title: "No snapshot yet", body: "Start an analysis to build this repository's evidence.", action: '<button class="btn primary" type="button" data-refresh-analysis>Start analysis</button>' }) + "</div>";
}

// ---------- Live pipeline ----------

function pipelineCard() {
  return `
    <section class="card raised pipeline" id="pipeline" aria-live="polite" style="margin-bottom:22px">
      <div class="pipeline-head">
        <div><div class="eyebrow" id="plMode">Analysis run</div><h2 style="margin-top:8px" id="plTitle">Analysis queued</h2><p class="muted" style="margin-top:6px;font-size:14px" id="plSub">Waiting for the analysis worker…</p></div>
        <div class="row gap-8"><span class="pill live accent" id="plStatus"><span class="dot"></span>queued</span><span class="pill mono" id="plElapsed">0s</span></div>
      </div>
      <div class="pipeline-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${STAGES.length}" aria-valuenow="0" id="plBar"><i style="width:2%"></i></div>
      <ol class="stage-list" id="plStages">
        ${STAGES.map((st, i) => `<li class="stage" data-stage="${i}"><span class="s-ico">${String(i + 1).padStart(2, "0")}</span><span class="s-name">${esc(st.label)}<span class="s-desc">${esc(st.desc)}</span></span><span class="s-meta"></span></li>`).join("")}
      </ol>
    </section>`;
}

function paintPipeline() {
  const s = getState();
  const run = s.activeRun || ctx.lastRun;
  const el = ctx.view.querySelector("#pipeline");
  if (!el || !run) return;
  const progress = run.progress || null;
  const idx = progress ? stageIndex(progress.stage) : -1;
  if (idx > ctx.maxStage) ctx.maxStage = idx;
  if (run.status === "running" && ctx.maxStage < 0) ctx.maxStage = 0;
  const current = run.status === "completed" ? STAGES.length : ctx.maxStage;
  el.querySelector("#plMode").textContent = (run.mode === "full" ? "Full analysis" : run.mode === "incremental" ? "Incremental analysis" : "Refresh check") + " · run " + String(run.id).slice(0, 8);
  el.querySelector("#plTitle").textContent = run.status === "queued" ? "Analysis queued" : run.status === "running" ? "Analysis running" : run.status === "completed" ? "Snapshot sealed" : "Analysis failed";
  let sub = "Waiting for the analysis worker…";
  if (progress && progress.stage) {
    sub = progress.stage;
    if (Number.isFinite(Number(progress.completed)) && Number(progress.total) > 0) {
      sub += progress.stage === "Reading commit history" ? " · " + num(progress.completed) + " of " + num(progress.total) + " commits" : " · step " + progress.completed + " of " + progress.total;
    }
  } else if (run.progressUnavailable) sub = "Detailed progress is temporarily unavailable.";
  else if (run.status === "running") sub = "Working…";
  if (run.status === "failed") sub = run.errorMessage || "The worker reported a failure.";
  el.querySelector("#plSub").textContent = sub;
  const status = el.querySelector("#plStatus");
  status.className = "pill " + (run.status === "failed" ? "bad" : run.status === "completed" ? "good" : "accent live");
  status.innerHTML = '<span class="dot"></span>' + esc(run.status);
  el.querySelector("#plElapsed").textContent = duration(run.startedAt, run.completedAt);
  const pctDone = Math.max(2, Math.round((Math.max(0, current) / STAGES.length) * 100));
  el.querySelector("#plBar i").style.width = (run.status === "completed" ? 100 : pctDone) + "%";
  el.querySelector("#plBar").setAttribute("aria-valuenow", String(Math.max(0, current)));
  el.querySelectorAll("[data-stage]").forEach((li) => {
    const i = Number(li.dataset.stage);
    const done = i < current;
    const isCurrent = i === current && run.status !== "completed" && run.status !== "failed";
    const failed = run.status === "failed" && i === current;
    li.className = "stage" + (done ? " done" : "") + (isCurrent ? " current" : "") + (failed ? " failed" : "");
    li.querySelector(".s-ico").innerHTML = done ? icon("check") : failed ? icon("x") : String(i + 1).padStart(2, "0");
    const meta = li.querySelector(".s-meta");
    meta.textContent = isCurrent && progress && Number(progress.total) > 0 ? Math.round((Number(progress.completed) / Number(progress.total)) * 100) + "%" : done ? "done" : "";
  });
}

function startPollingIfNeeded() {
  const s = getState();
  if (!ctx || !s.activeRun || ctx.pollTimer) return;
  const repoId = ctx.repoId;
  let failures = 0;
  const tick = async () => {
    if (!ctx || !ctx.alive || ctx.repoId !== repoId) return;
    const st = getState();
    const run = st.activeRun;
    if (!run) return stopPolling();
    try {
      const body = await api("/api/repositories/" + encodeURIComponent(repoId) + "/analysis/" + encodeURIComponent(run.id));
      if (!ctx || ctx.repoId !== repoId) return;
      failures = 0;
      Object.assign(run, body.analysis);
      ctx.lastRun = run;
      paintPipeline();
      if (run.status === "completed" || run.status === "failed") {
        stopPolling();
        await Promise.all([refreshRepo(), refreshRuns()]);
        invalidate();
        ctx.maxStage = -1;
        if (run.status === "completed") toast("Analysis complete — snapshot sealed", "good");
        else toast("Analysis failed: " + (run.errorMessage || "see details"), "bad");
        paintNav();
        await paintPhase();
      }
    } catch (error) {
      failures++;
      if (error instanceof ApiError && error.status === 404) {
        stopPolling();
        await refreshRuns().catch(() => {});
        await paintPhase();
        return;
      }
      if (failures === 3) toast("Connection is unstable — still checking analysis status…", "warn");
    }
  };
  ctx.pollTimer = setInterval(tick, 2000);
  tick();
}

function stopPolling() {
  if (ctx && ctx.pollTimer) { clearInterval(ctx.pollTimer); ctx.pollTimer = 0; }
}

async function startRefresh(button) {
  if (!ctx) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const body = await api("/api/repositories/" + encodeURIComponent(ctx.repoId) + "/analyze", { method: "POST" });
    toast("Analysis queued", "good");
    await adoptRun(body.analysis.id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "ANALYSIS_ALREADY_RUNNING") {
      toast("An analysis is already running — showing its progress.", "warn");
      await adoptRun(error.details && error.details.analysisRunId);
    } else if (error instanceof ApiError && error.code === "REPOSITORY_REANALYSIS_UNAVAILABLE") {
      toast("This repository can't be refreshed from its stored metadata. Import it again from Projects.", "bad");
    } else {
      toast(error.message, "bad");
    }
  } finally {
    if (button.isConnected) { button.disabled = false; button.removeAttribute("aria-busy"); }
  }
}

async function adoptRun() {
  await refreshRuns();
  ctx.maxStage = -1;
  if (ctx.phase !== "overview") go(href("workspace", { repoId: ctx.repoId, phase: "overview" }));
  else await paintPhase();
  startPollingIfNeeded();
}

// ---------- Repository menu & settings ----------

async function openRepoMenu(anchor) {
  let repos = getState().repositories;
  if (!repos) { try { repos = await loadRepositories(); } catch { repos = []; } }
  const others = (repos || []).filter((r) => r.id !== ctx.repoId).slice(0, 8);
  popover(anchor,
    '<div class="ph"><div class="eyebrow">Switch repository</div></div>' +
    (others.length ? others.map((r) => `<a class="pi" href="${href("workspace", { repoId: r.id, phase: ctx.phase })}"><span class="repo-avatar" style="width:26px;height:26px;border-radius:8px;font-size:11px">${esc(initials(r.name))}</span><span style="min-width:0"><span class="truncate" style="display:block">${esc(r.name)}</span><span class="sub truncate">${esc(repoLabel(r.sourceUrl, r.name))}</span></span></a>`).join("") : '<div class="ph dim" style="font-size:13px;padding-bottom:8px">No other repositories yet.</div>') +
    "<hr>" +
    `<a class="pi" href="${href("projects")}">${icon("plus")}New analysis</a>` +
    `<a class="pi" href="${href("projects")}">${icon("folder")}All projects</a>` +
    `<button class="pi" type="button" data-pop-settings>${icon("key")}Repository settings</button>`,
    {
      onMount(el) {
        el.setAttribute("role", "menu");
        el.addEventListener("click", (e) => {
          if (e.target.closest("[data-pop-settings]")) { closePopover(); openSettings(); }
          else if (e.target.closest("a")) closePopover();
        });
      }
    });
}

function openSettings() {
  const repo = getState().repo;
  modal(`
    <h3 id="settingsTitle">Repository settings</h3>
    <p>${esc(repo.name)} · <span class="mono" style="font-size:12.5px">${esc(repoLabel(repo.source_url, repo.name))}</span></p>
    <div class="divider"></div>
    <div class="field-label">Private access token</div>
    <p class="hint" style="margin-top:4px">Status: <b id="tokStatus">${repo.accessConfigured ? "configured" : "not configured"}</b>. Tokens are write-only — the current one is never shown.</p>
    <form id="tokForm" class="stack gap-8" style="margin-top:10px" novalidate>
      <div class="input-wrap"><input class="input mono" id="tokInput" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="New read-only token" aria-label="New access token"></div>
      <div class="row wrap gap-8"><button class="btn primary sm" type="submit">${repo.accessConfigured ? "Rotate token" : "Save token"}</button>${repo.accessConfigured ? '<button class="btn sm danger" type="button" id="tokRemove">Remove token</button>' : ""}</div>
    </form>
    <div class="divider"></div>
    <div class="field-label">Delete repository</div>
    <p class="hint" style="margin-top:4px">Removes the clone, every analysis run and all evidence for this repository. This cannot be undone.</p>
    <div class="m-actions" style="justify-content:space-between;margin-top:14px"><button class="btn danger" type="button" id="delRepo">${icon("trash")}Delete repository</button><button class="btn" type="button" data-x="close">Close</button></div>`,
    {
      labelledBy: "settingsTitle",
      onMount(panel, close) {
        panel.querySelector('[data-x="close"]').addEventListener("click", () => close());
        panel.querySelector("#tokForm").addEventListener("submit", async (e) => {
          e.preventDefault();
          const value = panel.querySelector("#tokInput").value.trim();
          if (!value) { toast("Paste a token first.", "warn"); return; }
          try {
            await api("/api/repositories/" + encodeURIComponent(repo.id) + "/access", { method: "PUT", body: { accessToken: value } });
            repo.accessConfigured = true;
            toast("Access token saved. It's used on the next analysis.", "good");
            close();
          } catch (error) {
            toast(error.code === "REPOSITORY_ACCESS_NOT_CONFIGURED" ? "Token storage isn't enabled on this server (encryption key missing)." : error.message, "bad");
          }
        });
        const rm = panel.querySelector("#tokRemove");
        if (rm) rm.addEventListener("click", async () => {
          try {
            await api("/api/repositories/" + encodeURIComponent(repo.id) + "/access", { method: "DELETE" });
            repo.accessConfigured = false;
            toast("Access token removed", "good");
            close();
          } catch (error) { toast(error.message, "bad"); }
        });
        panel.querySelector("#delRepo").addEventListener("click", async () => {
          close();
          const ok = await confirmDialog({ title: "Delete " + repo.name + "?", body: "Every analysis run and all evidence for this repository will be permanently removed. This cannot be undone.", confirmLabel: "Delete permanently", requireText: repo.name });
          if (!ok) return;
          try {
            await api("/api/repositories/" + encodeURIComponent(repo.id), { method: "DELETE" });
            getState().repositories = null;
            clearRepo();
            toast(repo.name + " deleted", "good");
            go(href("projects"));
          } catch (error) {
            toast(error.code === "REPOSITORY_DELETE_BLOCKED" ? "Can't delete while an analysis is running. Wait for it to finish." : error.message, "bad");
          }
        });
      }
    });
}

