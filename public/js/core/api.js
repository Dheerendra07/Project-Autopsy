// API client: same-origin by default, session cookies, CSRF on unsafe methods,
// bounded timeouts, and typed errors that pages can turn into precise messages.

import { session } from "./util.js";

const CSRF_HEADER = "x-autopsy-csrf-token";
const CSRF_COOKIE = "autopsy_csrf";

// A split Render deployment serves the UI from "<name>-ui.onrender.com" and the API
// from "<name>.onrender.com". Everything else is same-origin.
export function defaultApiBase() {
  if (location.protocol !== "http:" && location.protocol !== "https:") return "http://localhost:5100";
  const host = location.hostname.toLowerCase();
  if (host.endsWith(".onrender.com")) {
    const label = host.slice(0, -".onrender.com".length);
    if (label.endsWith("-ui")) return location.origin.replace(host, label.slice(0, -3) + ".onrender.com");
  }
  return location.origin;
}

let apiBaseCache = "";
function apiBase() {
  return apiBaseCache || (apiBaseCache = defaultApiBase());
}

// Absolute URL for full-page navigations to the API (e.g. the GitHub OAuth start).
export function apiUrl(path) {
  return apiBase() + path;
}

export function githubStartUrl({ intent = "signin", access = "public", next = "" } = {}) {
  const q = new URLSearchParams({ intent, access });
  if (next) q.set("next", next);
  return apiUrl("/api/auth/github/start?" + q.toString());
}

// Plain-language messages for the ?oauth=<code> result of the GitHub flow.
export const GITHUB_OAUTH_MESSAGES = {
  GITHUB_CANCELLED: "GitHub sign-in was cancelled.",
  GITHUB_STATE_INVALID: "The GitHub sign-in link expired or was opened in another browser. Try again.",
  GITHUB_OAUTH_FAILED: "GitHub didn't complete the sign-in. Try again.",
  GITHUB_NOT_CONFIGURED: "GitHub sign-in isn't enabled on this server.",
  GITHUB_EMAIL_UNVERIFIED: "Your GitHub account has no verified email address. Verify one on GitHub, then try again.",
  GITHUB_ALREADY_LINKED: "That GitHub account is already linked to a different Project Autopsy account.",
  GITHUB_ACCOUNT_DISABLED: "This account is disabled.",
  GITHUB_SESSION_REQUIRED: "Sign in again, then connect GitHub.",
  GITHUB_TOKEN_STORAGE_UNAVAILABLE: "GitHub connections need the server's credential encryption key, which isn't configured.",
  GITHUB_TOKEN_INVALID: "GitHub rejected the connection. Try again.",
  GITHUB_NOT_FOUND: "GitHub couldn't find your account details. Try again.",
  GITHUB_RATE_LIMITED: "GitHub's rate limit was reached. Try again in a few minutes.",
  GITHUB_UNAVAILABLE: "GitHub couldn't be reached. Try again in a moment."
};
let csrfToken = "";
const listeners = new Set();

export function onAuthExpired(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setCsrf(token) {
  if (typeof token === "string" && token) csrfToken = token;
}

export function clearCsrf() {
  csrfToken = "";
}

function readCookie(name) {
  const prefix = encodeURIComponent(name) + "=";
  const hit = document.cookie.split(";").map((x) => x.trim()).find((x) => x.startsWith(prefix));
  if (!hit) return "";
  try { return decodeURIComponent(hit.slice(prefix.length)); } catch { return hit.slice(prefix.length); }
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", issues = null, retryAfter = 0, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

function describeIssues(issues) {
  if (!Array.isArray(issues) || !issues.length) return "";
  const first = issues[0];
  const field = Array.isArray(first.path) && first.path.length ? String(first.path[first.path.length - 1]) : "";
  const labels = { email: "Email", password: "Password", newPassword: "New password", currentPassword: "Current password", url: "Repository URL", branch: "Branch", accessToken: "Access token", token: "Link" };
  const label = labels[field] || field;
  if (first.code === "too_small" && /password/i.test(field)) return label + " must be at least " + first.minimum + " characters.";
  if (first.code === "too_big") return (label || "Value") + " is too long.";
  if (field === "email") return "Enter a valid email address.";
  if (field === "url") return "Enter a valid HTTPS repository URL.";
  if (field === "token") return "This link is incomplete. Open the full link from your email.";
  return label ? label + ": " + (first.message || "is invalid.") : first.message || "";
}

export async function api(path, { method = "GET", body, timeout = 25000, headers = {}, signal } = {}) {
  const h = new Headers(headers);
  h.set("Accept", "application/json");
  if (body !== undefined) h.set("Content-Type", "application/json");
  const verb = method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(verb)) {
    const token = csrfToken || readCookie(CSRF_COOKIE);
    if (token) h.set(CSRF_HEADER, token);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let response;
  try {
    response = await fetch(apiBase() + path, {
      method: verb,
      headers: h,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (error && error.name === "AbortError") {
      if (signal && signal.aborted) throw new ApiError("Request cancelled.", { code: "ABORTED" });
      throw new ApiError("The server took too long to respond. It may be waking up — try again in a moment.", { code: "TIMEOUT" });
    }
    throw new ApiError("Can't reach the server. Check your connection and try again.", { code: "NETWORK" });
  }
  clearTimeout(timer);

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (data && typeof data.csrfToken === "string" && data.csrfToken) csrfToken = data.csrfToken;

  if (!response.ok) {
    const err = (data && data.error) || {};
    const code = err.code || "HTTP_" + response.status;
    let message = err.message || "Request failed (" + response.status + ").";
    if (code === "VALIDATION_ERROR") message = describeIssues(err.issues) || message;
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after") || 0);
      message = "Too many requests right now." + (retry > 0 ? " Try again in " + retry + " seconds." : " Try again shortly.");
      throw new ApiError(message, { status: 429, code: "RATE_LIMITED", retryAfter: retry });
    }
    if (response.status === 401 && code === "AUTH_REQUIRED" && !path.startsWith("/api/auth/")) {
      csrfToken = "";
      listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    }
    if (response.status >= 500 && !err.message) message = "The server hit an unexpected error. Try again.";
    throw new ApiError(message, { status: response.status, code, issues: err.issues || null, details: err });
  }

  if (data === null || typeof data !== "object") {
    throw new ApiError("The server returned an unexpected response.", { status: response.status, code: "BAD_RESPONSE" });
  }
  return data;
}

export async function publicCheck(path) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(apiBase() + path, { headers: { Accept: "application/json" }, signal: controller.signal });
    clearTimeout(timer);
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// One-time legacy workspace migration: older browsers stored a shared API key in sessionStorage.
// It is accepted only by /api/auth/migrate-legacy, then removed.
export function legacyMigrationKey() {
  return session.get("autopsy.key");
}

export function clearLegacyMigrationKey() {
  session.remove("autopsy.key");
  session.remove("autopsy.aiKey");
}
