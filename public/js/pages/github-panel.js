// "Import from GitHub" panel on the Projects page: connect GitHub, browse the
// account's repositories (owned, collaborator and organisation), search/filter
// them, and import one with a single click. Already-imported repositories open
// directly instead of being imported twice.

import { api, ApiError, githubStartUrl, GITHUB_OAUTH_MESSAGES } from "../core/api.js";
import { getState } from "../core/store.js";
import { href, go } from "../core/router.js";
import { esc, relative, num, debounce } from "../core/util.js";
import { icon } from "../ui/icons.js";
import { toast, notice } from "../ui/components.js";
import { GITHUB_MARK } from "./auth.js";

export async function mountGitHubPanel(host, { oauthCode = "", justConnected = false } = {}) {
  let status;
  try {
    status = await api("/api/github/status");
  } catch {
    host.innerHTML = "";
    return;
  }
  if (!status.enabled) { host.innerHTML = ""; return; }

  const next = "#/projects";
  const connectUrl = githubStartUrl({ intent: "connect", access: "public", next });
  const privateUrl = githubStartUrl({ intent: "connect", access: "private", next });
  const errorNote = oauthCode
    ? notice({ tone: "bad", title: "GitHub connection didn't complete", body: esc(GITHUB_OAUTH_MESSAGES[oauthCode] || "Try connecting again.") })
    : "";

  if (!status.connected) {
    host.innerHTML = `
      ${errorNote}
      <section class="card raised gh-panel" aria-labelledby="ghTitle">
        <div class="gh-connect">
          <span class="gh-mark">${GITHUB_MARK}</span>
          <div style="min-width:0;flex:1">
            <div class="eyebrow">Import from GitHub</div>
            <h2 id="ghTitle" style="font-size:22px;margin-top:6px">Pick a repository instead of pasting a URL</h2>
            <p class="muted" style="margin-top:6px;font-size:14.5px">Connect GitHub to list your own, collaborator and organisation repositories and import any of them in one click. Public access only reads your profile, verified email and public repositories.</p>
          </div>
          <a class="btn primary lg" href="${esc(connectUrl)}">${GITHUB_MARK}Connect GitHub</a>
        </div>
      </section>`;
    return;
  }

  const gh = status.github;
  const state = { page: 0, hasMore: true, repos: [], loading: false, query: "", filter: "all", privateAccess: gh.privateRepositories };

  host.innerHTML = `
    ${errorNote}
    <section class="card raised gh-panel" aria-labelledby="ghTitle">
      <div class="gh-head">
        <div class="row gap-12" style="min-width:0">
          ${gh.avatarUrl ? `<img class="gh-avatar" src="${esc(gh.avatarUrl)}" alt="" width="40" height="40" referrerpolicy="no-referrer">` : `<span class="gh-mark">${GITHUB_MARK}</span>`}
          <div style="min-width:0">
            <div class="eyebrow">Import from GitHub</div>
            <h2 id="ghTitle" style="font-size:20px;margin-top:4px">Your repositories <span class="dim mono" style="font-size:13px;font-weight:500">@${esc(gh.login)}</span></h2>
          </div>
        </div>
        <div class="row wrap gap-8">
          ${state.privateAccess ? '<span class="pill good">' + icon("lock") + "Private access on</span>" : `<a class="btn sm" href="${esc(privateUrl)}" title="Grants the repo scope so private repositories can be listed and cloned">${icon("lock")}Include private repos</a>`}
        </div>
      </div>
      <div class="gh-tools">
        <div style="position:relative;flex:1;min-width:200px">
          <label class="sr-only" for="ghSearch">Search your GitHub repositories</label>
          <input class="input" id="ghSearch" type="search" placeholder="Search by name, owner or language…" autocomplete="off" spellcheck="false" style="padding-left:38px;min-height:42px;border-radius:999px;font-size:14.5px">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--muted)">${icon("search")}</span>
        </div>
        <div class="row gap-4" role="group" aria-label="Filter repositories">
          ${["all", "public", "private", "imported"].map((f) => `<button class="chip${f === "all" ? " active" : ""}" type="button" data-gh-filter="${f}" aria-pressed="${f === "all"}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}
        </div>
      </div>
      <ul class="gh-list" id="ghList" aria-live="polite"><li class="gh-empty"><div class="skel" style="height:56px;width:100%"></div></li></ul>
      <div class="card-foot" id="ghFoot"></div>
    </section>`;

  if (justConnected) toast("GitHub connected as @" + gh.login, "good");

  const list = host.querySelector("#ghList");
  const foot = host.querySelector("#ghFoot");

  function visible() {
    const q = state.query.toLowerCase();
    return state.repos.filter((r) => {
      if (state.filter === "public" && r.private) return false;
      if (state.filter === "private" && !r.private) return false;
      if (state.filter === "imported" && !r.importedRepositoryId) return false;
      return !q || (r.fullName + " " + (r.language || "") + " " + (r.description || "")).toLowerCase().includes(q);
    });
  }

  function row(r) {
    const action = r.importedRepositoryId
      ? `<a class="btn sm" href="${href("workspace", { repoId: r.importedRepositoryId })}">Open ${icon("arrowRight")}</a>`
      : `<button class="btn sm primary" type="button" data-gh-import="${esc(r.fullName)}"${r.archived ? ' title="Archived repositories can still be analyzed"' : ""}>Import</button>`;
    return `<li class="gh-row">
      <div style="min-width:0;flex:1">
        <div class="row gap-8" style="flex-wrap:wrap">
          <span class="gh-name">${esc(r.owner)}/<b>${esc(r.name)}</b></span>
          ${r.private ? '<span class="pill">' + icon("lock") + "Private</span>" : ""}
          ${r.fork ? '<span class="pill">Fork</span>' : ""}
          ${r.archived ? '<span class="pill warn">Archived</span>' : ""}
          ${r.importedRepositoryId ? '<span class="pill good">' + icon("check") + "Imported</span>" : ""}
        </div>
        ${r.description ? `<p class="gh-desc">${esc(r.description)}</p>` : ""}
        <div class="gh-meta">
          ${r.language ? `<span><i class="gh-lang"></i>${esc(r.language)}</span>` : ""}
          ${r.stars ? `<span>★ ${num(r.stars)}</span>` : ""}
          ${r.pushedAt ? `<span>Updated ${esc(relative(r.pushedAt))}</span>` : ""}
          <span class="mono">${esc(r.defaultBranch || "")}</span>
        </div>
      </div>
      <div class="gh-action">${action}</div>
    </li>`;
  }

  function paint() {
    const rows = visible();
    if (!state.repos.length && !state.loading) {
      list.innerHTML = `<li class="gh-empty">No repositories found for @${esc(gh.login)}.${state.privateAccess ? "" : " Private repositories appear after you include private access."}</li>`;
    } else if (!rows.length && !state.loading) {
      list.innerHTML = `<li class="gh-empty">No repositories match this filter${state.hasMore ? " in the loaded list — load more below" : ""}.</li>`;
    } else {
      list.innerHTML = rows.map(row).join("");
    }
    foot.innerHTML = `<span>${num(rows.length)} shown · ${num(state.repos.length)} loaded</span>` +
      (state.hasMore ? `<button class="btn sm" type="button" data-gh-more ${state.loading ? "disabled aria-busy=\"true\"" : ""}>Load more</button>` : "");
  }

  async function loadPage() {
    if (state.loading || !state.hasMore) return;
    state.loading = true;
    paint();
    try {
      const body = await api("/api/github/repos?page=" + (state.page + 1));
      state.page = body.page;
      state.hasMore = body.hasMore;
      state.repos = state.repos.concat(body.repositories || []);
    } catch (error) {
      state.hasMore = false;
      if (error instanceof ApiError && error.code === "GITHUB_RECONNECT_REQUIRED") {
        list.innerHTML = `<li class="gh-empty">${esc(error.message)} <a class="link-btn" href="${esc(connectUrl)}">Reconnect GitHub</a></li>`;
        state.loading = false;
        foot.innerHTML = "";
        return;
      }
      toast(error.message, "bad");
    }
    state.loading = false;
    paint();
  }

  host.querySelector("#ghSearch").addEventListener("input", debounce((e) => { state.query = e.target.value.trim(); paint(); }, 120));
  host.addEventListener("click", async (event) => {
    const filterBtn = event.target.closest("[data-gh-filter]");
    if (filterBtn) {
      state.filter = filterBtn.getAttribute("data-gh-filter");
      host.querySelectorAll("[data-gh-filter]").forEach((b) => { const on = b === filterBtn; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
      paint();
      return;
    }
    if (event.target.closest("[data-gh-more]")) { loadPage(); return; }
    const importBtn = event.target.closest("[data-gh-import]");
    if (importBtn) {
      const fullName = importBtn.getAttribute("data-gh-import");
      importBtn.disabled = true;
      importBtn.setAttribute("aria-busy", "true");
      importBtn.textContent = "Importing";
      try {
        const body = await api("/api/github/import", { method: "POST", body: { fullName } });
        getState().repositories = null;
        toast("Analysis started for " + fullName, "good");
        go(href("workspace", { repoId: body.repository.id, phase: "overview" }));
      } catch (error) {
        if (error instanceof ApiError && error.code === "REPOSITORY_ALREADY_IMPORTED" && error.details && error.details.repositoryId) {
          go(href("workspace", { repoId: error.details.repositoryId }));
          return;
        }
        importBtn.disabled = false;
        importBtn.removeAttribute("aria-busy");
        importBtn.textContent = "Import";
        toast(error.code === "REPOSITORY_ACCESS_NOT_CONFIGURED"
          ? "Private repositories need the server's credential encryption key, which isn't configured."
          : error.message, "bad");
      }
    }
  });

  paint();
  await loadPage();
}
