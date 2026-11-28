// Hash router. Routes:
//   #/                      home
//   #/signin #/signup #/forgot #/reset/:token
//   #/projects              project list + import
//   #/p/:repoId/:phase      workspace phase
//   #/account               account & security
// Email links arrive as #auth-verify=<token> and #auth-reset=<token>.

export function parse(hash = location.hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (raw.startsWith("auth-verify=")) return { name: "verify", token: decodeToken(raw.slice(12)) };
  if (raw.startsWith("auth-reset=")) return { name: "reset", token: decodeToken(raw.slice(11)) };
  const [pathPart, queryPart = ""] = raw.split("?");
  const parts = pathPart.replace(/^\/+/, "").split("/").filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  if (!parts.length) return { name: "home", query };
  const [head, a, b] = parts;
  switch (head) {
    case "signin": return { name: "signin", query };
    case "signup": return { name: "signup", query };
    case "forgot": return { name: "forgot", query };
    case "reset": return { name: "reset", token: a || "", query };
    case "verify": return { name: "verify", token: a || "", query };
    case "projects": return { name: "projects", query };
    case "account": return { name: "account", query };
    case "p": return a ? { name: "workspace", repoId: a, phase: b || "overview", query } : { name: "projects", query };
    default: return { name: "notfound", query };
  }
}

function decodeToken(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function href(name, params = {}) {
  switch (name) {
    case "home": return "#/";
    case "signin": return "#/signin" + (params.next ? "?next=" + encodeURIComponent(params.next) : "");
    case "signup": return "#/signup" + (params.next ? "?next=" + encodeURIComponent(params.next) : "");
    case "forgot": return "#/forgot";
    case "projects": return "#/projects" + (params.url ? "?url=" + encodeURIComponent(params.url) : "");
    case "account": return "#/account";
    case "workspace": return "#/p/" + encodeURIComponent(params.repoId) + "/" + (params.phase || "overview");
    default: return "#/";
  }
}

export function go(target, { replace = false } = {}) {
  const next = target.startsWith("#") ? target : "#" + target;
  if (replace) {
    history.replaceState(null, "", location.pathname + location.search + next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (location.hash === next) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = next;
  }
}

// Only allow in-app hash targets as post-sign-in destinations.
export function safeNext(value) {
  const v = String(value || "");
  return /^#\/(projects|account|p\/[0-9a-f-]{36}(\/[a-z]+)?)(\?.*)?$/i.test(v) ? v : "";
}
