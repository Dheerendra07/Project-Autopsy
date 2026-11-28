// Phase 06 — Report. The complete evidence report for the current snapshot:
// coverage, an "at a glance" brief, every section/claim/limitation with citations,
// a deterministic question box that only returns quoted claims, and exports.

import { ApiError } from "../core/api.js";
import { load } from "../core/store.js";
import { esc, num, date, shortSha, copyText, downloadText, slug, tokens, debounce } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { notice, empty, stat, toast, openEvidence, refLabel } from "./shared.js";

// Words people use → the report vocabulary they usually mean.
const SYNONYMS = {
  bug: ["fix", "bug", "regression", "signal", "quality"], bugs: ["fix", "bug", "quality"], fix: ["fix", "bug"], fixes: ["fix", "bug"],
  error: ["error", "fix", "runtime"], errors: ["error", "fix", "runtime"], quality: ["quality", "fix", "repeated"],
  hotspot: ["hotspot", "touched", "churn"], hotspots: ["hotspot", "touched", "churn"], churn: ["churn", "touched"], busy: ["touched", "churn"], change: ["touched", "changed", "churn"], changed: ["touched", "changed"],
  file: ["touched", "path"], files: ["touched", "path"],
  test: ["test"], tests: ["test"], testing: ["test"], coverage: ["test"],
  dependency: ["dependency", "package", "added", "removed"], dependencies: ["dependency", "package"], package: ["package", "dependency"], packages: ["package", "dependency"], library: ["package", "dependency"],
  database: ["migration", "schema", "database"], schema: ["schema", "migration"], migration: ["migration"], migrations: ["migration"], sql: ["migration", "schema"],
  architecture: ["architecture", "directory", "co-changed", "refactor", "coupling", "complexity"], structure: ["directory", "architecture", "co-changed"], refactor: ["refactor"], refactoring: ["refactor"], coupling: ["co-changed", "together"], complexity: ["complexity", "cyclomatic"],
  who: ["contributor", "associated", "commits"], author: ["contributor", "associated"], authors: ["contributor", "associated"], contributor: ["contributor", "associated"], contributors: ["contributor", "associated"], team: ["contributor"], people: ["contributor"],
  runtime: ["runtime", "telemetry", "observations"], performance: ["runtime", "duration", "telemetry"], latency: ["duration", "runtime"], production: ["runtime", "deployment", "telemetry"], deploy: ["deployment"], deployment: ["deployment"], deployments: ["deployment"],
  history: ["commit", "persisted"], commits: ["commit", "commits"], recent: ["commit"], size: ["commits", "persisted"], big: ["commits", "touched"]
};

const TOPICS = [
  ["What changes most?", "hotspots churn"], ["Where do fixes cluster?", "bug fix quality"], ["Who contributed?", "contributors"],
  ["How did tests evolve?", "tests"], ["Dependencies", "dependencies"], ["Architecture", "architecture structure"],
  ["Database", "database migration"], ["Runtime", "runtime performance"]
];

const STOP = new Set(["the", "and", "what", "which", "where", "when", "how", "does", "did", "are", "was", "were", "this", "that", "with", "for", "from", "most", "has", "have", "any", "show", "tell", "about", "project", "repo", "repository", "code", "codebase", "me", "my", "is", "of", "in", "to", "a", "an", "it", "on", "do", "there", "many", "much"]);

