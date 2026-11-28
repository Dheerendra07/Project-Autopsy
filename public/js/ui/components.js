// Reusable UI pieces rendered as HTML strings, plus the few imperative overlays
// (toast, confirm, evidence drawer, popover) that need focus management.

import { esc, num, copyText } from "../core/util.js";
import { icon } from "./icons.js";

// ---------- Toasts ----------

export function toast(message, tone = "") {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast " + tone;
  el.setAttribute("role", tone === "bad" ? "alert" : "status");
  el.innerHTML = '<span class="t-dot"></span><span>' + esc(message) + "</span>";
  host.appendChild(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => {
    el.style.transition = "opacity .25s, transform .25s";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 260);
  }, tone === "bad" ? 6000 : 3400);
}

// ---------- Overlay plumbing ----------

let overlayStack = [];

function focusables(root) {
  return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.getClientRects().length > 0);
}

function openOverlay(panel, { onClose, labelledBy } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "overlay";
  const returnFocus = document.activeElement;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  if (labelledBy) panel.setAttribute("aria-labelledby", labelledBy);
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.style.overflow = "hidden";

  const entry = { panel, backdrop, close };
  overlayStack.push(entry);

  function keydown(event) {
    if (overlayStack[overlayStack.length - 1] !== entry) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const items = focusables(panel);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  function close(result) {
    if (!panel.isConnected) return;
    document.removeEventListener("keydown", keydown, true);
    backdrop.remove();
    panel.remove();
    overlayStack = overlayStack.filter((x) => x !== entry);
    if (!overlayStack.length) document.body.style.overflow = "";
    if (returnFocus && typeof returnFocus.focus === "function") {
      try { returnFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    if (onClose) onClose(result);
  }
  document.addEventListener("keydown", keydown, true);
  backdrop.addEventListener("click", () => close());
  requestAnimationFrame(() => {
    const target = panel.querySelector("[data-autofocus]") || focusables(panel)[0];
    if (target) target.focus({ preventScroll: true });
  });
  return close;
}

export function closeAllOverlays() {
  [...overlayStack].reverse().forEach((e) => e.close());
}

// ---------- Confirm dialog ----------

export function confirmDialog({ title, body, confirmLabel = "Confirm", tone = "danger", requireText = "" }) {
  return new Promise((resolve) => {
    const panel = document.createElement("div");
    panel.className = "modal";
    panel.innerHTML =
      '<h3 id="confirmTitle">' + esc(title) + "</h3>" +
      "<p>" + esc(body) + "</p>" +
      (requireText
        ? '<label class="field" style="margin-top:16px"><span>Type <code>' + esc(requireText) + '</code> to confirm</span><input class="input mono" data-confirm-input autocomplete="off" spellcheck="false" data-autofocus></label>'
        : "") +
      '<div class="m-actions"><button class="btn" data-x="cancel" type="button"' + (requireText ? "" : " data-autofocus") + '>Cancel</button>' +
      '<button class="btn ' + (tone === "danger" ? "primary" : "primary") + '" data-x="ok" type="button"' + (requireText ? " disabled" : "") + ">" + esc(confirmLabel) + "</button></div>";
    let result = false;
    const close = openOverlay(panel, { labelledBy: "confirmTitle", onClose: () => resolve(result) });
    const ok = panel.querySelector('[data-x="ok"]');
    if (tone === "danger") { ok.style.setProperty("--btn-bg", "var(--bad)"); ok.style.setProperty("--btn-bd", "var(--bad)"); }
    const input = panel.querySelector("[data-confirm-input]");
    if (input) input.addEventListener("input", () => { ok.disabled = input.value.trim() !== requireText; });
    panel.querySelector('[data-x="cancel"]').addEventListener("click", () => close());
    ok.addEventListener("click", () => { result = true; close(); });
  });
}

// ---------- Generic modal with custom content ----------

export function modal(html, { onMount, labelledBy } = {}) {
  const panel = document.createElement("div");
  panel.className = "modal";
  panel.innerHTML = html;
  const close = openOverlay(panel, { labelledBy });
  if (onMount) onMount(panel, close);
  return close;
}

// ---------- Evidence drawer ----------

const PREFERRED = [
  ["subject", "Commit subject"], ["statement", "Statement"], ["path", "Path"], ["path_a", "File A"], ["path_b", "File B"],
  ["sha", "Commit"], ["commitSha", "Commit"], ["revisionSha", "Revision"], ["source", "Evidence source"], ["key", "Evidence key"],
  ["eventType", "Event type"], ["event_type", "Event type"], ["change_type", "Change"], ["changeType", "Change"],
  ["package_name", "Package"], ["scope", "Scope"], ["previous_spec", "Before"], ["current_spec", "After"],
  ["author_name", "Author"], ["authorName", "Author"], ["committed_at", "Committed"], ["committedAt", "Committed"],
  ["files_changed", "Files changed"], ["additions", "Additions"], ["deletions", "Deletions"], ["total_churn", "Total churn"],
  ["commits_touched", "Commits touching"], ["co_change_count", "Co-changes"], ["signal_commits", "Signal commits"],
  ["framework", "Framework"], ["environment", "Environment"], ["operationName", "Operation"], ["status", "Status"]
];

export function openEvidence({ title, basis, payload, note }) {
  const panel = document.createElement("aside");
  panel.className = "drawer";
  const p = payload && typeof payload === "object" ? payload : {};
  const rows = [];
  const seen = new Set();
  for (const [k, label] of PREFERRED) {
    if (seen.has(label) || p[k] === undefined || p[k] === null || p[k] === "") continue;
    seen.add(label);
    const v = typeof p[k] === "object" ? JSON.stringify(p[k]) : String(p[k]);
    rows.push('<div class="k">' + esc(label) + '</div><div class="v">' + esc(v) + "</div>");
  }
  const json = JSON.stringify(payload, null, 2);
  panel.innerHTML =
    '<div class="drawer-head"><div style="min-width:0;flex:1"><div class="eyebrow">Evidence record</div><h3 id="drawerTitle" style="margin-top:6px">' + esc(title) + "</h3>" +
    (basis ? "<p>" + esc(basis) + "</p>" : "") +
    '</div><button class="btn icon sm ghost" data-x="close" aria-label="Close evidence">' + icon("x") + "</button></div>" +
    '<div class="drawer-body">' +
    (rows.length ? '<div class="kv-list">' + rows.join("") + "</div>" : "") +
    '<div class="row" style="margin:18px 0 10px;justify-content:space-between"><span class="eyebrow">' + (note ? "Citation" : "Exact API record") + '</span><button class="btn sm" data-x="copy">' + icon("copy") + "Copy JSON</button></div>" +
    '<pre class="json">' + esc(json) + "</pre>" +
    '<p class="hint" style="margin-top:12px">' + esc(note || "This is the persisted record returned by the API for the current analysis snapshot. Nothing here is generated.") + "</p>" +
    "</div>";
  const close = openOverlay(panel, { labelledBy: "drawerTitle" });
  panel.querySelector('[data-x="close"]').addEventListener("click", () => close());
  panel.querySelector('[data-x="copy"]').addEventListener("click", async () => {
    toast((await copyText(json)) ? "Evidence JSON copied" : "Clipboard is unavailable in this browser", "good");
  });
}

// Registry so table rows can open the record behind them without re-fetching.
const registry = new Map();
let seq = 0;
export function registerEvidence(title, basis, payload) {
  const id = "ev" + (++seq);
  registry.set(id, { title, basis, payload });
  if (registry.size > 4000) registry.delete(registry.keys().next().value);
  return id;
}
export function inspectButton(title, basis, payload, label = "Inspect") {
  return '<button class="btn sm ghost" type="button" data-evidence="' + registerEvidence(title, basis, payload) + '" aria-label="' + esc("Inspect " + title) + '">' + icon("eye") + '<span class="hide-xs">' + esc(label) + "</span></button>";
}
export function bindEvidence(root) {
  root.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-evidence]");
    if (!btn || !root.contains(btn)) return;
    const record = registry.get(btn.getAttribute("data-evidence"));
    if (record) openEvidence(record);
  });
}

