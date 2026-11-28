// Account flows: sign in, create account, verify email, forgot/reset password,
// and the one-time legacy workspace migration. Every server error code maps to a
// specific, actionable message.

import { api, ApiError, legacyMigrationKey, clearLegacyMigrationKey, githubStartUrl, GITHUB_OAUTH_MESSAGES } from "../core/api.js";
import { setUser, loadRepositories } from "../core/store.js";
import { href, go, safeNext } from "../core/router.js";
import { esc, session, local } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/components.js";
import { demo, mountDemos } from "../ui/player.js";

const MIN = 12;
const NEXT_KEY = "autopsy.next";

// After sign-in, reopen the repository the user last worked in (or their most recently
// updated one). Falls back to the project list when there is none or the lookup fails.
async function recentWorkspace() {
  try {
    const repos = await loadRepositories(true);
    if (!repos.length) return "";
    const last = local.get("autopsy.lastRepo", "");
    const pick = repos.find((r) => r.id === last) || repos[0];
    return href("workspace", { repoId: pick.id, phase: "overview" });
  } catch {
    return "";
  }
}

function strength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= MIN) s++;
  if (pw.length >= 16) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length < MIN) return Math.min(1, s);
  return Math.max(1, Math.min(4, s));
}

function side(mode) {
  const copy = {
    signup: ["Your project's history,", "cited line by line."],
    signin: ["Welcome back.", "Your evidence is where you left it."],
    forgot: ["Locked out?", "We'll email you a one-time link."],
    reset: ["Choose a new password.", "Every other session signs out."],
    verify: ["Almost there.", "Confirming your email address."]
  }[mode] || ["Project Autopsy", ""];
  return `
    <aside class="auth-side">
      <span class="eyebrow">Project Autopsy</span>
      <h2>${esc(copy[0])}<br><span class="serif">${esc(copy[1])}</span></h2>
      <div class="card" style="padding:12px;border-radius:var(--r-lg)">${demo(mode === "signin" ? "report" : "import", { compact: false })}</div>
      <ul class="auth-points">
        <li>${icon("check")}<span>Sessions live in HttpOnly cookies — no tokens in your browser storage.</span></li>
        <li>${icon("check")}<span>Repositories are private to your account.</span></li>
        <li>${icon("check")}<span>Access tokens for private repos are encrypted at rest and never shown again.</span></li>
      </ul>
    </aside>`;
}

