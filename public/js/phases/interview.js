// Phase 07 — Interview. Evidence-anchored story scaffolds per interview question,
// a verification checklist and private notes (this browser only), and a timed
// practice mode. Story types with no evidence are listed, never invented.

import { ApiError } from "../core/api.js";
import { load } from "../core/store.js";
import { esc, num, local, copyText, downloadText, slug, shortSha } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { notice, toast, openEvidence, refLabel, confirmDialog } from "./shared.js";

const TYPES = {
  "change-hotspot": { label: "Change hotspot", icon: "flame", area: "file change history" },
  "quality-signal": { label: "Quality signal", icon: "quality", area: "fix signals and repeated edits" },
  "architecture-evolution": { label: "Architecture", icon: "structure", area: "co-change, refactors, dependencies, structure and complexity" },
  "database-evolution": { label: "Database", icon: "database", area: "parsed migration files" },
  "test-evolution": { label: "Testing", icon: "flask", area: "test-source changes" },
  "runtime-observability": { label: "Runtime", icon: "runtime", area: "runtime telemetry" }
};

const VERIFY = [
  ["ownership", "I personally did this work", "Ownership"],
  ["result", "The outcome is verified", "Result"],
  ["runtimeImpact", "Any runtime claim is backed by evidence", "Runtime impact"]
];

function storeKey(repoId, runId) {
  return "autopsy.interview." + repoId + "." + runId;
}

function storyMarkdown(story, saved) {
  const a = story.draftAnswer, v = story.verification;
  const s = saved[story.id] || {};
  const lines = [
    "## " + story.interviewQuestion, "",
    "**Anchor:** " + story.headline, "",
    "**Technical focus:** " + story.technicalFocus, "",
    "### Draft answer", "",
    "- **Situation:** " + a.situation,
    "- **Approach:** " + a.approach,
    "- **Evidence-backed result:** " + a.evidenceBackedResult,
    "- **Limitation:** " + a.limitation, "",
    "### Evidence", "",
    ...story.evidenceSummary.map((e) => "- " + e),
    "", "Sources: " + story.evidence.map((e) => e.source + ":" + (e.path || e.commitSha || e.key)).join("; "), "",
    "### Verification", "",
    ...VERIFY.map(([k, label]) => "- [" + (s.checks && s.checks[k] ? "x" : " ") + "] " + label + " — " + v[k])
  ];
  if (s.notes && s.notes.trim()) lines.push("", "### My verified notes", "", s.notes.trim());
  return lines.join("\n") + "\n";
}

