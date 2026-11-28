// Phase 08 — Insights. Optional AI interpretation generated on demand from the current
// report. Every theme/question cites report claims by key; those keys resolve to the
// exact claim text here so the reader can verify each statement.

import { ApiError } from "../core/api.js";
import { load, cached } from "../core/store.js";
import { esc, date, shortSha } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { notice, empty, toast, openEvidence } from "./shared.js";

export async function insights({ root, tools, repoId, isCurrent, go }) {
  let report = null;

  function claimFor(key) {
    if (!report) return null;
    const [sid, cid] = String(key).split("/");
    const section = report.sections.find((s) => s.id === sid);
    const claim = section && section.claims.find((c) => c.id === cid);
    return claim ? { section, claim } : null;
  }

  function keyChips(keys) {
    return (keys || []).map((k) => {
      const hit = claimFor(k);
      return `<button class="ev-chip" type="button" data-ikey="${esc(k)}" title="${esc(hit ? hit.claim.statement : k)}"><b>${esc(hit ? hit.section.title : "claim")}</b><span>${esc(k)}</span></button>`;
    }).join("");
  }

  function intro(extra = "") {
    return `
      <section class="card pad" style="margin-bottom:18px">
        <div class="row wrap" style="justify-content:space-between;gap:14px;align-items:flex-start">
          <div style="max-width:640px"><h3 style="font-size:18px;letter-spacing:-.02em">Generate a grounded reading of the report</h3>
          <p class="muted" style="font-size:14px;margin-top:6px">A language model reads only the current report's claims and must cite them by key. Output that cites anything else is rejected by the server. The Report remains the source of truth.</p></div>
          <button class="btn primary" type="button" data-generate>${icon("sparkle")}Generate insights</button>
        </div>${extra}
      </section>`;
  }

  async function generate(button) {
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); button.lastChild.textContent = "Generating…"; }
    try {
      const [ri, ii] = await Promise.all([load("report", { limit: 10 }), load("interpretation")]);
      report = ri.report;
      if (!isCurrent()) return;
      paint(ii.result);
    } catch (error) {
      if (!isCurrent()) return;
      const code = error instanceof ApiError ? error.code : "";
      let html;
      if (code === "AI_INTERPRETATION_NOT_CONFIGURED") {
        html = notice({ title: "AI insights aren't enabled on this server", body: "The operator hasn't configured an AI provider key, so no interpretation can be generated. Everything Insights would draw on is already in the Report, with citations.", actions: '<button class="btn sm primary" type="button" data-go-report>Open Report</button>', iconName: "sparkle" });
      } else if (code === "REPORT_NOT_READY") {
        html = notice({ tone: "warn", title: "Insights need a current snapshot", body: esc(error.message), actions: '<button class="btn sm primary" type="button" data-refresh-analysis>Refresh analysis</button>' });
      } else if (code === "AI_INTERPRETATION_PROVIDER_ERROR" || code === "AI_INTERPRETATION_INVALID_OUTPUT") {
        html = notice({ tone: "bad", title: code === "AI_INTERPRETATION_INVALID_OUTPUT" ? "The model's answer failed citation checks" : "The AI provider didn't respond", body: esc(error.message) + " Nothing unverified was shown. Try again in a moment.", actions: '<button class="btn sm" type="button" data-generate>Try again</button>' });
      } else {
        html = notice({ tone: "bad", title: "Insights couldn't be generated", body: esc(error.message), actions: '<button class="btn sm" type="button" data-generate>Try again</button>' });
      }
      root.innerHTML = intro() + html;
      root.querySelector("section [data-generate]").remove();
    }
  }

  function paint(r) {
    const i = r.interpretation;
    const stale = report && r.reportFingerprint !== report.fingerprint;
    tools.innerHTML = `<button class="btn sm" type="button" data-generate>${icon("refresh")}Regenerate</button>`;
    root.innerHTML = `
      <div class="snapshot-bar" style="margin-bottom:18px">
        <span class="pill accent">${icon("sparkle").replace("<svg", '<svg style="width:12px;height:12px"')}AI interpretation</span>
        <span class="kv">model <b>${esc(r.model)}</b></span>
        <span class="kv">grounded on <b>${esc(String(r.groundingClaimCount))} claims</b></span>
        <span class="kv">generated <b>${esc(date(r.generatedAt, true))}</b></span>
        ${r.cacheHit ? '<span class="pill">cached</span>' : ""}
        <span class="kv">report <b>${esc(shortSha(r.reportFingerprint))}</b></span>
      </div>
      ${stale ? notice({ tone: "warn", title: "These insights were generated from a different report", body: "Regenerate to read the current snapshot." }) : ""}
      <section class="card pad" style="margin-bottom:18px"><div class="eyebrow">Executive summary</div><p style="font-size:17px;line-height:1.6;margin-top:12px;color:var(--ink)">${esc(i.executiveSummary)}</p></section>
      <h3 style="font-size:18px;margin:6px 0 12px">Themes</h3>
      ${i.themes.length ? `<div class="grid g2" style="margin-bottom:18px">${i.themes.map((t) => `<article class="card pad"><h4 style="font-size:16px;letter-spacing:-.015em">${esc(t.title)}</h4><p class="muted" style="margin-top:8px;font-size:14.5px;line-height:1.6">${esc(t.analysis)}</p><div class="row wrap gap-8" style="margin-top:14px">${keyChips(t.evidenceKeys)}</div></article>`).join("")}</div>` : `<div class="card" style="margin-bottom:18px">${empty({ iconName: "sparkle", title: "No themes returned" })}</div>`}
      <div class="grid g2">
        <section class="card pad"><h3 style="font-size:16px">Questions worth investigating</h3>
          ${i.investigationQuestions.length ? `<ol class="policy" style="margin-top:14px">${i.investigationQuestions.map((q) => `<li>${icon("search")}<span>${esc(q.question)}<span class="row wrap gap-8" style="margin-top:8px">${keyChips(q.evidenceKeys)}</span></span></li>`).join("")}</ol>` : '<p class="hint" style="margin-top:10px">None returned.</p>'}
        </section>
        <section class="card pad"><h3 style="font-size:16px">Uncertainties</h3>
          ${i.uncertainties.length ? `<ul class="policy" style="margin-top:14px">${i.uncertainties.map((u) => `<li>${icon("alert")}<span>${esc(u)}</span></li>`).join("")}</ul>` : '<p class="hint" style="margin-top:10px">None returned.</p>'}
        </section>
      </div>`;
  }

  root.addEventListener("click", (e) => {
    const gen = e.target.closest("[data-generate]");
    if (gen) return generate(gen);
    if (e.target.closest("[data-go-report]")) return go("report");
    const k = e.target.closest("[data-ikey]");
    if (k) {
      const hit = claimFor(k.getAttribute("data-ikey"));
      if (hit) openEvidence({ title: hit.section.title, basis: "Report claim cited by the interpretation", payload: { key: k.getAttribute("data-ikey"), statement: hit.claim.statement, limitation: hit.claim.limitation, evidence: hit.claim.evidence }, note: "This is the report claim the interpretation cites, quoted exactly from the current report." });
      else toast("That claim isn't in the current report.", "warn");
    }
  });
  tools.addEventListener("click", (e) => { const gen = e.target.closest("[data-generate]"); if (gen) generate(gen); });

  // Show a cached result immediately; otherwise wait for the user to ask (it may call an AI provider).
  const already = cached("interpretation");
  if (already) {
    const r = await load("report", { limit: 10 }).catch(() => null);
    report = r && r.report;
    if (isCurrent()) paint(already.result);
  } else {
    root.innerHTML = intro(`<div class="grid g3" style="margin-top:18px">
      <div class="card flat sunken" style="padding:16px"><div class="eyebrow">01</div><p style="margin-top:8px;font-size:14px">An executive summary of the report.</p></div>
      <div class="card flat sunken" style="padding:16px"><div class="eyebrow">02</div><p style="margin-top:8px;font-size:14px">Themes, each citing report claims you can open.</p></div>
      <div class="card flat sunken" style="padding:16px"><div class="eyebrow">03</div><p style="margin-top:8px;font-size:14px">Open questions and explicit uncertainties.</p></div>
    </div>`);
  }
  return null;
}
