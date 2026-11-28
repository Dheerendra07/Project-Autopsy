// Account & security: profile, active sessions (revoke one or all), password change.

import { api, setCsrf } from "../core/api.js";
import { getState, signedOut } from "../core/store.js";
import { href, go } from "../core/router.js";
import { esc, date, relative } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { toast, notice, confirmDialog } from "../ui/components.js";
import { githubStartUrl } from "../core/api.js";
import { GITHUB_MARK } from "./auth.js";

// GitHub connection: status, include private repositories, disconnect. Accounts
// created through GitHub have no password, so the password form is replaced.
async function loadGitHub(view) {
  const box = view.querySelector("#githubSection");
  let status;
  try { status = await api("/api/github/status"); } catch { return; }
  if (!status.hasPassword) {
    view.querySelector("#passwordSection").innerHTML = '<h3 style="font-size:16px">Password</h3><p class="muted" style="font-size:13.5px;margin-top:4px">You sign in with GitHub, so this account has no password to change.</p>';
  }
  if (!status.enabled && !status.connected) return;
  const gh = status.github;
  const next = "#/account";
  box.hidden = false;
  box.innerHTML = gh
    ? `<div class="row wrap gap-12" style="justify-content:space-between">
        <div class="row gap-12" style="min-width:0">
          ${gh.avatarUrl ? `<img class="gh-avatar" src="${esc(gh.avatarUrl)}" alt="" width="40" height="40" referrerpolicy="no-referrer">` : `<span class="gh-mark">${GITHUB_MARK}</span>`}
          <div style="min-width:0"><h3 style="font-size:16px">GitHub · @${esc(gh.login)}</h3>
            <p class="muted" style="font-size:13.5px;margin-top:2px">Connected ${esc(date(gh.connectedAt))} · ${gh.privateRepositories ? "public and private repositories" : "public repositories only"}</p></div>
        </div>
        <div class="row wrap gap-8">
          ${gh.privateRepositories ? "" : `<a class="btn sm" href="${esc(githubStartUrl({ intent: "connect", access: "private", next }))}">${icon("lock")}Include private repos</a>`}
          <button class="btn sm danger" type="button" data-gh-disconnect>Disconnect</button>
        </div>
      </div>
      <p class="hint" style="margin-top:12px">Disconnecting deletes the stored GitHub token. Repositories already imported keep their own encrypted access token until you remove it in repository settings.${status.hasPassword ? "" : " You can still sign in with GitHub."}</p>`
    : `<div class="row wrap gap-12" style="justify-content:space-between">
        <div><h3 style="font-size:16px">GitHub</h3><p class="muted" style="font-size:13.5px;margin-top:2px">Connect GitHub to import repositories from a list and sign in with one click.</p></div>
        <a class="btn sm primary" href="${esc(githubStartUrl({ intent: "connect", access: "public", next }))}">${GITHUB_MARK}Connect GitHub</a>
      </div>`;
  const btn = box.querySelector("[data-gh-disconnect]");
  if (btn) btn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Disconnect GitHub?", body: "The stored GitHub token is deleted. You can connect again at any time.", confirmLabel: "Disconnect" });
    if (!ok) return;
    try {
      await api("/api/github/connection", { method: "DELETE" });
      toast("GitHub disconnected", "good");
      loadGitHub(view);
    } catch (error) { toast(error.message, "bad"); }
  });
}

function describeAgent(ua) {
  const s = String(ua || "");
  if (!s) return "Unknown device";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /CriOS|Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : s.split(/[\s/]/)[0];
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  return browser + (os ? " on " + os : "");
}