export async function interview({ root, tools, repo, repoId, isCurrent }) {
  let stopPractice = null;
  root.innerHTML = '<div class="skel" style="height:120px;border-radius:20px"></div><div class="skel" style="height:480px;border-radius:20px;margin-top:18px"></div>';
  let result;
  try {
    const body = await load("interview");
    result = body.result;
  } catch (error) {
    if (!isCurrent()) return;
    if (error instanceof ApiError && error.code === "REPORT_NOT_READY") {
      root.innerHTML = notice({ tone: "warn", title: "Stories need a current snapshot", body: esc(error.message) + " Refresh the analysis so stories reflect the repository head.", actions: '<button class="btn sm primary" type="button" data-refresh-analysis>Refresh analysis</button>' });
      return null;
    }
    throw error;
  }
  if (!isCurrent()) return;

  const stories = result.stories || [];
  const key = storeKey(repoId, result.analysisRunId);
  const saved = local.get(key, {}) || {};
  const save = () => local.set(key, saved);
  const present = new Set(stories.map((s) => s.type));
  const missing = Object.keys(TYPES).filter((t) => !present.has(t));
  const verifiedCount = (s) => VERIFY.filter(([k]) => saved[s.id] && saved[s.id].checks && saved[s.id].checks[k]).length;
  const allMd = () => "# Interview preparation — " + repo.name + "\n\nAnalysis run " + result.analysisRunId + "\n\n" + stories.map((s) => storyMarkdown(s, saved)).join("\n---\n\n");

  tools.innerHTML = stories.length ? `
    <button class="btn sm primary" type="button" data-practice>${icon("timer")}Practice mode</button>
    <button class="btn sm" type="button" data-iv-copy>${icon("copy")}Copy all</button>
    <button class="btn sm" type="button" data-iv-dl>${icon("download")}.md</button>` : "";

  function overviewHtml() {
    const totalChecks = stories.length * VERIFY.length;
    const done = stories.reduce((m, s) => m + verifiedCount(s), 0);
    return `
      <div class="cells" style="--cols:3;margin-bottom:18px">
        <div class="cell stat"><div class="label">Stories from your evidence</div><div class="value">${num(stories.length)}<span class="dim" style="font-size:.55em;font-weight:500"> / ${Object.keys(TYPES).length}</span></div><div class="foot">${missing.length ? num(missing.length) + " areas have no evidence" : "every area has evidence"}</div></div>
        <div class="cell stat"><div class="label">Verified checkpoints</div><div class="value">${num(done)}<span class="dim" style="font-size:.55em;font-weight:500"> / ${num(totalChecks)}</span></div><div class="foot">saved in this browser only</div></div>
        <div class="cell stat"><div class="label">Snapshot</div><div class="value sm mono">${esc(String(result.analysisRunId).slice(0, 8))}</div><div class="foot">stories match this analysis run</div></div>
      </div>`;
  }

  function storyHtml(s, i) {
    const t = TYPES[s.type] || { label: s.type, icon: "interview" };
    const st = saved[s.id] || {};
    const vc = verifiedCount(s);
    return `
      <article class="card story" id="story-${esc(s.id)}" data-story="${esc(s.id)}">
        <div class="story-head">
          <div class="row wrap gap-8"><span class="pill accent">${icon(t.icon).replace("<svg", '<svg style="width:13px;height:13px"')}${esc(t.label)}</span><span class="pill mono">Q${i + 1}</span><span class="pill ${vc === VERIFY.length ? "good" : vc ? "warn" : ""}" data-vc>${vc}/${VERIFY.length} verified</span><span class="spacer"></span><button class="btn sm ghost" type="button" data-copy-story="${esc(s.id)}">${icon("copy")}Copy</button></div>
          <h3 class="q"><span class="serif">“</span>${esc(s.interviewQuestion)}<span class="serif">”</span></h3>
          <p class="headline"><b style="color:var(--ink-2);font-weight:600">Your anchor:</b> ${esc(s.headline)}</p>
        </div>
        <div class="story-tabs" role="tablist" aria-label="Story sections">
          <button role="tab" type="button" aria-selected="true" data-tab="draft">Draft answer</button>
          <button role="tab" type="button" aria-selected="false" data-tab="evidence">Evidence <span class="dim mono">${s.evidence.length}</span></button>
          <button role="tab" type="button" aria-selected="false" data-tab="verify">Verify &amp; notes${st.notes && st.notes.trim() ? " •" : ""}</button>
        </div>
        <div class="story-body" data-panel="draft" role="tabpanel">
          <div class="star">
            <div class="part"><div class="lbl">Situation</div><div class="txt">${esc(s.draftAnswer.situation)}</div></div>
            <div class="part"><div class="lbl">Approach</div><div class="txt">${esc(s.draftAnswer.approach)}</div></div>
            <div class="part"><div class="lbl">Result</div><div class="txt">${esc(s.draftAnswer.evidenceBackedResult)}</div></div>
            <div class="part limit"><div class="lbl">Limitation</div><div class="txt">${esc(s.draftAnswer.limitation)}</div></div>
            <div class="part limit"><div class="lbl">Focus on</div><div class="txt">${esc(s.technicalFocus)}</div></div>
          </div>
        </div>
        <div class="story-body" data-panel="evidence" role="tabpanel" hidden>
          <ul class="policy">${s.evidenceSummary.map((e) => `<li>${icon("check")}<span>${esc(e)}</span></li>`).join("")}</ul>
          <div class="row wrap gap-8" style="margin-top:16px">${s.evidence.map((e, j) => { const l = refLabel(e); return `<button class="ev-chip" type="button" data-iv-ref="${esc(s.id)}|${j}"><b>${esc(l.src)}</b><span>${esc(l.detail)}</span></button>`; }).join("")}</div>
          <p class="hint" style="margin-top:14px">Context: ${esc(s.context)}</p>
        </div>
        <div class="story-body" data-panel="verify" role="tabpanel" hidden>
          <div class="verify-list">
            ${VERIFY.map(([k, label]) => `<div class="verify-item"><label class="check"><input type="checkbox" data-check="${k}"${st.checks && st.checks[k] ? " checked" : ""}><span>${esc(label)}</span></label><p>${esc(s.verification[k])}</p></div>`).join("")}
          </div>
          <label class="field" style="margin-top:16px"><span>My verified notes <small>private · this browser</small></span>
            <textarea class="textarea" data-notes placeholder="What did you personally design, build or review? What was the verified outcome?" maxlength="5000">${esc(st.notes || "")}</textarea>
            <small data-saved-hint>Saved automatically.</small>
          </label>
        </div>
      </article>`;
  }

  function paint() {
    root.innerHTML = `
      ${overviewHtml()}
      ${stories.length ? `<div class="row wrap gap-8" style="margin-bottom:16px">${stories.map((s, i) => `<button class="chip" type="button" data-goto="${esc(s.id)}"><span class="mono dim">Q${i + 1}</span>${esc((TYPES[s.type] || {}).label || s.type)}</button>`).join("")}</div>` : ""}
      ${stories.length ? stories.map(storyHtml).join("") : `<div class="card">${notice({ title: "No interview stories in this snapshot", body: "None of the six story areas has evidence yet. Stories are only built when the report has real claims to anchor them.", iconName: "interview" })}</div>`}
      ${missing.length ? `<section class="card pad" style="margin-bottom:18px"><h3 style="font-size:16px">Not covered by this snapshot</h3><p class="muted" style="font-size:13.5px;margin-top:4px">These story areas are skipped because the evidence doesn't exist here — nothing is invented to fill them.</p>
        <ul class="policy" style="margin-top:14px">${missing.map((t) => `<li>${icon(TYPES[t].icon)}<span><b>${esc(TYPES[t].label)}</b> — no ${esc(TYPES[t].area)} evidence.</span></li>`).join("")}</ul></section>` : ""}
      <section class="card pad"><h3 style="font-size:16px">How to use these drafts</h3><ul class="policy" style="margin-top:14px">${(result.policy || []).map((p) => `<li>${icon("shield")}<span>${esc(p)}</span></li>`).join("")}</ul>
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn sm ghost danger" type="button" data-clear-notes>${icon("trash")}Clear my notes &amp; checks</button></div></section>`;
  }

  paint();

  const findStory = (id) => stories.find((s) => s.id === id);
  root.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      const card = tab.closest("[data-story]");
      card.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
      card.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.getAttribute("data-panel") !== tab.getAttribute("data-tab")));
      return;
    }
    const gotoBtn = event.target.closest("[data-goto]");
    if (gotoBtn) { document.getElementById("story-" + gotoBtn.getAttribute("data-goto"))?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const copyBtn = event.target.closest("[data-copy-story]");
    if (copyBtn) { const s = findStory(copyBtn.getAttribute("data-copy-story")); toast((await copyText(storyMarkdown(s, saved))) ? "Story copied" : "Clipboard is unavailable", "good"); return; }
    const ref = event.target.closest("[data-iv-ref]");
    if (ref) {
      const [sid, j] = ref.getAttribute("data-iv-ref").split("|");
      const s = findStory(sid);
      const e = s && s.evidence[Number(j)];
      if (e) openEvidence({ title: refLabel(e).src + " · " + (e.path || e.commitSha || e.key), basis: "Evidence for “" + s.interviewQuestion + "”", payload: e, note: "This is the evidence reference the report cites (source, key, commit and path), exactly as returned. The full underlying records are in the related phase." });
      return;
    }
    if (event.target.closest("[data-clear-notes]")) {
      const ok = await confirmDialog({ title: "Clear your notes and checks?", body: "This removes the notes and verification ticks saved in this browser for this snapshot. The stories themselves are not affected.", confirmLabel: "Clear" });
      if (ok) { Object.keys(saved).forEach((k) => delete saved[k]); local.remove(key); paint(); toast("Notes cleared", "good"); }
    }
  });
  root.addEventListener("change", (event) => {
    const box = event.target.closest("[data-check]");
    if (!box) return;
    const card = box.closest("[data-story]");
    const id = card.getAttribute("data-story");
    saved[id] = saved[id] || {};
    saved[id].checks = saved[id].checks || {};
    saved[id].checks[box.getAttribute("data-check")] = box.checked;
    save();
    const vc = verifiedCount(findStory(id));
    const pill = card.querySelector("[data-vc]");
    pill.textContent = vc + "/" + VERIFY.length + " verified";
    pill.className = "pill " + (vc === VERIFY.length ? "good" : vc ? "warn" : "");
  });
  let noteTimer = 0;
  root.addEventListener("input", (event) => {
    const area = event.target.closest("[data-notes]");
    if (!area) return;
    const id = area.closest("[data-story]").getAttribute("data-story");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      saved[id] = saved[id] || {};
      saved[id].notes = area.value;
      const ok = save();
      const hint = area.parentElement.querySelector("[data-saved-hint]");
      if (hint) hint.textContent = ok ? "Saved in this browser." : "Couldn't save — browser storage is unavailable.";
    }, 350);
  });

  if (stories.length) {
    tools.querySelector("[data-iv-copy]").addEventListener("click", async () => toast((await copyText(allMd())) ? "All stories copied" : "Clipboard is unavailable", "good"));
    tools.querySelector("[data-iv-dl]").addEventListener("click", () => { downloadText("autopsy-interview-" + slug(repo.name) + "-" + shortSha(result.analysisRunId) + ".md", allMd()); toast("Stories downloaded", "good"); });
    tools.querySelector("[data-practice]").addEventListener("click", () => { if (stopPractice) stopPractice(); stopPractice = practice(root, stories, saved, () => { stopPractice = null; paint(); }); });
  }
  return () => { clearTimeout(noteTimer); if (stopPractice) stopPractice(); };
}