// Question intent → the report sections that answer it. Intent outweighs incidental word
// overlap, so "which files change most?" lands on hotspots, not on contributor statements
// that merely mention "changed paths".
const INTENTS = [
  { words: ["file", "files", "hotspot", "hotspots", "churn", "change", "changes", "changed", "busy", "busiest", "touched", "edited", "modified", "active"], sections: ["change-hotspots"] },
  { words: ["bug", "bugs", "fix", "fixes", "fixed", "quality", "regression", "regressions", "error", "errors", "defect", "defects", "issue", "issues", "repeated", "unstable"], sections: ["quality-signals"] },
  { words: ["who", "author", "authors", "contributor", "contributors", "people", "team", "developer", "developers", "maintainer", "maintainers", "worked", "wrote", "person"], sections: ["contributor-evolution"] },
  { words: ["test", "tests", "testing", "spec", "specs", "assertion", "assertions", "coverage"], sections: ["test-evolution"] },
  { words: ["dependency", "dependencies", "package", "packages", "library", "libraries", "npm", "architecture", "structure", "directory", "directories", "refactor", "refactors", "refactoring", "coupling", "coupled", "together", "complexity", "complex", "cyclomatic", "design"], sections: ["evolution"] },
  { words: ["database", "schema", "migration", "migrations", "sql", "table", "tables"], sections: ["database-evolution"] },
  { words: ["runtime", "performance", "latency", "slow", "telemetry", "production", "observed", "duration", "reliability"], sections: ["runtime-observations", "historical-runtime"] },
  { words: ["deploy", "deploys", "deployed", "deploying", "deployment", "deployments", "release", "released", "releases", "shipped"], sections: ["deployment-evidence"] },
  { words: ["commit", "commits", "recent", "latest", "history", "timeline", "size", "big", "large", "old", "analyzed", "head"], sections: ["overview", "development-history"] }
];

// Words that express what is being asked, not what a matching claim would literally say.
const QUESTION_WORDS = new Set(["who", "worked", "wrote", "people", "team", "person", "busy", "busiest", "active", "history", "recent", "latest", "size", "big", "large", "old", "head", "analyzed", "cluster", "clusters", "happened", "evolve", "evolved", "grow", "grew", "look", "like"]);

// Words too common in claim text to signal relevance on their own.
const GENERIC = new Set(["change", "changes", "changed", "file", "files", "commit", "commits"]);

// Where to look for more than the report sample holds.
export const SECTION_PHASE = { "change-hotspots": "quality", "quality-signals": "quality", "contributor-evolution": "contributors", "test-evolution": "quality", evolution: "structure", "database-evolution": "quality", "runtime-observations": "runtime", "historical-runtime": "runtime", "deployment-evidence": "runtime", "development-history": "history", overview: "overview" };

export function searchReport(report, query) {
  const raw = tokens(query).filter((t) => !STOP.has(t));
  if (!raw.length) return { terms: [], raw, hits: [], emptyIntent: [] };
  const terms = new Set();
  raw.forEach((t) => { terms.add(t); (SYNONYMS[t] || []).forEach((s) => terms.add(s)); if (t.endsWith("s")) terms.add(t.slice(0, -1)); });

  const intentWeight = {};
  INTENTS.forEach((intent) => {
    const matched = raw.filter((t) => intent.words.includes(t)).length;
    if (matched) intent.sections.forEach((id) => { intentWeight[id] = (intentWeight[id] || 0) + matched; });
  });

  const hits = [];
  let order = 0;
  report.sections.forEach((section) => {
    const secText = (section.title + " " + section.evidenceBasis + " " + section.id).toLowerCase();
    section.claims.forEach((claim) => {
      const text = claim.statement.toLowerCase();
      const refs = claim.evidence.map((e) => (e.path || "") + " " + e.source).join(" ").toLowerCase();
      let score = (intentWeight[section.id] || 0) * 10;
      raw.forEach((t) => {
        if (text.includes(t)) score += GENERIC.has(t) ? 1 : 4;
        if (secText.includes(t)) score += 2;
        if (refs.includes(t)) score += 3;
      });
      terms.forEach((t) => {
        if (raw.includes(t)) return;
        if (text.includes(t)) score += 1;
      });
      if (score > 0) hits.push({ section, claim, score, order: order++ });
    });
  });
  // Ties keep the report's own order (which is already ranked by frequency/churn).
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  const emptyIntent = report.sections.filter((s) => intentWeight[s.id] && !s.claims.length).map((s) => s.title);
  const missingIntent = Object.keys(intentWeight).filter((id) => !report.sections.some((s) => s.id === id));
  const top = hits.slice(0, 8);
  // A weak match: none of the specific words asked about appear in the best claims — they
  // only share the topic. Report sections are bounded samples, so point to the full phase.
  const specific = raw.filter((t) => !GENERIC.has(t) && !QUESTION_WORDS.has(t));
  const best = top.slice(0, 3).map((h) => h.claim.statement.toLowerCase());
  const weak = top.length > 0 && specific.length > 0 && !specific.some((t) => best.some((b) => b.includes(t.replace(/s$/, ""))));
  let morePhase = "";
  if (weak) {
    const intent = INTENTS.find((i) => specific.some((t) => i.words.includes(t)));
    morePhase = SECTION_PHASE[intent ? intent.sections[0] : top[0].section.id] || "";
  }
  return { terms: [...terms], raw, hits: top, emptyIntent, missingIntent, weak, specific, morePhase };
}

