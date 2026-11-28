// Application state: the signed-in account, the active repository, its analysis
// runs, and a per-run evidence cache so phases never mix data from different snapshots.

import { api, setCsrf, clearCsrf, ApiError } from "./api.js";

const state = {
  user: null,
  authChecked: false,
  repositories: null,
  repo: null,
  runs: null,
  activeRun: null,
  latestCompleted: null,
  cache: new Map(),
  inflight: new Map()
};

const subscribers = new Set();
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
function emit(kind) {
  subscribers.forEach((fn) => { try { fn(kind); } catch (e) { console.error(e); } });
}

export function getState() {
  return state;
}

// ---------- Auth ----------

export async function checkSession() {
  try {
    const body = await api("/api/auth/me");
    state.user = body.user || null;
    setCsrf(body.csrfToken);
  } catch (error) {
    state.user = null;
    if (!(error instanceof ApiError) || (error.status !== 401 && error.code !== "AUTH_REQUIRED")) {
      state.authChecked = true;
      throw error;
    }
  }
  state.authChecked = true;
  emit("auth");
  return state.user;
}

export function setUser(user, csrf) {
  state.user = user ? { id: user.id, email: user.email } : null;
  if (csrf) setCsrf(csrf);
  state.authChecked = true;
  emit("auth");
}

export function signedOut() {
  state.user = null;
  state.repositories = null;
  clearRepo();
  clearCsrf();
  emit("auth");
}

// ---------- Repositories ----------

export async function loadRepositories(force = false) {
  if (state.repositories && !force) return state.repositories;
  const body = await api("/api/repositories");
  state.repositories = Array.isArray(body.repositories) ? body.repositories : [];
  emit("repos");
  return state.repositories;
}

export function clearRepo() {
  state.repo = null;
  state.runs = null;
  state.activeRun = null;
  state.latestCompleted = null;
  state.cache.clear();
  state.inflight.clear();
}

export async function openRepository(repoId, { force = false } = {}) {
  if (!force && state.repo && state.repo.id === repoId && state.runs) return state.repo;
  if (!state.repo || state.repo.id !== repoId) clearRepo();
  const [repoBody, runsBody] = await Promise.all([
    api("/api/repositories/" + encodeURIComponent(repoId)),
    api("/api/repositories/" + encodeURIComponent(repoId) + "/analysis-runs?page=1&limit=20")
  ]);
  state.repo = repoBody.repository;
  applyRuns(runsBody.runs || []);
  emit("repo");
  return state.repo;
}

function applyRuns(runs) {
  const previousCompleted = state.latestCompleted && state.latestCompleted.id;
  state.runs = runs;
  state.activeRun = runs.find((r) => r.status === "queued" || r.status === "running") || null;
  state.latestCompleted = runs.find((r) => r.status === "completed") || null;
  if (previousCompleted && (!state.latestCompleted || state.latestCompleted.id !== previousCompleted)) {
    state.cache.clear();
  }
}

export async function refreshRuns() {
  if (!state.repo) return;
  const body = await api("/api/repositories/" + encodeURIComponent(state.repo.id) + "/analysis-runs?page=1&limit=20");
  applyRuns(body.runs || []);
  emit("runs");
}

export async function refreshRepo() {
  if (!state.repo) return;
  const body = await api("/api/repositories/" + encodeURIComponent(state.repo.id));
  state.repo = body.repository;
  emit("repo");
}

export function latestRun() {
  return state.runs && state.runs.length ? state.runs[0] : null;
}

// A snapshot is "current" when the latest completed run analysed the repository's stored head.
export function snapshotStatus() {
  const repo = state.repo;
  const done = state.latestCompleted;
  const latest = latestRun();
  if (state.activeRun) return { tone: "warn", label: "Analysis running", current: false, running: true };
  if (!done) {
    if (latest && latest.status === "failed") return { tone: "bad", label: "Analysis failed", current: false, failed: true };
    return { tone: "warn", label: "No snapshot yet", current: false };
  }
  const current = !!(repo && repo.head_sha && done.targetHeadSha && repo.head_sha.toLowerCase() === done.targetHeadSha.toLowerCase());
  if (latest && latest.status === "failed" && latest.id !== done.id) return { tone: "warn", label: "Last refresh failed", current, failedRefresh: true };
  return current ? { tone: "good", label: "Snapshot current", current: true } : { tone: "warn", label: "Snapshot stale", current: false };
}