// ---------- Practice mode ----------

function practice(root, stories, saved, restore) {
  let i = 0, seconds = 120, remaining = seconds, running = false, timer = 0, revealed = false;
  const fmt = (s) => String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0") + ":" + String(Math.max(0, s) % 60).padStart(2, "0");

  function render() {
    const s = stories[i];
    const notes = saved[s.id] && saved[s.id].notes;
    root.innerHTML = `
      <section class="card raised practice" aria-live="polite">
        <div class="row wrap gap-8" style="justify-content:center"><span class="pill mono">Question ${i + 1} of ${stories.length}</span><span class="pill accent">${esc((TYPES[s.type] || {}).label || s.type)}</span></div>
        <div class="q">${esc(s.interviewQuestion)}</div>
        <div class="timer" id="pTimer" style="color:${remaining <= 15 ? "var(--bad)" : "var(--ink)"}">${fmt(remaining)}</div>
        <div class="row wrap gap-8" style="justify-content:center">
          <button class="btn primary" type="button" data-p="toggle">${running ? icon("pause") + "Pause" : icon("play") + (remaining < seconds ? "Resume" : "Start answering")}</button>
          <button class="btn" type="button" data-p="reset">${icon("replay")}Reset</button>
          <select class="select" data-p="len" aria-label="Answer length" style="width:auto;min-height:40px;border-radius:999px;font-size:14px">${[60, 120, 180].map((n) => `<option value="${n}"${n === seconds ? " selected" : ""}>${n / 60} min</option>`).join("")}</select>
        </div>
        <button class="btn ghost" type="button" data-p="reveal">${revealed ? "Hide" : "Reveal"} draft &amp; anchor</button>
        ${revealed ? `<div class="answer-reveal card pad flat sunken">
          <p class="hint"><b>Anchor:</b> ${esc(s.headline)}</p>
          ${notes ? `<div class="eyebrow" style="margin-top:14px">My verified notes</div><p style="margin-top:6px;white-space:pre-wrap">${esc(notes)}</p>` : ""}
          <div class="eyebrow" style="margin-top:14px">Draft situation</div><p style="margin-top:6px">${esc(s.draftAnswer.situation)}</p>
          <div class="eyebrow" style="margin-top:14px">Draft result</div><p style="margin-top:6px">${esc(s.draftAnswer.evidenceBackedResult)}</p>
        </div>` : ""}
        <div class="row wrap gap-8" style="justify-content:space-between;width:100%;max-width:760px;margin-top:8px">
          <button class="btn" type="button" data-p="prev" ${i === 0 ? "disabled" : ""}>${icon("arrowLeft")}Previous</button>
          <button class="btn ghost" type="button" data-p="exit">Exit practice</button>
          <button class="btn" type="button" data-p="next" ${i === stories.length - 1 ? "disabled" : ""}>Next${icon("arrowRight")}</button>
        </div>
      </section>`;
  }
  function stop() { running = false; clearInterval(timer); }
  function go(n) { stop(); i = n; remaining = seconds; revealed = false; render(); }

  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  const onClick = (e) => {
    const b = e.target.closest("[data-p]");
    if (!b || b.tagName === "SELECT") return;
    const a = b.getAttribute("data-p");
    if (a === "toggle") {
      if (running) stop();
      else {
        running = true;
        timer = setInterval(() => {
          remaining--;
          const t = root.querySelector("#pTimer");
          if (t) { t.textContent = fmt(remaining); t.style.color = remaining <= 15 ? "var(--bad)" : "var(--ink)"; }
          if (remaining <= 0) { stop(); toast("Time's up", "warn"); render(); }
        }, 1000);
      }
      render();
    } else if (a === "reset") { stop(); remaining = seconds; render(); }
    else if (a === "reveal") { revealed = !revealed; render(); }
    else if (a === "prev") go(i - 1);
    else if (a === "next") go(i + 1);
    else if (a === "exit") { stop(); root.removeEventListener("click", onClick, true); root.removeEventListener("change", onChange, true); restore(); }
  };
  const onChange = (e) => {
    if (e.target.getAttribute("data-p") === "len") { stop(); seconds = Number(e.target.value); remaining = seconds; render(); }
  };
  root.addEventListener("click", onClick, true);
  root.addEventListener("change", onChange, true);
  return () => { stop(); root.removeEventListener("click", onClick, true); root.removeEventListener("change", onChange, true); };
}