// ---------- Popover menu ----------

export function popover(anchor, html, { onMount } = {}) {
  closePopover();
  const el = document.createElement("div");
  el.className = "popover";
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  let left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
  el.style.left = left + "px";
  el.style.top = Math.min(r.bottom + 8, window.innerHeight - el.offsetHeight - 12) + "px";
  anchor.setAttribute("aria-expanded", "true");
  const off = (event) => {
    if (event.type === "keydown" && event.key !== "Escape") return;
    if (event.type === "pointerdown" && (el.contains(event.target) || anchor.contains(event.target))) return;
    closePopover();
  };
  el._cleanup = () => {
    anchor.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", off, true);
    document.removeEventListener("keydown", off, true);
    window.removeEventListener("resize", closePopover);
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", off, true);
    document.addEventListener("keydown", off, true);
    window.addEventListener("resize", closePopover);
  });
  if (onMount) onMount(el);
  const first = el.querySelector("a,button");
  if (first) first.focus({ preventScroll: true });
  return el;
}
export function closePopover() {
  document.querySelectorAll(".popover").forEach((el) => { if (el._cleanup) el._cleanup(); el.remove(); });
}

// ---------- Static building blocks ----------

export function notice({ tone = "", title, body = "", actions = "", iconName }) {
  const ic = iconName || (tone === "bad" ? "alert" : tone === "warn" ? "alert" : tone === "good" ? "check" : "info");
  return '<div class="notice ' + tone + '" role="' + (tone === "bad" ? "alert" : "status") + '"><div class="n-icon">' + icon(ic) + '</div><div style="min-width:0"><h4>' + esc(title) + "</h4>" +
    (body ? "<p>" + body + "</p>" : "") + "</div>" + (actions ? '<div class="n-actions">' + actions + "</div>" : "") + "</div>";
}