function passwordField(id, label, { autocomplete = "current-password", meter = false, hint = "" } = {}) {
  return `
    <label class="field">
      <span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>
      <div class="input-wrap">
        <input class="input" id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" minlength="${MIN}" maxlength="256" required>
        <button class="reveal" type="button" data-reveal="${id}" aria-label="Show password" aria-pressed="false">Show</button>
      </div>
      ${meter ? `<div class="strength" data-strength-for="${id}" data-level="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div><small id="${id}Hint">At least ${MIN} characters. Longer is stronger.</small>` : ""}
    </label>`;
}

function emailField(value = "") {
  return `<label class="field"><span>Email</span><input class="input" id="authEmail" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="320" required value="${esc(value)}"></label>`;
}

function errorBox() {
  return '<div class="form-error" id="authError" role="alert" hidden></div>';
}

function cardFor(mode, route) {
  const next = safeNext(route.query && route.query.next);
  const nextParam = next ? { next } : {};
  if (mode === "signin" && legacyMigrationKey()) {
    return `
      <div class="eyebrow">One-time migration</div>
      <h1 style="margin-top:10px">Move your workspace into an account</h1>
      <p class="sub">This browser still holds an older shared workspace key. Sign in or choose credentials once — your existing repositories move into the account and the key is removed from this browser.</p>
      <form id="authForm" novalidate data-mode="migrate">
        ${errorBox()}
        ${emailField()}
        ${passwordField("authPassword", "Password", { autocomplete: "new-password", meter: true })}
        <button class="btn primary lg block" type="submit" id="authSubmit">Migrate workspace</button>
      </form>
      <div class="auth-switch"><button class="link-btn" type="button" data-discard-legacy>Discard the old key and sign in normally</button></div>`;
  }
  if (mode === "signin") {
    return `
      <h1>Sign in</h1>
      <p class="sub">Open your private workspace.</p>
      <div id="oauthSlot"></div>
      <form id="authForm" novalidate data-mode="signin">
        ${errorBox()}
        <div id="authNotice"></div>
        ${emailField(session.get("autopsy.lastEmail"))}
        ${passwordField("authPassword", "Password")}
        <div class="row" style="justify-content:flex-end;margin-top:-6px"><a class="link-btn" href="${href("forgot")}" style="font-size:13.5px">Forgot password?</a></div>
        <button class="btn primary lg block" type="submit" id="authSubmit">Sign in</button>
      </form>
      <div class="auth-switch">New to Project Autopsy? <a class="link-btn" href="${href("signup", nextParam)}">Create an account</a></div>`;
  }
  if (mode === "signup") {
    return `
      <h1>Create your account</h1>
      <p class="sub">Analyze repositories privately. Takes a minute.</p>
      <div id="oauthSlot"></div>
      <form id="authForm" novalidate data-mode="signup">
        ${errorBox()}
        ${emailField()}
        ${passwordField("authPassword", "Password", { autocomplete: "new-password", meter: true })}
        ${passwordField("authConfirm", "Confirm password", { autocomplete: "new-password" })}
        <button class="btn primary lg block" type="submit" id="authSubmit">Create account</button>
      </form>
      <div class="auth-switch">Already have an account? <a class="link-btn" href="${href("signin", nextParam)}">Sign in</a></div>`;
  }
  if (mode === "forgot") {
    return `
      <h1>Reset your password</h1>
      <p class="sub">Enter your account email. If it exists, we'll send a one-time reset link valid for one hour.</p>
      <form id="authForm" novalidate data-mode="forgot">
        ${errorBox()}
        <div id="authNotice"></div>
        ${emailField(session.get("autopsy.lastEmail"))}
        <button class="btn primary lg block" type="submit" id="authSubmit">Send reset link</button>
      </form>
      <div class="auth-switch">Remembered it? <a class="link-btn" href="${href("signin")}">Back to sign in</a></div>`;
  }
  if (mode === "reset") {
    return `
      <h1>Choose a new password</h1>
      <p class="sub">After this, every existing session for your account is signed out.</p>
      <form id="authForm" novalidate data-mode="reset">
        ${errorBox()}
        <div id="authNotice"></div>
        ${passwordField("authPassword", "New password", { autocomplete: "new-password", meter: true })}
        ${passwordField("authConfirm", "Confirm new password", { autocomplete: "new-password" })}
        <button class="btn primary lg block" type="submit" id="authSubmit">Update password</button>
      </form>
      <div class="auth-switch"><a class="link-btn" href="${href("signin")}">Back to sign in</a></div>`;
  }
  // verify
  return `
    <div id="verifyState" aria-live="polite">
      <div class="eyebrow">Email verification</div>
      <h1 style="margin-top:10px">Verifying your email…</h1>
      <p class="sub">One moment while we confirm your link.</p>
      <div class="skel" style="height:6px;margin-top:24px;border-radius:6px"></div>
    </div>`;
}

const GITHUB_MARK = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

export { GITHUB_MARK };

// Shows "Continue with GitHub" only when the server has GitHub OAuth configured.
async function mountGitHubOption(view, mode, next) {
  const slot = view.querySelector("#oauthSlot");
  if (!slot) return;
  try {
    const body = await api("/api/auth/providers");
    if (!body.providers || !body.providers.github || !body.providers.github.enabled || !slot.isConnected) return;
  } catch {
    return;
  }
  slot.innerHTML = `
    <a class="btn lg block github-btn" href="${esc(githubStartUrl({ intent: "signin", next }))}" style="margin-top:22px">${GITHUB_MARK}${mode === "signup" ? "Sign up with GitHub" : "Continue with GitHub"}</a>
    <p class="hint" style="margin-top:8px;text-align:center">Reads your profile, verified email and public repositories.</p>
    <div class="or-divider"><span>or use email</span></div>`;
}

export function renderAuth(view, route) {
  const mode = route.name;
  view.innerHTML = `<div class="container auth-page"><div class="card raised auth-card">${cardFor(mode, route)}</div>${side(mode)}</div>`;
  mountDemos(view);
  if (mode === "signin" || mode === "signup") {
    mountGitHubOption(view, mode, safeNext(route.query && route.query.next));
    const oauthCode = route.query && route.query.oauth;
    if (oauthCode) {
      const box = view.querySelector("#authError");
      if (box) {
        box.textContent = GITHUB_OAUTH_MESSAGES[oauthCode] || "GitHub sign-in didn't complete. Try again.";
        box.hidden = false;
      }
    }
  }

  const form = view.querySelector("#authForm");
  const errorEl = view.querySelector("#authError");
  const submitBtn = view.querySelector("#authSubmit");
  const next = safeNext(route.query && route.query.next);

  const showError = (message) => {
    if (!errorEl) { toast(message, "bad"); return; }
    errorEl.innerHTML = icon("alert") + "<span>" + esc(message) + "</span>";
    errorEl.querySelector("svg").style.cssText = "width:16px;height:16px;flex:none;margin-top:2px";
    errorEl.hidden = false;
  };
  const clearError = () => { if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; } };
  const busy = (on, label) => {
    if (!submitBtn) return;
    if (on) {
      submitBtn.dataset.idle = submitBtn.textContent;
      submitBtn.textContent = label;
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    } else {
      submitBtn.textContent = submitBtn.dataset.idle || submitBtn.textContent;
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
    }
  };
  const finish = async (body, message, { reopen = true } = {}) => {
    setUser(body.user, body.csrfToken);
    session.set("autopsy.lastEmail", body.user && body.user.email ? body.user.email : "");
    const stored = safeNext(session.get(NEXT_KEY));
    session.remove(NEXT_KEY);
    if (message) toast(message, "good");
    const target = next || stored || (reopen ? await recentWorkspace() : "") || href("projects");
    go(target, { replace: true });
  };

  // Show/hide password + strength meter.
  view.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-reveal]");
    if (!btn) return;
    const input = view.querySelector("#" + btn.getAttribute("data-reveal"));
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  view.querySelectorAll("[data-strength-for]").forEach((meter) => {
    const input = view.querySelector("#" + meter.getAttribute("data-strength-for"));
    const hint = view.querySelector("#" + input.id + "Hint");
    input.addEventListener("input", () => {
      const lvl = strength(input.value);
      meter.setAttribute("data-level", String(lvl));
      if (hint) {
        const left = MIN - input.value.length;
        hint.textContent = left > 0 ? left + " more character" + (left === 1 ? "" : "s") + " needed." : ["", "Weak — add length or variety.", "Fair.", "Good.", "Strong."][lvl];
      }
    });
  });
  view.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); clearError(); }));

  const discard = view.querySelector("[data-discard-legacy]");
  if (discard) discard.addEventListener("click", () => { clearLegacyMigrationKey(); renderAuth(view, route); });

  if (mode === "verify") {
    verify(view, route.token, finish);
    return null;
  }

  if (!form) return null;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    const formMode = form.getAttribute("data-mode");
    const emailInput = view.querySelector("#authEmail");
    const pwInput = view.querySelector("#authPassword");
    const confirmInput = view.querySelector("#authConfirm");
    const email = emailInput ? emailInput.value.trim() : "";
    const password = pwInput ? pwInput.value : "";

    if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.setAttribute("aria-invalid", "true");
      emailInput.focus();
      return showError("Enter a valid email address.");
    }
    if (pwInput && formMode !== "forgot") {
      if (password.length < MIN) {
        pwInput.setAttribute("aria-invalid", "true");
        pwInput.focus();
        return showError("Password must be at least " + MIN + " characters.");
      }
      if (confirmInput && confirmInput.value !== password) {
        confirmInput.setAttribute("aria-invalid", "true");
        confirmInput.focus();
        return showError("Passwords don't match.");
      }
    }

    try {
      if (formMode === "signin") {
        busy(true, "Signing in…");
        session.set("autopsy.lastEmail", email);
        const body = await api("/api/auth/login", { method: "POST", body: { email, password } });
        finish(body, "Signed in");
      } else if (formMode === "signup") {
        busy(true, "Creating account…");
        const body = await api("/api/auth/register", { method: "POST", body: { email, password } });
        if (body.requiresEmailVerification) {
          if (next) session.set(NEXT_KEY, next);
          session.set("autopsy.lastEmail", email);
          showCheckInbox(view, email);
          return;
        }
        finish(body, "Account created", { reopen: false });
      } else if (formMode === "forgot") {
        busy(true, "Sending…");
        session.set("autopsy.lastEmail", email);
        const body = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
        view.querySelector("#authNotice").innerHTML = '<div class="form-note good">' + esc(body.message || "If an account exists for that email, a reset link has been sent.") + "</div>";
        form.querySelectorAll(".field").forEach((f) => (f.hidden = true));
        submitBtn.hidden = true;
      } else if (formMode === "reset") {
        busy(true, "Updating…");
        await api("/api/auth/reset-password", { method: "POST", body: { token: route.token, newPassword: password } });
        history.replaceState(null, "", location.pathname + location.search + "#/signin");
        toast("Password updated. Sign in with your new password.", "good");
        go(href("signin"), { replace: true });
      } else if (formMode === "migrate") {
        busy(true, "Migrating…");
        const body = await api("/api/auth/migrate-legacy", { method: "POST", body: { email, password }, headers: { "x-autopsy-api-key": legacyMigrationKey() } });
        clearLegacyMigrationKey();
        finish(body, "Workspace migrated to your account");
      }
    } catch (error) {
      handleAuthError(error, formMode, view, email, showError);
    } finally {
      busy(false);
    }
  });

  return null;
}

function handleAuthError(error, formMode, view, email, showError) {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "EMAIL_VERIFICATION_REQUIRED") {
    const box = view.querySelector("#authNotice");
    box.innerHTML = '<div class="form-note warn" style="flex-direction:column;align-items:stretch;gap:10px"><span>Verify your email before signing in. Check your inbox for the link we sent.</span><button class="btn sm" type="button" data-resend>' + icon("mail") + "Resend verification email</button></div>";
    box.querySelector("[data-resend]").addEventListener("click", (e) => resend(e.currentTarget, email));
    return;
  }
  const messages = {
    AUTH_INVALID_CREDENTIALS: "Email or password is incorrect.",
    ACCOUNT_EXISTS: "An account already exists for this email. Sign in instead, or reset your password.",
    AUTH_EMAIL_NOT_CONFIGURED: formMode === "forgot"
      ? "Password reset by email isn't enabled on this server. Ask the operator to reset your access."
      : "Email delivery isn't configured on this server yet. Try again later.",
    AUTH_EMAIL_SEND_FAILED: "We couldn't send the email. Try again in a moment.",
    AUTH_TOKEN_INVALID: "This link is invalid, expired, or already used. Request a new one.",
    LEGACY_MIGRATION_UNAUTHORIZED: "The old workspace key is no longer valid. Discard it and sign in normally."
  };
  showError(messages[code] || (error && error.message) || "Something went wrong. Try again.");
  if (code === "ACCOUNT_EXISTS") {
    const err = view.querySelector("#authError");
    err.insertAdjacentHTML("beforeend", ' <a class="link-btn" href="' + href("signin") + '" style="margin-left:auto;white-space:nowrap">Sign in</a>');
  }
}

async function resend(button, email) {
  if (!email) { toast("Enter your email first.", "warn"); return; }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const body = await api("/api/auth/resend-verification", { method: "POST", body: { email } });
    toast(body.message || "If the account needs verification, a new email has been sent.", "good");
  } catch (error) {
    toast(error.code === "AUTH_EMAIL_NOT_CONFIGURED" ? "Email delivery isn't configured on this server." : error.message, "bad");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function showCheckInbox(view, email) {
  const card = view.querySelector(".auth-card");
  card.innerHTML = `
    <div class="eyebrow">Check your inbox</div>
    <h1 style="margin-top:10px">Confirm your email</h1>
    <p class="sub">We sent a verification link to <b>${esc(email)}</b>. Open it on this device to continue straight into your workspace. The link expires in 24 hours.</p>
    <div class="form-note" style="margin-top:22px">${icon("info").replace("<svg", '<svg style="width:16px;height:16px;flex:none;margin-top:2px"')}<span>Didn't arrive? Check spam, or resend below.</span></div>
    <div class="stack gap-8" style="margin-top:18px">
      <button class="btn block" type="button" data-resend>${icon("mail")}Resend verification email</button>
      <a class="btn ghost block" href="${href("signin")}">Back to sign in</a>
    </div>`;
  card.querySelector("[data-resend]").addEventListener("click", (e) => resend(e.currentTarget, email));
}

async function verify(view, token, finish) {
  const box = view.querySelector("#verifyState");
  if (!token || token.length < 32) {
    return verifyFailed(box, "This verification link is incomplete. Open the full link from your email.");
  }
  try {
    const body = await api("/api/auth/verify-email", { method: "POST", body: { token } });
    history.replaceState(null, "", location.pathname + location.search + "#/projects");
    finish(body, "Email verified — welcome to Project Autopsy");
  } catch (error) {
    verifyFailed(box, error.code === "AUTH_TOKEN_INVALID" ? "This verification link is invalid, expired, or already used." : error.message);
  }
}

function verifyFailed(box, message) {
  box.innerHTML = `
    <div class="eyebrow">Email verification</div>
    <h1 style="margin-top:10px">We couldn't verify this link</h1>
    <p class="sub">${esc(message)}</p>
    <form id="resendForm" class="stack gap-12" style="margin-top:22px" novalidate>
      ${emailField(session.get("autopsy.lastEmail"))}
      <button class="btn primary block" type="submit">${icon("mail")}Send a new verification link</button>
    </form>
    <div class="auth-switch"><a class="link-btn" href="${href("signin")}">Back to sign in</a></div>`;
  box.querySelector("#resendForm").addEventListener("submit", (e) => {
    e.preventDefault();
    resend(e.target.querySelector("button"), box.querySelector("#authEmail").value.trim());
  });
}