function highlight(text, terms) {
  let out = esc(text);
  const sorted = [...terms].filter((t) => t.length > 2).sort((a, b) => b.length - a.length);
  if (!sorted.length) return out;
  const re = new RegExp("(" + sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return out.replace(re, "<mark>$1</mark>");
}

export function reportToMarkdown(report) {
  const r = report;
  const lines = [];
  lines.push("# Evidence report — " + r.repository.name, "");
  lines.push("- Source: " + (r.repository.sourceUrl || "—"));
  lines.push("- Branch: " + (r.repository.trackedBranch || r.repository.defaultBranch || "—"));
  lines.push("- Analysis run: " + r.analysis.runId + " (" + r.analysis.mode + ", completed " + (r.analysis.completedAt || "—") + ")");
  lines.push("- Target commit: " + (r.analysis.targetHeadSha || "—"));
  lines.push("- Persisted commits: " + r.coverage.persistedCommits);
  lines.push("- Sections with evidence: " + r.coverage.sectionsWithEvidence + " of " + r.sections.length);
  lines.push("- Generated: " + r.generatedAt + " · report v" + r.reportVersion + " · analyzer " + r.analyzerVersion);
  lines.push("- Fingerprint: " + r.fingerprint, "");
  r.sections.forEach((s) => {
    lines.push("## " + s.title, "", "_Evidence basis: " + s.evidenceBasis + "_", "");
    if (!s.claims.length) lines.push("No evidence was available for this section in this snapshot.", "");
    s.claims.forEach((c) => {
      lines.push("- " + c.statement);
      lines.push("  - Evidence: " + c.evidence.map((e) => e.source + ":" + (e.path || e.commitSha || e.key)).join("; "));
      lines.push("  - Limitation: " + c.limitation);
    });
    lines.push("", "> Section limitation: " + s.limitation, "");
  });
  lines.push("## Evidence policy", "");
  r.evidencePolicy.forEach((p) => lines.push("- " + p));
  return lines.join("\n") + "\n";
}

export async function report({ root, tools, repoId, isCurrent, go }) {
  let limit = 10;
  let data;

  async function fetchReport(force) {
    root.innerHTML = '<div class="skel" style="height:120px;border-radius:20px"></div><div class="skel" style="height:420px;border-radius:20px;margin-top:18px"></div>';
    try {
      const body = await load("report", { limit }, { force });
      data = body.report;
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      if (error instanceof ApiError && error.code === "REPORT_NOT_READY") {
        root.innerHTML = notice({ tone: "warn", title: "The report needs a current snapshot", body: esc(error.message) + " Refresh the analysis so the snapshot matches the repository head.", actions: '<button class="btn sm primary" type="button" data-refresh-analysis>Refresh analysis</button>' });
      } else {
        root.innerHTML = notice({ tone: "bad", title: "The report couldn't load", body: esc(error.message), actions: '<button class="btn sm" type="button" data-report-retry>Retry</button>' });
        root.querySelector("[data-report-retry]").addEventListener("click", () => start(true));
      }
      tools.innerHTML = "";
      return false;
    }
  }

  async function start(force = false) {
    if (!(await fetchReport(force)) || !isCurrent()) return;
    paint();
  }

  function paint() {
    const r = data;
    const totalClaims = r.sections.reduce((m, s) => m + s.claims.length, 0);
    const withEvidence = r.sections.filter((s) => s.claims.length);
    const without = r.sections.filter((s) => !s.claims.length);
    const brief = withEvidence.filter((s) => s.id !== "development-history").map((s) => ({ s, c: s.claims[0] }));

    tools.innerHTML = `
      <label class="sr-only" for="reportDetail">Items per section</label>
      <select class="select" id="reportDetail" style="min-height:36px;width:auto;font-size:13.5px;padding:6px 34px 6px 12px;border-radius:999px" title="Items per section">
        ${[10, 25, 50].map((n) => `<option value="${n}"${n === limit ? " selected" : ""}>${n} per section</option>`).join("")}
      </select>
      <button class="btn sm" type="button" data-copy-md>${icon("copy")}Copy</button>
      <button class="btn sm" type="button" data-dl-md>${icon("download")}.md</button>
      <button class="btn sm" type="button" data-print>${icon("print")}Print</button>`;

    root.innerHTML = `
      <div class="cells" style="--cols:4;margin-bottom:18px">
        ${stat("Commits in snapshot", num(r.coverage.persistedCommits), "persisted Git history")}
        ${stat("Sections with evidence", num(r.coverage.sectionsWithEvidence) + '<span class="dim" style="font-size:.55em;font-weight:500"> / ' + r.sections.length + "</span>", without.length ? num(without.length) + " without evidence" : "all sections covered")}
        ${stat("Cited claims", num(totalClaims), "up to " + num(r.coverage.reportSampleLimit) + " per section")}
        ${stat("Target commit", '<span class="mono" style="font-size:17px;letter-spacing:0">' + esc(shortSha(r.analysis.targetHeadSha)) + "</span>", "generated " + esc(date(r.generatedAt, true)), true)}
      </div>

      <section class="card ask" aria-labelledby="askTitle">
        <div class="row wrap" style="justify-content:space-between;gap:10px">
          <div><h3 id="askTitle" style="font-size:18px;letter-spacing:-.02em">Ask the report</h3><p class="muted" style="font-size:13.5px;margin-top:4px">Answers are the report's own claims, quoted with their evidence. Nothing is generated or paraphrased.</p></div>
          <span class="pill good">${icon("check").replace("<svg", '<svg style="width:12px;height:12px"')}deterministic</span>
        </div>
        <form class="ask-form" id="askForm" role="search">
          <label class="sr-only" for="askInput">Question about this project</label>
          <input class="input" id="askInput" type="search" placeholder="e.g. which files change most? who worked on tests?" autocomplete="off" spellcheck="false">
          <button class="btn primary" type="submit">${icon("search")}Find claims</button>
        </form>
        <div class="ask-topics">${TOPICS.map(([label, q]) => `<button class="chip" type="button" data-topic="${esc(q)}">${esc(label)}</button>`).join("")}</div>
        <div class="ask-results" id="askResults" aria-live="polite"></div>
      </section>

      <div class="report-layout">
        <nav class="toc" aria-label="Report sections">
          <div class="eyebrow">Sections</div>
          <a href="#" data-jump="r-brief">At a glance <span>${brief.length}</span></a>
          ${r.sections.map((s) => `<a href="#" data-jump="r-${esc(s.id)}">${esc(s.title)} <span>${s.claims.length || "—"}</span></a>`).join("")}
          <a href="#" data-jump="r-policy">Evidence policy</a>
        </nav>
        <div style="min-width:0">
          <section class="card r-section" id="r-brief">
            <div class="r-head"><div><div class="eyebrow">Summary</div><h3 style="margin-top:6px">At a glance</h3><p class="r-basis">The first claim of each section that has evidence, quoted verbatim.</p></div></div>
            <ul class="claims">${brief.map(({ s, c }) => `<li class="claim"><div class="c-meta"><span class="pill">${esc(s.title)}</span></div><div class="c-text">${esc(c.statement)}</div></li>`).join("")}</ul>
            ${without.length ? `<div class="r-limit">${icon("info").replace("<svg", '<svg style="width:15px;height:15px;flex:none;margin-top:2px"')}<span><b>No evidence in this snapshot for:</b> ${without.map((s) => esc(s.title)).join(", ")}. Absence of evidence is not evidence of absence.</span></div>` : ""}
          </section>
          ${r.sections.map((s) => sectionHtml(s)).join("")}
          <section class="card r-section" id="r-policy">
            <div class="r-head"><div><div class="eyebrow">Rules</div><h3 style="margin-top:6px">Evidence policy</h3></div></div>
            <div style="padding:18px 22px"><ul class="policy">${r.evidencePolicy.map((p) => `<li>${icon("shield")}<span>${esc(p)}</span></li>`).join("")}</ul>
            <p class="hint" style="margin-top:16px;word-break:break-all">Fingerprint <span class="mono">${esc(r.fingerprint)}</span> · report v${esc(r.reportVersion)} · analyzer ${esc(r.analyzerVersion)} · run <span class="mono">${esc(r.analysis.runId)}</span></p></div>
          </section>
        </div>
      </div>`;
    bind();
  }

  function sectionHtml(s) {
    return `<section class="card r-section" id="r-${esc(s.id)}">
      <div class="r-head"><div style="min-width:0"><h3>${esc(s.title)}</h3><p class="r-basis">Evidence basis: ${esc(s.evidenceBasis)}</p></div>
        <span class="pill ${s.claims.length ? "" : "warn"}">${s.claims.length ? s.claims.length + (s.claims.length === 1 ? " claim" : " claims") : "no evidence"}</span></div>
      ${s.claims.length ? `<ol class="claims">${s.claims.map((c) => claimHtml(s, c)).join("")}</ol>` : `<div style="padding:4px 0">${empty({ iconName: "search", title: "No evidence for this section", body: "This snapshot has no records of this kind. The report leaves the gap visible instead of filling it." })}</div>`}
      <div class="r-limit">${icon("info").replace("<svg", '<svg style="width:15px;height:15px;flex:none;margin-top:2px"')}<span><b>Limitation:</b> ${esc(s.limitation)}</span></div>
    </section>`;
  }

  function claimHtml(s, c) {
    return `<li class="claim" id="c-${esc(s.id)}-${esc(c.id)}">
      <div class="c-text">${esc(c.statement)}</div>
      <div class="c-meta">${c.evidence.map((e, i) => { const l = refLabel(e); return `<button class="ev-chip" type="button" data-ref="${esc(s.id)}|${esc(c.id)}|${i}" title="${esc(e.source + " · " + (e.path || e.commitSha || e.key))}"><b>${esc(l.src)}</b><span>${esc(l.detail)}</span></button>`; }).join("")}</div>
      <div class="c-limit">${icon("alert")}<span>${esc(c.limitation)}</span></div>
    </li>`;
  }

  function bind() {
    const askInput = root.querySelector("#askInput");
    const results = root.querySelector("#askResults");
    const ask = (q) => {
      const query = q.trim();
      if (!query) { results.innerHTML = ""; return; }
      const { hits, terms, emptyIntent, missingIntent, weak, specific, morePhase } = searchReport(data, query);
      const weakNote = weak
        ? `<div class="answer"><div class="a-text" style="font-size:14px">None of these claims mention “${esc(specific.join(" "))}” directly — they're the closest matches in this report, which samples up to ${num(data.coverage.reportSampleLimit)} items per section.</div><div class="row wrap gap-8" style="margin-top:10px">${data.coverage.reportSampleLimit < 50 ? '<button class="btn sm" type="button" data-more-detail>Show 50 per section</button>' : ""}${morePhase ? `<button class="btn sm" type="button" data-open-phase="${esc(morePhase)}">Open full ${esc(morePhase)} evidence</button>` : ""}</div></div>`
        : "";
      const gapNote = emptyIntent.length || missingIntent.length
        ? `<div class="answer" style="background:var(--warn-soft);border-color:#f1dcb4"><div class="a-text" style="font-size:14px">${emptyIntent.length ? "This snapshot has <b>no evidence</b> for: " + esc(emptyIntent.join(", ")) + ". " : ""}${missingIntent.includes("deployment-evidence") ? "No deployment records have been sent for this repository. " : ""}The report leaves that gap visible instead of guessing.</div></div>`
        : "";
      if (!hits.length) {
        results.innerHTML = gapNote || `<div class="answer"><div class="a-text">No claim in this report matches “${esc(query)}”.</div><p class="hint" style="margin-top:6px">The report only contains what the evidence supports. Try a topic below, or browse the sections.</p></div>`;
        return;
      }
      results.innerHTML = gapNote + weakNote + `<div class="hint">${hits.length} matching claim${hits.length === 1 ? "" : "s"}, best first</div>` + hits.map((h) => `
        <div class="answer">
          <div class="a-sec"><span class="pill">${esc(h.section.title)}</span><button class="link-btn" type="button" data-jump="c-${esc(h.section.id)}-${esc(h.claim.id)}" style="font-size:12.5px">Open in report</button></div>
          <div class="a-text">${highlight(h.claim.statement, terms)}</div>
          <div class="c-meta" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${h.claim.evidence.map((e, i) => { const l = refLabel(e); return `<button class="ev-chip" type="button" data-ref="${esc(h.section.id)}|${esc(h.claim.id)}|${i}"><b>${esc(l.src)}</b><span>${esc(l.detail)}</span></button>`; }).join("")}</div>
          <div class="c-limit" style="margin-top:8px;font-size:12.5px;color:var(--ink-3);display:flex;gap:8px">${icon("alert").replace("<svg", '<svg style="width:14px;height:14px;flex:none;margin-top:2px;color:var(--warn)"')}<span>${esc(h.claim.limitation)}</span></div>
        </div>`).join("");
    };
    root.querySelector("#askForm").addEventListener("submit", (e) => { e.preventDefault(); ask(askInput.value); });
    askInput.addEventListener("input", debounce(() => ask(askInput.value), 250));
    root.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => { askInput.value = b.textContent; ask(b.getAttribute("data-topic")); }));

    tools.querySelector("#reportDetail").addEventListener("change", async (e) => { limit = Number(e.target.value); await start(); });
    tools.querySelector("[data-copy-md]").addEventListener("click", async () => toast((await copyText(reportToMarkdown(data))) ? "Report copied as Markdown" : "Clipboard is unavailable", "good"));
    tools.querySelector("[data-dl-md]").addEventListener("click", () => { downloadText("autopsy-report-" + slug(data.repository.name) + "-" + shortSha(data.analysis.targetHeadSha) + ".md", reportToMarkdown(data)); toast("Report downloaded", "good"); });
    tools.querySelector("[data-print]").addEventListener("click", () => window.print());

    // Highlight the TOC entry for the section in view.
    const links = [...root.querySelectorAll(".toc a[data-jump]")];
    if ("IntersectionObserver" in window && links.length) {
      cleanupFns.splice(0).forEach((fn) => fn());
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          links.forEach((a) => a.classList.toggle("active", a.getAttribute("data-jump") === en.target.id));
        });
      }, { rootMargin: "-20% 0px -70% 0px" });
      root.querySelectorAll(".r-section").forEach((s) => io.observe(s));
      cleanupFns.push(() => io.disconnect());
    }
  }

  // Delegated once for the lifetime of the phase (paint() may run several times).
  function onRootClick(event) {
    if (!data) return;
    const phaseBtn = event.target.closest("[data-open-phase]");
    if (phaseBtn) { go(phaseBtn.getAttribute("data-open-phase")); return; }
    if (event.target.closest("[data-more-detail]")) {
      const pending = root.querySelector("#askInput").value;
      limit = 50;
      start().then(() => {
        const input = root.querySelector("#askInput");
        if (input && pending) { input.value = pending; root.querySelector("#askForm").requestSubmit(); }
      });
      return;
    }
    {
      const jump = event.target.closest("[data-jump]");
      if (jump) {
        event.preventDefault();
        const el = document.getElementById(jump.getAttribute("data-jump"));
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.style.transition = "background .6s";
          el.style.background = "var(--accent-soft)";
          setTimeout(() => (el.style.background = ""), 1200);
        }
        return;
      }
      const chip = event.target.closest("[data-ref]");
      if (chip) {
        const [sid, cid, idx] = chip.getAttribute("data-ref").split("|");
        const section = data.sections.find((s) => s.id === sid);
        const claim = section && section.claims.find((c) => c.id === cid);
        const ref = claim && claim.evidence[Number(idx)];
        if (ref) openEvidence({ title: refLabel(ref).src + " · " + (ref.path || ref.commitSha || ref.key), basis: "Cited by “" + claim.statement + "”", payload: { ...ref, citedBy: { section: section.title, claimId: claim.id, statement: claim.statement, limitation: claim.limitation } }, note: "This is the evidence reference the report cites (source, key, commit and path), exactly as returned. The full underlying records are in the related phase." });
      }
    }
  }

  const cleanupFns = [];
  root.addEventListener("click", onRootClick);
  await start();
  return () => {
    root.removeEventListener("click", onRootClick);
    cleanupFns.forEach((fn) => fn());
  };
}
