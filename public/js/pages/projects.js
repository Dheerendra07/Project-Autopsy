// Projects: start a new analysis and open existing repositories.

import { api, ApiError } from "../core/api.js";
import { loadRepositories, getState } from "../core/store.js";
import { href, go } from "../core/router.js";
import { esc, relative, shortSha, hostOf, repoLabel, initials } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { toast, notice, empty } from "../ui/components.js";
import { demo, mountDemos } from "../ui/player.js";
import { mountGitHubPanel } from "./github-panel.js";

// Mirrors Git's ref-name rules (no lookbehind, so older iOS Safari can parse it).
function isValidBranch(name) {
  if (!name || name.length > 255) return false;
  if (/[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)) return false;
  if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
  if (name.includes("..") || name.includes("//") || name.includes("@{")) return false;
  return !name.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"));
}
const BRANCH_RE = { test: isValidBranch };

export async function renderProjects(view, route) {
  const prefill = route.query && route.query.url ? String(route.query.url).slice(0, 2048) : "";
  view.innerHTML = `
    <div class="container" style="padding-top:clamp(24px,4vw,48px);padding-bottom:calc(64px + var(--safe-bottom))">
      <div class="page-head">
        <div class="t">
          <div class="num">WORKSPACE</div>
          <h1>Your projects</h1>
          <p>Start a new analysis or reopen a repository you've already reconstructed.</p>
        </div>
      </div>

      <div id="githubPanel" style="margin-bottom:18px"></div>

      <div class="grid" style="grid-template-columns:minmax(0,7fr) minmax(0,5fr);align-items:start" id="projTop">
        <section class="card raised import-card" aria-labelledby="importTitle">
          <div class="eyebrow">New analysis</div>
          <h2 id="importTitle" style="font-size:24px;letter-spacing:-0.03em;margin-top:8px">Analyze a repository</h2>
          <p class="muted" style="margin-top:6px;font-size:14.5px">Public or private HTTPS repositories on GitHub, GitLab or Bitbucket. The full history is cloned once, then analyzed in eleven stages.</p>
          <form id="importForm" novalidate>
            <div class="form-error" id="importError" role="alert" hidden></div>
            <div class="import-row">
              <label class="field"><span>Repository URL</span>
                <input class="input mono" id="url" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://github.com/owner/repository" required value="${esc(prefill)}">
              </label>
              <label class="field"><span>Branch <small>optional</small></span>
                <input class="input mono" id="branch" name="branch" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="default branch" maxlength="255">
              </label>
            </div>
            <details class="adv">
              <summary>Private repository access</summary>
              <div>
                <label class="field"><span>Read-only access token <small>never shown again</small></span>
                  <input class="input mono" id="repoAccessToken" name="accessToken" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="ghp_… / glpat-… / app password">
                  <small>Use a token with read-only repository access. It is encrypted at rest, excluded from job payloads, and can be rotated later in repository settings.</small>
                </label>
              </div>
            </details>
            <div class="row wrap" style="justify-content:space-between;gap:12px;margin-top:4px">
              <span class="hint">${icon("shield").replace("<svg", '<svg style="width:14px;height:14px;display:inline;vertical-align:-2px;margin-right:6px"')}Only HTTPS remotes on supported hosts are accepted.</span>
              <button class="btn primary lg" type="submit" id="importButton">Start analysis ${icon("arrowRight")}</button>
            </div>
          </form>
        </section>
        <aside class="card" style="padding:12px;border-radius:var(--r-lg)">
          ${demo("import", { compact: true })}
        </aside>
      </div>

      <section style="margin-top:36px" aria-labelledby="listTitle">
        <div class="row" style="justify-content:space-between;margin-bottom:14px;flex-wrap:wrap">
          <h2 id="listTitle" style="font-size:20px;letter-spacing:-0.025em">Repositories</h2>
          <span class="dim" id="repoCount" style="font-size:13px"></span>
        </div>
        <div id="repoList"><div class="projects-grid">${'<div class="card skel" style="height:150px"></div>'.repeat(3)}</div></div>
      </section>
    </div>`;

  // Collapse to one column on small screens.
  const top = view.querySelector("#projTop");
  const mq = matchMedia("(max-width: 960px)");
  const applyCols = () => { top.style.gridTemplateColumns = mq.matches ? "minmax(0,1fr)" : "minmax(0,7fr) minmax(0,5fr)"; };
  applyCols();
  mq.addEventListener("change", applyCols);
  mountDemos(view);

  const form = view.querySelector("#importForm");
  const errorEl = view.querySelector("#importError");
  const button = view.querySelector("#importButton");
  const showError = (msg) => { errorEl.innerHTML = icon("alert").replace("<svg", '<svg style="width:16px;height:16px;flex:none;margin-top:2px"') + "<span>" + esc(msg) + "</span>"; errorEl.hidden = false; };
  form.addEventListener("input", (e) => { e.target.removeAttribute("aria-invalid"); errorEl.hidden = true; });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const urlInput = view.querySelector("#url");
    const branchInput = view.querySelector("#branch");
    const tokenInput = view.querySelector("#repoAccessToken");
    const url = urlInput.value.trim();
    const branch = branchInput.value.trim();
    const accessToken = tokenInput.value.trim();
    let parsed;
    try { parsed = new URL(url); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== "https:") {
      urlInput.setAttribute("aria-invalid", "true");
      urlInput.focus();
      return showError("Enter the repository's HTTPS URL, for example https://github.com/owner/repository.");
    }
    if (parsed.username || parsed.password) {
      urlInput.setAttribute("aria-invalid", "true");
      return showError("Remove credentials from the URL. Use the private access token field instead.");
    }
    if (branch && !BRANCH_RE.test(branch)) {
      branchInput.setAttribute("aria-invalid", "true");
      branchInput.focus();
      return showError("That branch name isn't valid in Git.");
    }
    const payload = { url };
    if (branch) payload.branch = branch;
    if (accessToken) payload.accessToken = accessToken;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Starting…";
    try {
      const body = await api("/api/repositories/import", { method: "POST", body: payload });
      tokenInput.value = "";
      getState().repositories = null;
      toast("Analysis started for " + body.repository.name, "good");
      go(href("workspace", { repoId: body.repository.id, phase: "overview" }));
    } catch (error) {
      const msg = error instanceof ApiError && error.code === "REPOSITORY_ACCESS_NOT_CONFIGURED"
        ? "Private repository tokens aren't enabled on this server (encryption key missing). Import a public repository, or ask the operator to configure it."
        : error.message;
      showError(msg);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = "Start analysis " + icon("arrowRight");
    }
  });

  if (prefill) setTimeout(() => button.focus(), 50);

  // GitHub picker (only when the server has GitHub OAuth configured).
  mountGitHubPanel(view.querySelector("#githubPanel"), {
    oauthCode: route.query && route.query.oauth ? String(route.query.oauth) : "",
    justConnected: !!(route.query && route.query.github === "connected")
  });
  if (route.query && (route.query.github || route.query.oauth)) {
    history.replaceState(null, "", location.pathname + location.search + "#/projects");
  }

  // Repository list
  const list = view.querySelector("#repoList");
  try {
    const repos = await loadRepositories(true);
    view.querySelector("#repoCount").textContent = repos.length ? repos.length + (repos.length === 1 ? " repository" : " repositories") : "";
    if (!repos.length) {
      list.innerHTML = '<div class="card">' + empty({ iconName: "folder", title: "No repositories yet", body: "Paste a repository URL above. Your first analysis usually takes a few minutes, depending on history size." }) + "</div>";
    } else {
      list.innerHTML = '<div class="projects-grid">' + repos.map((r) => `
        <a class="card project-card" href="${href("workspace", { repoId: r.id })}">
          <div class="top">
            <span class="repo-avatar">${esc(initials(r.name))}</span>
            <div style="min-width:0">
              <div class="name truncate">${esc(r.name)}</div>
              <div class="src truncate">${esc(repoLabel(r.sourceUrl, r.name))}</div>
            </div>
          </div>
          <div class="row wrap gap-8">
            <span class="pill">${icon("git").replace("<svg", '<svg style="width:12px;height:12px"')}${esc(hostOf(r.sourceUrl) || "git")}</span>
            ${r.trackedBranch ? `<span class="pill mono">${esc(r.trackedBranch)}</span>` : ""}
            ${r.headSha ? `<span class="pill mono">${esc(shortSha(r.headSha))}</span>` : '<span class="pill warn">importing</span>'}
          </div>
          <div class="foot"><span>Updated ${esc(relative(r.updatedAt))}</span><span class="row gap-4" style="color:var(--ink);font-weight:500">Open ${icon("arrowRight").replace("<svg", '<svg style="width:14px;height:14px"')}</span></div>
        </a>`).join("") + "</div>";
    }
  } catch (error) {
    list.innerHTML = notice({ tone: "bad", title: "Couldn't load your repositories", body: esc(error.message), actions: '<button class="btn sm" type="button" data-retry>Retry</button>' });
    list.querySelector("[data-retry]").addEventListener("click", () => renderProjects(view, route));
  }
  return () => mq.removeEventListener("change", applyCols);
}