// ---------- Evidence loading (cached per completed run) ----------

export function endpoint(key, repoId, params = {}) {
  const base = "/api/repositories/" + encodeURIComponent(repoId);
  const q = (obj) => {
    const s = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") s.set(k, String(v)); });
    const str = s.toString();
    return str ? "?" + str : "";
  };
  const map = {
    commits: base + "/commits" + q({ page: params.page || 1, limit: params.limit || 50 }),
    timeline: base + "/timeline" + q({ page: params.page || 1, limit: params.limit || 50 }),
    hotspots: base + "/hotspots" + q({ limit: params.limit || 25 }),
    repeated: base + "/repeatedly-modified-files" + q({ minTouches: 3, limit: params.limit || 25 }),
    bugs: base + "/repeated-bug-areas" + q({ limit: params.limit || 25 }),
    coupling: base + "/coupling" + q({ minCoChanges: 2, limit: params.limit || 40 }),
    refactors: base + "/refactors" + q({ limit: params.limit || 25 }),
    dependencies: base + "/dependencies" + q({ limit: params.limit || 100 }),
    architecture: base + "/architecture" + q({ limit: params.limit || 100 }),
    migrations: base + "/database-migrations" + q({ limit: params.limit || 100 }),
    tests: base + "/test-evolution" + q({ limit: params.limit || 100 }),
    testSummary: base + "/test-evolution/summary",
    complexity: base + "/complexity" + q({ limit: params.limit || 100 }),
    contributors: base + "/contributors" + q({ limit: params.limit || 50 }),
    runtime: base + "/runtime/telemetry/summary" + q({ groupBy: params.groupBy || "revision" }),
    runtimeEvents: base + "/runtime/telemetry" + q({ page: params.page || 1, limit: params.limit || 40 }),
    deployments: base + "/deployments" + q({ limit: params.limit || 50 }),
    historicalSummary: base + "/runtime/historical-correlation/summary" + q({ limit: 25 }),
    report: base + "/report" + q({ limit: params.limit || 10 }),
    interview: base + "/interview-stories" + q({ limit: 6 }),
    interpretation: base + "/interpretation" + q({ limit: 10 })
  };
  return map[key];
}

function cacheKey(key, params) {
  const run = state.latestCompleted ? state.latestCompleted.id : "none";
  return run + "|" + key + "|" + JSON.stringify(params || {});
}

export function cached(key, params) {
  return state.cache.get(cacheKey(key, params));
}

export async function load(key, params = {}, { force = false } = {}) {
  if (!state.repo) throw new ApiError("No repository selected.", { code: "NO_REPO" });
  const ck = cacheKey(key, params);
  if (!force && state.cache.has(ck)) return state.cache.get(ck);
  if (!force && state.inflight.has(ck)) return state.inflight.get(ck);
  const repoId = state.repo.id;
  const promise = api(endpoint(key, repoId, params), { timeout: key === "interpretation" ? 60000 : 30000 })
    .then((body) => {
      if (state.repo && state.repo.id === repoId) state.cache.set(ck, body);
      return body;
    })
    .finally(() => state.inflight.delete(ck));
  state.inflight.set(ck, promise);
  return promise;
}

export async function loadMany(keys) {
  const results = await Promise.allSettled(keys.map((k) => (Array.isArray(k) ? load(k[0], k[1]) : load(k))));
  const out = {};
  const errors = {};
  keys.forEach((k, i) => {
    const name = Array.isArray(k) ? k[2] || k[0] : k;
    if (results[i].status === "fulfilled") out[name] = results[i].value;
    else errors[name] = results[i].reason;
  });
  return { data: out, errors };
}

export function invalidate(keyPrefix) {
  for (const k of [...state.cache.keys()]) {
    if (!keyPrefix || k.split("|")[1] === keyPrefix) state.cache.delete(k);
  }
}
