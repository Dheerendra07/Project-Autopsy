// Small, dependency-free helpers shared by every page.

export function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function num(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return numberFormat.format(Number(value));
}

export function compact(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return Math.abs(n) < 10000 ? numberFormat.format(n) : compactFormat.format(n);
}

export function signed(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return (n > 0 ? "+" : "") + numberFormat.format(n);
}

export function pct(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return (Number(value) * 100).toFixed(digits) + "%";
}

export function ms(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return n >= 1000 ? (n / 1000).toFixed(2) + " s" : Math.round(n) + " ms";
}

export function date(value, withTime = false) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, withTime
    ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" });
}

export function relative(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = (Date.now() - d.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [unit, secs] of units) {
    if (abs >= secs || unit === "second") return rtf.format(-Math.round(diff / secs), unit);
  }
  return "—";
}

export function duration(start, end) {
  if (!start) return "—";
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(a) || Number.isNaN(b)) return "—";
  const s = Math.max(0, Math.round((b - a) / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + (s % 60) + "s";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

export function shortSha(value) {
  return value ? String(value).slice(0, 8) : "—";
}

export function initials(name) {
  const clean = String(name || "?").replace(/[^a-z0-9]+/gi, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

export function plural(n, word, suffix = "s") {
  return num(n) + " " + word + (Number(n) === 1 ? "" : suffix);
}

export function debounce(fn, wait = 200) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function safeExternalUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function repoLabel(sourceUrl, fallback) {
  try {
    const u = new URL(sourceUrl);
    return u.pathname.replace(/^\/+|\.git$|\/+$/g, "") || fallback || u.hostname;
  } catch {
    return fallback || "repository";
  }
}

export function hostOf(sourceUrl) {
  try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

export function downloadText(filename, text, type = "text/markdown") {
  const blob = new Blob([text], { type: type + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

// Storage wrappers: storage can be unavailable (private mode, blocked site data).
export const local = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
};

export const session = {
  get(key) {
    try { return sessionStorage.getItem(key) || ""; } catch { return ""; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  }
};

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 1);
}