export function empty({ iconName = "search", title, body = "", action = "" }) {
  return '<div class="empty"><div class="e-icon">' + icon(iconName) + "</div><h4>" + esc(title) + "</h4>" + (body ? "<p>" + body + "</p>" : "") + (action ? '<div style="margin-top:8px">' + action + "</div>" : "") + "</div>";
}

export function stat(label, value, foot = "", small = false) {
  return '<div class="cell stat"><div class="label">' + esc(label) + '</div><div class="value' + (small ? " sm" : "") + '">' + value + "</div>" + (foot ? '<div class="foot">' + foot + "</div>" : "") + "</div>";
}

export function miniBar(value, max, tone = "") {
  const w = max > 0 ? Math.max(2, Math.round((Number(value) / max) * 100)) : 0;
  return '<div class="mini-bar"><div class="track"><i class="' + tone + '" style="width:' + w + '%"></i></div><span>' + num(value) + "</span></div>";
}

export function skeleton(lines = 3) {
  let out = '<div class="loading-block" aria-busy="true" aria-label="Loading">';
  out += '<div class="skel" style="height:28px;width:40%"></div>';
  for (let i = 0; i < lines; i++) out += '<div class="skel" style="height:' + (i === 0 ? 120 : 64) + 'px"></div>';
  return out + "</div>";
}

// Sortable table: columns = [{ key, label, num, render(row), sort(row) }]
export function table(columns, rows, { id = "", emptyText = "No records in this snapshot." } = {}) {
  const head = columns.map((c, i) =>
    '<th scope="col" class="' + (c.num ? "num" : "") + '"' + (c.sortable === false ? "" : ' aria-sort="none"') + ">" +
    (c.sortable === false ? esc(c.label) : '<button type="button" data-sort="' + i + '">' + esc(c.label) + "</button>") + "</th>").join("");
  const body = rows.length
    ? rows.map((r, ri) => "<tr data-row=\"" + ri + "\">" + columns.map((c) => '<td class="' + (c.cls || (c.num ? "num" : "")) + '">' + c.render(r) + "</td>").join("") + "</tr>").join("")
    : '<tr><td colspan="' + columns.length + '" class="dim" style="text-align:center;padding:28px">' + esc(emptyText) + "</td></tr>";
  return '<div class="table-wrap"><table class="data"' + (id ? ' id="' + id + '"' : "") + "><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
}

export function bindTables(root, specs) {
  // specs: { [tableId]: { columns, rows } } so sorting uses raw values, not rendered text.
  root.querySelectorAll("table.data[id]").forEach((tableEl) => {
    const spec = specs[tableEl.id];
    if (!spec) return;
    tableEl.querySelectorAll("th button[data-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-sort"));
        const th = btn.parentElement;
        const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
        tableEl.querySelectorAll("th").forEach((x) => { if (x.hasAttribute("aria-sort")) x.setAttribute("aria-sort", "none"); });
        th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
        const col = spec.columns[i];
        const value = col.sort || ((r) => r[col.key]);
        const tbody = tableEl.tBodies[0];
        const rowEls = [...tbody.rows].filter((r) => r.hasAttribute("data-row"));
        rowEls.sort((a, b) => {
          const va = value(spec.rows[Number(a.dataset.row)]);
          const vb = value(spec.rows[Number(b.dataset.row)]);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
        rowEls.forEach((r) => tbody.appendChild(r));
      });
    });
  });
}

export function filterRows(root, input, countEl) {
  const term = input.value.trim().toLowerCase();
  let shown = 0, total = 0;
  root.querySelectorAll("[data-filterable] tbody tr[data-row], [data-filterable] [data-item]").forEach((row) => {
    total++;
    const hit = !term || row.textContent.toLowerCase().includes(term);
    row.hidden = !hit;
    if (hit) shown++;
  });
  if (countEl) countEl.textContent = term ? num(shown) + " of " + num(total) : num(total) + " rows";
}

export function errorText(error) {
  return error && error.message ? error.message : "Something went wrong.";
}