export async function renderAccount(view) {
  const user = getState().user;
  document.title = "Account — Project Autopsy";
  view.innerHTML = `
    <div class="container" style="padding-top:clamp(24px,4vw,48px);padding-bottom:calc(64px + var(--safe-bottom));max-width:920px">
      <div class="page-head"><div class="t"><div class="num">ACCOUNT</div><h1>Account &amp; security</h1><p>Signed in as <b>${esc(user.email)}</b>.</p></div>
        <div class="tools"><a class="btn sm" href="${href("projects")}">${icon("folder")}Projects</a></div></div>

      <section class="card" style="margin-bottom:18px">
        <div class="card-section-head"><div><h3>Active sessions</h3><p>Every browser or device currently signed in. Sessions expire automatically after inactivity.</p></div>
          <button class="btn sm danger" type="button" id="revokeAll">${icon("logout")}Sign out everywhere</button></div>
        <div id="sessions"><div style="padding:18px"><div class="skel" style="height:56px"></div></div></div>
      </section>

      <section class="card pad" style="margin-bottom:18px" id="githubSection" hidden></section>

      <section class="card pad" style="margin-bottom:18px" id="passwordSection">
        <h3 style="font-size:16px">Change password</h3>
        <p class="muted" style="font-size:13.5px;margin-top:4px">Other sessions are signed out; this one stays signed in.</p>
        <form id="pwForm" class="stack gap-12" style="margin-top:16px;max-width:460px" novalidate>
          <div class="form-error" id="pwError" role="alert" hidden></div>
          <label class="field"><span>Current password</span><input class="input" id="pwCurrent" type="password" autocomplete="current-password" required></label>
          <label class="field"><span>New password <small>at least 12 characters</small></span><input class="input" id="pwNew" type="password" autocomplete="new-password" minlength="12" required></label>
          <label class="field"><span>Confirm new password</span><input class="input" id="pwConfirm" type="password" autocomplete="new-password" required></label>
          <div><button class="btn primary" type="submit" id="pwSubmit">Update password</button></div>
        </form>
      </section>

      <section class="card pad">
        <h3 style="font-size:16px">Privacy</h3>
        <ul class="policy" style="margin-top:12px">
          <li>${icon("lock")}<span>Your session is an HttpOnly cookie; this page never stores passwords or tokens in browser storage.</span></li>
          <li>${icon("shield")}<span>Interview notes and checklist ticks are kept only in this browser's local storage.</span></li>
          <li>${icon("key")}<span>Repository access tokens are encrypted on the server and can't be read back.</span></li>
        </ul>
      </section>
    </div>`;

  async function loadSessions() {
    const box = view.querySelector("#sessions");
    try {
      const body = await api("/api/auth/sessions");
      const list = body.sessions || [];
      box.innerHTML = list.length ? `<ul class="timeline">${list.map((s) => `
        <li class="tl-item" style="grid-template-columns:36px minmax(0,1fr) auto">
          <span class="repo-avatar" style="width:32px;height:32px;border-radius:9px;background:${s.isCurrent ? "var(--ink)" : "var(--surface-3)"};color:${s.isCurrent ? "#fff" : "var(--ink-2)"}">${icon("user").replace("<svg", '<svg style="width:15px;height:15px"')}</span>
          <div class="tl-body"><div class="t">${esc(describeAgent(s.userAgent))} ${s.isCurrent ? '<span class="pill good" style="height:20px;font-size:11px;margin-left:6px">this device</span>' : ""}</div>
            <div class="m"><span>signed in ${esc(date(s.createdAt, true))}</span><span>active ${esc(relative(s.lastSeenAt))}</span><span>expires ${esc(date(s.expiresAt))}</span></div></div>
          <button class="btn sm ${s.isCurrent ? "" : "danger"}" type="button" data-revoke="${esc(s.id)}" data-current="${s.isCurrent}">${s.isCurrent ? "Sign out" : "Revoke"}</button>
        </li>`).join("")}</ul>` : '<p class="hint" style="padding:18px">No active sessions.</p>';
    } catch (error) {
      box.innerHTML = '<div style="padding:16px">' + notice({ tone: "bad", title: "Couldn't load sessions", body: esc(error.message) }) + "</div>";
    }
  }
  await loadSessions();
  loadGitHub(view);

  view.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-revoke]");
    if (btn) {
      const current = btn.getAttribute("data-current") === "true";
      if (current) {
        const ok = await confirmDialog({ title: "Sign out of this device?", body: "You'll need to sign in again to open your workspace.", confirmLabel: "Sign out", tone: "plain" });
        if (!ok) return;
      }
      btn.disabled = true;
      try {
        const body = await api("/api/auth/sessions/" + encodeURIComponent(btn.getAttribute("data-revoke")), { method: "DELETE" });
        if (body.signedOutCurrentSession) { signedOut(); toast("Signed out", "good"); go(href("home")); return; }
        toast("Session revoked", "good");
        await loadSessions();
      } catch (error) { btn.disabled = false; toast(error.message, "bad"); }
    }
    if (event.target.closest("#revokeAll")) {
      const ok = await confirmDialog({ title: "Sign out everywhere?", body: "Every session, including this one, will be signed out.", confirmLabel: "Sign out everywhere" });
      if (!ok) return;
      try {
        await api("/api/auth/sessions/revoke-all", { method: "POST" });
        signedOut();
        toast("Signed out on all devices", "good");
        go(href("signin"));
      } catch (error) { toast(error.message, "bad"); }
    }
  });

  const form = view.querySelector("#pwForm");
  const err = view.querySelector("#pwError");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    err.hidden = true;
    const cur = view.querySelector("#pwCurrent").value;
    const next = view.querySelector("#pwNew").value;
    const conf = view.querySelector("#pwConfirm").value;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (next.length < 12) return fail("New password must be at least 12 characters.");
    if (next !== conf) return fail("New passwords don't match.");
    if (next === cur) return fail("Choose a password different from the current one.");
    const btn = view.querySelector("#pwSubmit");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      const body = await api("/api/auth/password", { method: "POST", body: { currentPassword: cur, newPassword: next } });
      setCsrf(body.csrfToken);
      form.reset();
      toast(body.message || "Password changed", "good");
      await loadSessions();
    } catch (error) {
      fail(error.code === "PASSWORD_INVALID" ? "Current password is incorrect." : error.message);
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  });
  return null;
}
