// Public homepage: intro, animated walkthrough cards, the 11 phases, and the evidence rules.

import { esc } from "../core/util.js";
import { href, go } from "../core/router.js";
import { getState } from "../core/store.js";
import { icon } from "../ui/icons.js";
import { demo, mountDemos } from "../ui/player.js";
import { PHASES, GROUPS, STAGES } from "../phases/meta.js";

function groupLabel(id) {
  return (GROUPS.find((g) => g.id === id) || {}).label || "";
}

export function renderHome(view) {
  const signedIn = !!getState().user;
  view.innerHTML = `
  <section class="hero">
    <div class="container hero-grid">
      <div class="hero-copy">
        <span class="hero-badge"><b>GIT · CODE · RUNTIME</b>Evidence-backed engineering history</span>
        <h1>Every repository has a story.<br><span class="serif">Read it from the evidence.</span></h1>
        <p class="lede">Project Autopsy reconstructs how a software project really evolved — from its Git history, structure, tests and runtime records — then turns it into a cited report and interview-ready stories. Nothing is guessed. Every claim points to its record.</p>
        <form class="hero-form" id="heroForm" novalidate>
          <label class="sr-only" for="heroUrl">Repository URL</label>
          <input class="input" id="heroUrl" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://github.com/owner/repository" required>
          <button class="btn primary" type="submit">Analyze repository ${icon("arrowRight")}</button>
        </form>
        <div class="hero-meta">
          <span>${icon("check")}GitHub, GitLab &amp; Bitbucket</span>
          <span>${icon("check")}Private repos with encrypted tokens</span>
          <span>${icon("check")}Every claim links to its record</span>
        </div>
      </div>
      <div class="card raised" style="padding:clamp(10px,1.4vw,16px);border-radius:var(--r-xl)">
        <div class="row" style="padding:6px 8px 12px;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div class="row gap-8"><span class="pill live accent"><span class="dot"></span>Live walkthrough</span><span class="dim" style="font-size:13px">What happens after you press Analyze</span></div>
          <span class="pill mono">${STAGES.length} stages · ${PHASES.length} phases</span>
        </div>
        ${demo("pipeline", { size: "short" })}
      </div>
    </div>
  </section>

  <section class="section band" id="how">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">How it works</span>
        <h2>Three steps from a URL<br>to answers you can <span class="serif">defend.</span></h2>
        <p>No agent to install and nothing to configure inside your repository. Each card below plays the real flow — pause it, or tap a chapter to jump.</p>
      </div>
      <div class="steps">
        <article class="card step-card">
          <div class="step-copy">
            <div class="step-num">STEP 01 — IMPORT</div>
            <h3>Point it at any repository</h3>
            <p>Paste an HTTPS URL from GitHub, GitLab or Bitbucket. Private repositories use a read-only token that is encrypted at rest and never shown again.</p>
          </div>
          ${demo("import")}
        </article>
        <article class="card step-card">
          <div class="step-copy">
            <div class="step-num">STEP 02 — READ</div>
            <h3>Get a report where every line has proof</h3>
            <p>Sections cover history, hotspots, quality signals, structure, schema, tests and runtime. Each claim cites the exact records it rests on.</p>
          </div>
          ${demo("report")}
        </article>
        <article class="card step-card wide">
          <div class="wide-inner">
            <div class="step-copy">
              <div class="step-num">STEP 03 — PREPARE</div>
              <h3>Walk into the interview with your history straight</h3>
              <p>Real interview questions are matched to signals in your project. You get an evidence-anchored draft, a checklist to verify what you personally did, private notes, and a timed practice mode.</p>
              <div class="row wrap gap-8" style="margin-top:18px">
                <span class="pill">${icon("check")}Situation · approach · result</span>
                <span class="pill">${icon("check")}Ownership checklist</span>
                <span class="pill">${icon("check")}Practice timer</span>
              </div>
            </div>
            ${demo("interview")}
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="section" id="phases">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">The workspace</span>
        <h2>Eleven phases.<br>Each answers <span class="serif">one question.</span></h2>
        <p>Move through them in order or jump straight to the one you need. Open any phase to see how it works.</p>
      </div>
      <div class="phase-grid" id="phaseGrid">
        ${PHASES.map((p) => `
          <button class="phase-tile${p.feature ? " feature" : ""}" type="button" data-phase="${p.id}" aria-expanded="false" aria-controls="phaseDetail">
            <span class="ph-num"><span>${p.n}</span><span class="ph-group">${esc(groupLabel(p.group).toUpperCase())}</span></span>
            <span class="ph-icon">${icon(p.icon)}</span>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.summary)}</p>
            <span class="ph-q">“${esc(p.question)}”</span>
          </button>`).join("")}
      </div>
    </div>
  </section>

  <section class="section band" id="outputs">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Report &amp; Interview</span>
        <h2>The two pages you'll<br><span class="serif">actually use.</span></h2>
        <p>Everything else in the workspace feeds these. Both read the same sealed snapshot, so what you prepare matches what the evidence says.</p>
      </div>
      <div class="grid g2">
        <article class="card pad">
          <div class="row gap-12"><span class="ph-icon" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-ink)">${icon("report")}</span><div><div class="eyebrow">Phase 06</div><h3 style="font-size:22px;margin-top:4px">Report</h3></div></div>
          <ul class="policy" style="margin-top:20px">
            <li>${icon("check")}<span><b>Ask the report.</b> Type a question; get back only the claims that match, quoted with their evidence. Nothing is generated.</span></li>
            <li>${icon("check")}<span><b>Coverage up front.</b> See which sections have evidence and which don't — gaps are never filled in.</span></li>
            <li>${icon("check")}<span><b>Export.</b> Copy or download Markdown, or print a clean PDF.</span></li>
            <li>${icon("check")}<span><b>Fingerprinted.</b> Each report is tied to one analysis run and target commit.</span></li>
          </ul>
        </article>
        <article class="card pad">
          <div class="row gap-12"><span class="ph-icon" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-ink)">${icon("interview")}</span><div><div class="eyebrow">Phase 07</div><h3 style="font-size:22px;margin-top:4px">Interview</h3></div></div>
          <ul class="policy" style="margin-top:20px">
            <li>${icon("check")}<span><b>Questions from your history.</b> Hotspots, quality, architecture, schema, tests and runtime each get a story when evidence exists.</span></li>
            <li>${icon("check")}<span><b>Verification first.</b> A checklist makes you confirm ownership and outcomes before you say “I”.</span></li>
            <li>${icon("check")}<span><b>Your notes stay private.</b> Notes and checks are saved in this browser only.</span></li>
            <li>${icon("check")}<span><b>Practice mode.</b> Question on screen, timer running, reveal the draft when ready.</span></li>
          </ul>
        </article>
      </div>
    </div>
  </section>

  <section class="section" id="principles">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Principles</span>
        <h2>Observation first.<br>Interpretation <span class="serif">second.</span></h2>
      </div>
      <div class="principles">
        <div class="card principle"><div class="p-icon">${icon("database")}</div><h3>Deterministic evidence</h3><p>Git history, file churn, AST metrics and parsed migrations are computed the same way every time and stored per analysis run.</p></div>
        <div class="card principle"><div class="p-icon">${icon("link")}</div><h3>Every claim is cited</h3><p>Report statements carry references to the records behind them. Open any one and see the exact persisted JSON.</p></div>
        <div class="card principle"><div class="p-icon">${icon("lock")}</div><h3>Private by default</h3><p>Account sessions in HttpOnly cookies, CSRF protection, per-account repository scoping, encrypted access tokens.</p></div>
      </div>
      <div class="boundary" style="margin-top:16px">
        <div class="yes"><h4>${icon("check")}What it shows</h4><ul>
          <li>${icon("check")}<span>What changed, when, how often, and in which files</span></li>
          <li>${icon("check")}<span>Signals worth investigating — fix clusters, coupling, complexity jumps</span></li>
          <li>${icon("check")}<span>Runtime observations, when your systems send them</span></li>
        </ul></div>
        <div class="no"><h4>${icon("x")}What it never claims</h4><ul>
          <li>${icon("x")}<span>That a commit caused a production regression</span></li>
          <li>${icon("x")}<span>Who “owned” work, or how much effort it took</span></li>
          <li>${icon("x")}<span>Test results or coverage it never observed</span></li>
        </ul></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2>Open the case file<br>on your own project.</h2>
          <p>Create an account, paste a repository URL, and watch the eleven stages run.</p>
        </div>
        <a class="btn lg" href="${signedIn ? href("projects") : href("signup")}">${signedIn ? "Open workspace" : "Create an account"} ${icon("arrowRight")}</a>
      </div>
    </div>
  </section>

  <footer class="footer"><div class="container row">
    <span class="row gap-8"><span class="brand-mark" style="width:22px;height:22px;border-radius:6px">${icon("logo")}</span>Project Autopsy</span>
    <span>Evidence-backed development history.</span>
  </div></footer>`;

  mountDemos(view);

  // Hero form → straight into the import flow (after sign-up if needed).
  view.querySelector("#heroForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = view.querySelector("#heroUrl");
    const url = input.value.trim();
    if (url && !/^https:\/\/[^\s/]+\/.+/i.test(url)) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    const target = href("projects", { url });
    go(getState().user ? target : href("signup", { next: target }));
  });

  // Phase grid: open a detail row with the phase's guide right under the clicked tile.
  const grid = view.querySelector("#phaseGrid");
  grid.addEventListener("click", (event) => {
    const tile = event.target.closest("[data-phase]");
    if (!tile) return;
    const id = tile.getAttribute("data-phase");
    const open = tile.getAttribute("aria-expanded") === "true";
    grid.querySelectorAll(".phase-detail").forEach((d) => d.remove());
    grid.querySelectorAll("[data-phase]").forEach((t) => t.setAttribute("aria-expanded", "false"));
    if (open) return;
    tile.setAttribute("aria-expanded", "true");
    const p = PHASES.find((x) => x.id === id);
    const detail = document.createElement("div");
    detail.className = "phase-detail";
    detail.id = "phaseDetail";
    detail.innerHTML = `
      <div>
        <div class="eyebrow">Phase ${p.n} · ${esc(groupLabel(p.group))}</div>
        <h3 style="margin-top:10px">${esc(p.title)}</h3>
        <p class="muted" style="margin-top:8px">${esc(p.summary)}</p>
        <ul>${p.guide.map((g) => "<li>" + esc(g) + "</li>").join("")}</ul>
        <div class="row wrap gap-8" style="margin-top:18px">${p.uses.map((u) => '<span class="pill">' + esc(u) + "</span>").join("")}</div>
      </div>
      ${demo("g-" + p.id, { label: "How " + p.title + " works" })}`;
    // Insert after the last tile in the clicked tile's visual row.
    const tiles = [...grid.querySelectorAll("[data-phase]")];
    const top = tile.offsetTop;
    let anchor = tile;
    tiles.forEach((t) => { if (t.offsetTop === top) anchor = t; });
    anchor.after(detail);
    mountDemos(detail);
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  return null;
}
