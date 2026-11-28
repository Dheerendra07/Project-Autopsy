// Entry point: boots the session, owns the top bar, and dispatches hash routes.

import { parse, go, href, safeNext } from "./core/router.js";
import { checkSession, getState, signedOut, subscribe } from "./core/store.js";
import { api, onAuthExpired, legacyMigrationKey } from "./core/api.js";
import { esc } from "./core/util.js";
import { icon } from "./ui/icons.js";
import { toast, popover, closePopover, closeAllOverlays } from "./ui/components.js";
import { renderHome } from "./pages/home.js";
import { renderAuth } from "./pages/auth.js";
import { renderProjects } from "./pages/projects.js";
import { renderWorkspace, leaveWorkspace } from "./pages/workspace.js";
import { renderAccount } from "./pages/account.js";
import { mountAmbient } from "./ui/ambient.js";

const app = document.getElementById("app");
let currentCleanup = null;
let workspaceHandle = null;
let routeToken = 0;

function topbar(route) {
  const user = getState().user;
  const inApp = ["projects", "workspace", "account"].includes(route.name);
  const marketing = route.name === "home";
  const links = marketing
    ? '<nav class="topnav" aria-label="Sections"><a href="#/" data-scroll="how">How it works</a><a href="#/" data-scroll="phases">The 11 phases</a><a href="#/" data-scroll="outputs">Report &amp; Interview</a><a href="#/" data-scroll="principles">Principles</a></nav>'
    : "";
  let actions;
  if (user) {
    actions =
      (inApp ? "" : '<a class="btn primary sm" href="' + href("projects") + '"><span class="hide-xs">Open workspace</span><span class="show-xs">Workspace</span> ' + icon("arrowRight") + "</a>") +
      '<button class="btn icon sm" type="button" data-account-menu aria-haspopup="menu" aria-expanded="false" aria-label="Account menu" title="' + esc(user.email) + '">' + icon("user") + "</button>";
  } else {
    actions =
      '<a class="btn ghost sm hide-sm" href="' + href("signin") + '">Sign in</a>' +
      '<a class="btn primary sm" href="' + href("signup") + '">Get started</a>';
  }
  const menuBtn = marketing ? '<button class="btn icon sm ghost menu-btn" type="button" data-mobile-menu aria-label="Open menu" aria-expanded="false">' + icon("menu") + "</button>" : "";
  return (
    '<header class="topbar' + (user ? " authed" : "") + '" id="topbar"><div class="' + (inApp ? "" : "container ") + 'topbar-inner"' + (inApp ? ' style="padding:0 calc(18px + var(--safe-right)) 0 calc(18px + var(--safe-left))"' : "") + ">" +
    '<a class="brand" href="' + (user && inApp ? href("projects") : href("home")) + '" aria-label="Project Autopsy home"><span class="brand-mark">' + icon("logo") + '</span><span class="brand-text">Project Autopsy</span></a>' +
    links +
    '<div class="actions">' + actions + menuBtn + "</div>" +
    "</div></header>"
  );
}

function bindTopbar(route) {
  const bar = document.getElementById("topbar");
  if (!bar) return;
  const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 4);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  bar.addEventListener("click", (event) => {
    const scrollLink = event.target.closest("[data-scroll]");
    if (scrollLink) {
      event.preventDefault();
      const target = document.getElementById(scrollLink.getAttribute("data-scroll"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector(".mobile-menu")?.remove();
      return;
    }
    const menu = event.target.closest("[data-mobile-menu]");
    if (menu) {
      const existing = document.querySelector(".mobile-menu");
      if (existing) { existing.remove(); menu.setAttribute("aria-expanded", "false"); return; }
      const el = document.createElement("nav");
      el.className = "mobile-menu";
      el.setAttribute("aria-label", "Sections");
      el.innerHTML = bar.querySelector(".topnav").innerHTML +
        (getState().user ? '<a href="' + href("projects") + '">Open workspace</a>' : '<a href="' + href("signin") + '">Sign in</a>');
      el.addEventListener("click", (e) => {
        const s = e.target.closest("[data-scroll]");
        if (s) {
          e.preventDefault();
          document.getElementById(s.getAttribute("data-scroll"))?.scrollIntoView({ behavior: "smooth" });
        }
        el.remove();
        menu.setAttribute("aria-expanded", "false");
      });
      document.body.appendChild(el);
      menu.setAttribute("aria-expanded", "true");
      return;
    }
    const acct = event.target.closest("[data-account-menu]");
    if (acct) {
      const user = getState().user;
      popover(acct,
        '<div class="ph"><div class="eyebrow">Signed in as</div><div style="font-weight:500;margin-top:4px;word-break:break-all">' + esc(user.email) + "</div></div><hr>" +
        '<a class="pi" href="' + href("projects") + '">' + icon("folder") + "Projects</a>" +
        '<a class="pi" href="' + href("account") + '">' + icon("shield") + "Account &amp; security</a><hr>" +
        '<button class="pi" type="button" data-signout>' + icon("logout") + "Sign out</button>",
        {
          onMount(el) {
            el.setAttribute("role", "menu");
            el.addEventListener("click", async (e) => {
              if (e.target.closest("a")) { closePopover(); return; }
              if (e.target.closest("[data-signout]")) {
                closePopover();
                await signOut();
              }
            });
          }
        });
      // Position the menu flush right under the button.
      const pop = document.querySelector(".popover");
      if (pop) {
        const r = acct.getBoundingClientRect();
        pop.style.left = Math.max(12, r.right - pop.offsetWidth) + "px";
      }
    }
  });
  return () => window.removeEventListener("scroll", onScroll);
}

export async function signOut() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Even if the server session is already gone, clear local state.
  }
  signedOut();
  toast("Signed out", "good");
  go(href("home"));
}

