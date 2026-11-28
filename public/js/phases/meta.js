// The eleven workspace phases. One definition drives the sidebar, mobile phase bar,
// homepage phase grid, guide cards and pager, so they can never drift apart.

export const GROUPS = [
  { id: "understand", label: "Understand" },
  { id: "validate", label: "Validate" },
  { id: "outputs", label: "Prepare" },
  { id: "explore", label: "Explore" },
  { id: "operate", label: "Operate" }
];

export const PHASES = [
  {
    id: "overview", n: "01", title: "Overview", group: "understand", icon: "overview",
    question: "What is this project, at a glance?",
    summary: "Snapshot status, history size, the busiest files and the people behind them.",
    uses: ["Commit totals and the latest commits", "Analysis run history and snapshot freshness", "Top hotspots and contributors"],
    guide: [
      "Confirm the snapshot badge says current before relying on any number.",
      "Scan totals and the most-changed files to see where work concentrates.",
      "Open Report for a full write-up or Interview to prepare answers."
    ]
  },
  {
    id: "history", n: "02", title: "History", group: "understand", icon: "history",
    question: "What changed, and when?",
    summary: "Every persisted commit and a typed timeline of feature, fix, refactor, test and dependency work.",
    uses: ["Paginated commit list with additions and deletions", "Timeline labels from commit-subject keywords"],
    guide: [
      "Commits are listed newest first; load more pages as you scroll.",
      "Timeline labels come from commit-subject keywords — they are hints, not intent.",
      "Filter by type or search, then inspect any row for its exact record."
    ]
  },
  {
    id: "structure", n: "03", title: "Structure", group: "understand", icon: "structure",
    question: "How did the codebase take shape?",
    summary: "Directory evolution, dependency changes, complexity deltas and files that change together.",
    uses: ["Top-level and src/ directory events", "package.json dependency changes", "AST complexity before/after", "Co-change pairs"],
    guide: [
      "Architecture events show when top-level and src/ directories appeared or disappeared.",
      "Dependency rows show what changed in package.json and in which commit.",
      "Co-change pairs reveal files that are edited together — a coupling signal, not a dependency."
    ]
  },
  {
    id: "quality", n: "04", title: "Quality", group: "validate", icon: "quality",
    question: "Where does quality need attention?",
    summary: "Fix-labeled hotspots, repeatedly modified files, refactor signals, schema migrations and test evolution.",
    uses: ["Repeated bug-signal areas", "Repeatedly modified files", "Refactor signals", "Database migrations", "Test-source evolution"],
    guide: [
      "Areas with two or more fix-labeled commits are leads to investigate, not proven bugs.",
      "Repeated edits and refactor signals show where effort keeps returning.",
      "Migrations and test changes are parsed from source — not from executed runs."
    ]
  },
  {
    id: "runtime", n: "05", title: "Runtime", group: "validate", icon: "runtime",
    question: "What did production actually observe?",
    summary: "Telemetry and deployment records you send, aligned to exact revisions without causal guesses.",
    uses: ["Runtime telemetry summary by revision", "Deployment evidence", "Historical before/after windows"],
    guide: [
      "This phase fills only when your systems send telemetry or deployment events.",
      "Deployments link observations to the exact revision that was shipped.",
      "Before/after windows describe what was observed — they never claim a cause."
    ]
  },
  {
    id: "report", n: "06", title: "Report", group: "outputs", icon: "report", feature: true,
    question: "What can I say about this project — with proof?",
    summary: "A complete evidence report. Ask it questions, get only cited claims back, and export it.",
    uses: ["Every report section, claim and limitation", "Evidence references per claim", "Coverage and fingerprint of the snapshot"],
    guide: [
      "Read section by section; each claim lists the records it rests on.",
      "Ask a question to pull matching claims — answers are quoted, never generated.",
      "Export as Markdown, copy, or print to PDF for sharing."
    ]
  },
  {
    id: "interview", n: "07", title: "Interview", group: "outputs", icon: "interview", feature: true,
    question: "How do I explain my work in an interview?",
    summary: "Question-by-question story drafts anchored in your history, with verification and a practice mode.",
    uses: ["Story scaffolds per evidence area", "Draft situation, approach and result", "Ownership and impact verification prompts"],
    guide: [
      "Each story starts from a real interview question matched to your history.",
      "Drafts are anchored in cited evidence; add your verified details in Notes.",
      "Tick the verification checklist, then rehearse in Practice mode."
    ]
  },
  {
    id: "insights", n: "08", title: "Insights", group: "outputs", icon: "insights",
    question: "What themes run through the evidence?",
    summary: "An optional AI reading of the current report — every theme must cite report claims.",
    uses: ["Executive summary", "Themes with evidence keys", "Open questions and uncertainties"],
    guide: [
      "Insights are generated only from the current report, on demand.",
      "Every theme cites report claims by key — open them to verify.",
      "Uncertainties are listed explicitly instead of being smoothed over."
    ]
  },
  {
    id: "evidence", n: "09", title: "Evidence", group: "explore", icon: "evidence",
    question: "Show me the exact record behind a signal.",
    summary: "One searchable index of every loaded record, with the raw JSON one click away.",
    uses: ["Commits, files, dependencies, structure, complexity, coupling, quality and tests"],
    guide: [
      "Search across every record loaded for this snapshot.",
      "Narrow by evidence family to cut noise.",
      "Open any row to see and copy the exact persisted JSON."
    ]
  },
  {
    id: "contributors", n: "10", title: "Contributors", group: "explore", icon: "contributors",
    question: "Who contributed, and how?",
    summary: "Exact Git author identities with commits, churn and paths touched.",
    uses: ["Persisted Git author metadata", "Additions, deletions and distinct paths"],
    guide: [
      "Authors are grouped by exact Git name and email — aliases are not merged.",
      "Compare commits, churn and the breadth of paths each person touched.",
      "Use it as context; it does not establish ownership, effort or seniority."
    ]
  },
  {
    id: "operations", n: "11", title: "Operations", group: "operate", icon: "operations",
    question: "Is the service itself healthy?",
    summary: "Live API, PostgreSQL, Redis and analysis-queue status, separate from repository evidence.",
    uses: ["Service process metrics", "Database and Redis latency", "Analysis queue counts"],
    guide: [
      "Shows the live health of the API, PostgreSQL and Redis.",
      "Queue counts show analysis jobs that are waiting, active or done.",
      "Refreshing here never changes repository evidence."
    ]
  }
];

export const PHASE_IDS = PHASES.map((p) => p.id);

export function phase(id) {
  return PHASES.find((p) => p.id === id) || PHASES[0];
}

export function neighbours(id) {
  const i = PHASE_IDS.indexOf(id);
  return { prev: i > 0 ? PHASES[i - 1] : null, next: i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1] : null };
}

// The worker's real progress stages, in order. "Preparing analysis" is reported at the
// start of both the import job and the analysis job, so progress is tracked monotonically.
export const STAGES = [
  { match: "Preparing analysis", label: "Preparing analysis", desc: "Validating the run and its target" },
  { match: "Cloning repository history", label: "Cloning repository history", desc: "Full Git history, size and time bounded" },
  { match: "Repository cloned; analysis queued", label: "Queued for analysis", desc: "Clone verified, analysis job enqueued" },
  { match: "Reading commit history", label: "Reading commit history", desc: "Commit metadata and changed files" },
  { match: "Analyzing file changes", label: "Analyzing file changes", desc: "Churn and hotspots from numstat" },
  { match: "Analyzing dependency history", label: "Analyzing dependency history", desc: "package.json snapshots per commit" },
  { match: "Analyzing architecture history", label: "Analyzing architecture history", desc: "Top-level and src/ directory evolution" },
  { match: "Analyzing migrations and tests", label: "Analyzing migrations and tests", desc: "Schema changes and test-source evolution" },
  { match: "Analyzing code complexity", label: "Analyzing code complexity", desc: "TypeScript AST metrics per changed file" },
  { match: ["Persisting evidence", "Saving evidence"], label: "Saving evidence", desc: "Writing every evidence family" },
  { match: "Finalizing analysis snapshot", label: "Finalizing snapshot", desc: "Sealing a reproducible snapshot" }
];

export function stageIndex(stageName) {
  if (!stageName) return -1;
  return STAGES.findIndex((s) => (Array.isArray(s.match) ? s.match.includes(stageName) : s.match === stageName));
}