const PROTECTED = ["projects", "workspace", "account"];

async function render() {
  const token = ++routeToken;
  const route = parse();
  closePopover();
  closeAllOverlays();
  document.querySelector(".mobile-menu")?.remove();

  if (!getState().authChecked) {
    app.innerHTML = '<div class="boot" aria-busy="true"><span class="brand-mark">' + icon("logo") + '</span><span class="sr-only">Loading Project Autopsy</span></div>';
    try {
      await checkSession();
    } catch {
      // Network/server failure: render the page; protected routes will show their own error.
    }
    if (token !== routeToken) return;
  }
  const user = getState().user;

  // Legacy workspace browsers must migrate before normal use.
  if (!user && legacyMigrationKey() && !["verify", "reset", "signin"].includes(route.name)) {
    go(href("signin"), { replace: true });
    return;
  }

  if (PROTECTED.includes(route.name) && !user) {
    const next = location.hash;
    go(href("signin", { next: safeNext(next) }), { replace: true });
    return;
  }
  if (user && ["signin", "signup", "forgot"].includes(route.name)) {
    go(safeNext(route.query && route.query.next) || href("projects"), { replace: true });
    return;
  }

  // Switching phases inside the same repository updates in place (no full re-render).
  if (route.name === "workspace" && workspaceHandle && workspaceHandle.repoId === route.repoId) {
    await workspaceHandle.update(route);
    return;
  }

  if (currentCleanup) { try { currentCleanup(); } catch { /* ignore */ } currentCleanup = null; }
  workspaceHandle = null;
  if (route.name !== "workspace") leaveWorkspace();

  const view = document.createElement("main");
  view.id = "main";
  view.tabIndex = -1;
  app.innerHTML = topbar(route);
  app.appendChild(view);
  const TITLES = { signin: "Sign in", signup: "Create account", forgot: "Reset password", reset: "Choose a new password", verify: "Verify email", projects: "Projects", account: "Account" };
  document.title = (TITLES[route.name] ? TITLES[route.name] + " — " : "") + "Project Autopsy" + (TITLES[route.name] ? "" : " — Engineering history, from evidence");
  const unbindTop = bindTopbar(route);

  let cleanup;
  try {
    switch (route.name) {
      case "home": cleanup = renderHome(view); break;
      case "signin": case "signup": case "forgot": case "reset": case "verify":
        cleanup = renderAuth(view, route); break;
      case "projects": cleanup = await renderProjects(view, route); break;
      case "workspace": {
        const handle = await renderWorkspace(view, route);
        if (handle && token === routeToken) {
          workspaceHandle = handle;
          cleanup = handle.cleanup;
        }
        break;
      }
      case "account": cleanup = await renderAccount(view, route); break;
      default:
        view.innerHTML = '<div class="container" style="padding:80px 0"><div class="card pad" style="max-width:520px;margin:0 auto;text-align:center"><div class="eyebrow">404</div><h1 style="margin-top:10px;font-size:32px">This page does not exist.</h1><p class="muted" style="margin-top:10px">The link may be outdated.</p><div style="margin-top:20px"><a class="btn primary" href="' + href(user ? "projects" : "home") + '">Go ' + (user ? "to projects" : "home") + "</a></div></div></div>";
    }
  } catch (error) {
    console.error(error);
    view.innerHTML = '<div class="container" style="padding:64px 0"><div class="card pad" style="max-width:560px;margin:0 auto"><div class="eyebrow">Something went wrong</div><h1 style="margin-top:10px;font-size:26px">This page could not load.</h1><p class="muted" style="margin-top:10px">' + esc(error && error.message ? error.message : "Unexpected error.") + '</p><div style="margin-top:20px;display:flex;gap:8px"><button class="btn primary" type="button" data-retry>Try again</button><a class="btn" href="' + href(user ? "projects" : "home") + '">Back</a></div></div></div>';
    view.querySelector("[data-retry]")?.addEventListener("click", () => render());
  }
  currentCleanup = () => {
    if (typeof cleanup === "function") cleanup();
    if (unbindTop) unbindTop();
  };
}

window.addEventListener("hashchange", () => {
  const route = parse();
  // In-workspace phase switches keep scroll handling inside the workspace module.
  render().then(() => {
    if (route.name !== "workspace") window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  });
});

let expiredNotified = false;
onAuthExpired(() => {
  if (expiredNotified) return;
  expiredNotified = true;
  setTimeout(() => (expiredNotified = false), 4000);
  signedOut();
  toast("Your session ended. Sign in again to continue.", "warn");
  const next = safeNext(location.hash);
  go(href("signin", { next }), { replace: true });
});

subscribe((kind) => {
  if (kind !== "auth") return;
  const bar = document.getElementById("topbar");
  if (bar && !bar.querySelector("[data-account-menu]") === !!getState().user) {
    // Auth state changed while the page stayed mounted; re-render the top bar.
    const route = parse();
    const fresh = document.createElement("div");
    fresh.innerHTML = topbar(route);
    bar.replaceWith(fresh.firstChild);
    bindTopbar(route);
  }
});

document.addEventListener("click", (event) => {
  const skip = event.target.closest(".skip-link");
  if (skip) {
    event.preventDefault();
    const main = document.getElementById("main");
    if (main) main.focus();
  }
});

mountAmbient();
render();
