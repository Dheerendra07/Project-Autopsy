// Animated walkthrough scenes. They illustrate how the product is used with
// skeleton shapes and the product's real labels — never invented repository data.

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';
const CURSOR = '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L10 19z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

const line = (w, at, cls = "") => `<span class="s-line ${cls}" style="width:${w}%"${at ? ` data-at="${at}"` : ""}></span>`;
const chip = (text, cls = "", at = 0, extra = "") => `<span class="s-chip ${cls}"${at ? ` data-at="${at}"` : ""} ${extra}>${text}</span>`;
const win = (title, body, extra = "") => `<div class="s-window" ${extra}><div class="s-chrome"><i></i><i></i><i></i><span>${title}</span></div><div class="s-body">${body}</div></div>`;
const cursor = (pos, clicks = "") => `<div class="s-cursor" data-pos="${pos}" data-click="${clicks}">${CURSOR}</div>`;
const stage = (label, at) => `<div class="s-stage" data-at="${at}"><span class="tick">${CHECK}</span><span>${label}</span></div>`;
const bar = (w, at, tone = "") => `<div class="s-bar"><i data-at="${at}" style="--w:${w}%;${tone ? "background:" + tone : ""}"></i></div>`;

export const SCENES = {
  // ---------- Homepage walkthrough ----------
  import: {
    label: "Walkthrough: importing a repository",
    chapters: [
      "Paste any public or private HTTPS Git URL",
      "Start the analysis — no setup in your repo",
      "A background worker clones the full history",
      "Your project appears in the workspace"
    ],
    html: win("project-autopsy · new analysis", `
      <div class="s-label">Analyze a repository</div>
      <div class="s-title">What should we reconstruct?</div>
      <div class="s-row" style="margin-top:6px">
        <div class="s-input"><span class="s-type" data-at="1" style="--w:30ch">https://github.com/your-org/your-repo</span></div>
        <span class="s-btn s-hl" data-at="2">Start analysis</span>
      </div>
      <div class="s-row" style="gap:6px">${chip("GitHub", "", 1)}${chip("GitLab", "", 1)}${chip("Bitbucket", "", 1)}${chip("token encrypted at rest", "good", 2)}</div>
      <div class="s-card soft" data-at="3" style="margin-top:4px">
        <div class="s-row"><span class="s-chip warn">queued</span><span class="s-text">Cloning repository history…</span></div>
        ${bar(42, 3)}
      </div>
      <div class="s-row" style="gap:8px" data-at="4">
        <div class="s-card" style="flex:1"><div class="s-row"><span class="s-chip accent">your-repo</span><span class="s-text" style="margin-left:auto">ready</span></div>${line(70, 0, "dark")}${line(45)}</div>
        <div class="s-card" style="flex:1;opacity:.55">${line(50, 0, "dark")}${line(80)}${line(35)}</div>
      </div>
      ${cursor("1:78,80;2:80,34;3:52,62;4:30,84", "2")}
    `)
  },

  pipeline: {
    label: "Walkthrough: the eleven analysis stages",
    stepMs: 2400,
    chapters: [
      "Clone the repository and read every commit",
      "Measure file changes, dependencies and structure",
      "Parse migrations, tests and code complexity",
      "Save evidence and seal a reproducible snapshot"
    ],
    html: win("analysis run · live progress", `
      <div class="s-row"><div class="s-title">Analysis running</div><span class="s-chip accent" style="margin-left:auto">11 stages</span></div>
      <div class="s-bar" style="margin:2px 0 4px"><i class="on" style="--w:100%;transition:width 9.6s linear" data-at="1"></i></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.55em 1.4em">
        ${stage("Preparing analysis", 1)}${stage("Analyzing architecture history", 2)}
        ${stage("Cloning repository history", 1)}${stage("Analyzing migrations and tests", 3)}
        ${stage("Queued for analysis", 1)}${stage("Analyzing code complexity", 3)}
        ${stage("Reading commit history", 1)}${stage("Saving evidence", 4)}
        ${stage("Analyzing file changes", 2)}${stage("Finalizing snapshot", 4)}
        ${stage("Analyzing dependency history", 2)}<span></span>
      </div>
      <div class="s-row" data-at="4" style="margin-top:auto"><span class="s-chip good">snapshot current</span><span class="s-text">Every page now reads this exact snapshot.</span></div>
    `)
  },

  report: {
    label: "Walkthrough: reading the evidence report",
    chapters: [
      "Sections are built only from persisted evidence",
      "Every statement cites the records behind it",
      "Inspect the exact record in one click",
      "Limitations stay attached to each claim"
    ],
    html: win("report · current snapshot", `
      <div class="s-row"><div class="s-title">Evidence report</div>${chip("fingerprint ✓", "good", 1, 'style="margin-left:auto"')}</div>
      <div class="s-card" data-at="1">
        <div class="s-label">Change hotspots</div>
        ${line(88, 0, "dark")}${line(64)}
        <div class="s-row" style="gap:5px" data-at="2">${chip("file_change_metrics", "accent s-hl", 0, 'data-at="3"')}${chip("commit")}</div>
      </div>
      <div class="s-card" data-at="1">
        <div class="s-label">Quality-related historical signals</div>
        ${line(76, 0, "dark")}${line(52)}
        <div class="s-row" style="gap:5px" data-at="2">${chip("bug_area_signal")}${chip("repeated_file_history")}</div>
        <div class="s-row" data-at="4"><span class="s-chip warn">limitation</span>${line(55)}</div>
      </div>
      <div class="s-drawer" data-at="3" data-until="4">
        <div class="s-label">Evidence record</div>
        <div class="s-title" style="font-size:1em">file_change_metrics</div>
        <div class="s-json">{<br>&nbsp;<b>"path"</b>: "src/…",<br>&nbsp;<b>"commits_touched"</b>: …,<br>&nbsp;<b>"total_churn"</b>: …<br>}</div>
        ${line(80)}${line(60)}
      </div>
      ${cursor("1:70,88;2:40,30;3:20,52;4:58,86", "3")}
    `)
  },

  interview: {
    label: "Walkthrough: preparing interview answers",
    chapters: [
      "Questions are matched to signals in your history",
      "Draft answers are anchored in cited evidence",
      "Verify ownership before you say “I”",
      "Practice out loud with a timer"
    ],
    html: win("interview · story builder", `
      <div class="s-label">Change hotspot</div>
      <div class="s-title">“Tell me about an area that needed repeated attention.”</div>
      <div class="s-card soft" data-at="2">
        <div class="s-row"><span class="s-label" style="width:7em">Situation</span>${line(60, 0, "dark")}</div>
        <div class="s-row"><span class="s-label" style="width:7em">Approach</span>${line(72)}</div>
        <div class="s-row"><span class="s-label" style="width:7em">Result</span>${line(48)}</div>
      </div>
      <div class="s-row" style="gap:5px" data-at="2">${chip("change-hotspots", "accent")}${chip("commit")}${chip("file_change_metrics")}</div>
      <div class="s-card" data-at="3">
        <div class="s-stage" data-at="3"><span class="tick">${CHECK}</span><span>I implemented or reviewed this change</span></div>
        <div class="s-stage" data-at="4"><span class="tick">${CHECK}</span><span>Outcome verified by tests or telemetry</span></div>
      </div>
      <div class="s-row" data-at="4" style="margin-top:auto"><span class="s-chip">practice</span><span class="s-title" style="font-family:var(--mono);font-weight:500">01:42</span></div>
    `)
  },

  // ---------- Phase guides (side cards) ----------
  "g-overview": {
    label: "How Overview works",
    chapters: ["Check the snapshot is current", "Scan totals and the busiest files", "Jump straight to Report or Interview"],
    html: `<div class="scene">
      <div class="s-row" style="gap:6px">${chip("snapshot current", "good", 1)}${chip("branch", "", 1)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8%">
        <div class="s-card" data-at="2"><div class="s-label">commits</div>${line(60, 0, "ink")}</div>
        <div class="s-card" data-at="2"><div class="s-label">authors</div>${line(40, 0, "ink")}</div>
        <div class="s-card" data-at="2"><div class="s-label">files</div>${line(52, 0, "ink")}</div>
      </div>
      <div class="s-card" style="margin-top:6px" data-at="2">${bar(92, 2)}${bar(70, 2)}${bar(48, 2)}</div>
      <div class="s-row" style="gap:6px;margin-top:6px">${chip("Report →", "accent s-hl", 3)}${chip("Interview →", "", 3)}</div>
    </div>`
  },
  "g-history": {
    label: "How History works",
    chapters: ["Commits are listed newest first", "Each event is labeled by its subject", "Filter by type and inspect a commit"],
    html: `<div class="scene" style="display:flex;flex-direction:column;gap:7px">
      ${[["feature", "var(--accent)"], ["fix", "var(--bad)"], ["refactor", "#8250df"], ["test", "var(--good)"], ["dependency", "var(--warn)"]].map(([t, c], i) =>
        `<div class="s-row" data-at="${i < 2 ? 1 : 2}"><span style="width:.8em;height:.8em;border-radius:50%;background:${c};flex:none"></span>${line(58 - i * 6, 0, "dark")}${chip(t, "", 2, 'style="margin-left:auto"')}</div>`).join("")}
      <div class="s-row" style="gap:5px;margin-top:auto">${chip("all")}${chip("fix", "accent s-hl", 3)}${chip("refactor")}</div>
    </div>`
  },
  "g-structure": {
    label: "How Structure works",
    chapters: ["See which directories appeared and when", "Track dependency changes per commit", "Find files that always change together"],
    html: `<div class="scene">
      <svg class="s-svg" viewBox="0 0 200 125" preserveAspectRatio="none" aria-hidden="true">
        <path class="draw" data-at="1" d="M100 20 V45 M100 45 H45 V70 M100 45 H155 V70 M100 45 V70" stroke="#b7c0ca" stroke-width="1.2" fill="none"/>
        <path class="draw" data-at="3" d="M45 95 C 80 118, 120 118, 155 95" stroke="#0969da" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/>
      </svg>
      <div style="position:absolute;left:41%;top:8%;width:18%" class="s-card" data-at="1">${line(80, 0, "ink")}</div>
      <div style="position:absolute;left:12%;top:52%;width:20%" class="s-card" data-at="1"><span class="s-label">src/</span></div>
      <div style="position:absolute;left:40%;top:52%;width:20%" class="s-card" data-at="2"><span class="s-label">pkg</span></div>
      <div style="position:absolute;left:68%;top:52%;width:20%" class="s-card" data-at="1"><span class="s-label">tests/</span></div>
      <div style="position:absolute;left:30%;bottom:6%" data-at="3">${chip("co-changed together", "accent")}</div>
    </div>`
  },
  "g-quality": {
    label: "How Quality works",
    chapters: ["Fix-labeled commits cluster on some files", "Repeated edits and refactors surface next", "Migrations and test changes stay visible"],
    html: `<div class="scene">
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px">
        ${Array.from({ length: 24 }, (_, i) => `<span style="aspect-ratio:1;border-radius:4px;background:var(--surface-3)" class="${[3, 9, 10, 17].includes(i) ? "s-hl" : ""}" ${[3, 9, 10, 17].includes(i) ? 'data-at="1"' : ""}></span>`).join("")}
      </div>
      <div class="s-card" style="margin-top:8px" data-at="2"><div class="s-row">${chip("refactor")}${line(50)}</div><div class="s-row">${chip("repeated")}${line(38)}</div></div>
      <div class="s-row" style="gap:5px;margin-top:6px">${chip("migration", "warn", 3)}${chip("tests +", "good", 3)}</div>
    </div>`
  },
  "g-runtime": {
    label: "How Runtime works",
    chapters: ["Telemetry you send is summarized by revision", "Deployments mark exact releases", "Windows compare before and after — no causal claims"],
    html: `<div class="scene">
      <svg class="s-svg" viewBox="0 0 200 125" preserveAspectRatio="none" aria-hidden="true">
        <rect x="88" y="14" width="44" height="92" fill="rgba(9,105,218,.07)" data-at="3"/>
        <path class="draw" data-at="1" d="M10 90 L30 82 L50 86 L70 70 L90 74 L110 52 L130 60 L150 44 L170 48 L190 36" stroke="#111" stroke-width="1.8" fill="none"/>
        <line x1="110" y1="14" x2="110" y2="106" stroke="#9a6700" stroke-width="1.2" stroke-dasharray="3 3" data-at="2"/>
      </svg>
      <div style="position:absolute;left:52%;top:6%" data-at="2">${chip("deploy", "warn")}</div>
      <div style="position:absolute;left:6%;bottom:6%" data-at="3">${chip("observation, not cause", "")}</div>
    </div>`
  },
  "g-report": {
    label: "How Report works",
    chapters: ["Read section by section", "Ask a question — get cited claims", "Export to Markdown or print"],
    html: `<div class="scene" style="display:flex;flex-direction:column;gap:7px">
      <div class="s-card" data-at="1"><div class="s-label">Repository overview</div>${line(80, 0, "dark")}</div>
      <div class="s-card" data-at="1"><div class="s-label">Change hotspots</div>${line(66, 0, "dark")}</div>
      <div class="s-row" data-at="2"><div class="s-input"><span class="s-type" data-at="2" style="--w:16ch">which files churn?</span></div></div>
      <div class="s-card soft s-hl" data-at="2">${line(70, 0, "dark")}<div class="s-row" style="gap:5px">${chip("file_change_metrics", "accent")}</div></div>
      <div class="s-row" style="gap:5px;margin-top:auto">${chip(".md", "", 3)}${chip("print / PDF", "", 3)}${chip("copy", "", 3)}</div>
    </div>`
  },
  "g-interview": {
    label: "How Interview works",
    chapters: ["Pick a question tied to your history", "Read the evidence-anchored draft", "Tick verification, add notes, then practice"],
    html: `<div class="scene" style="display:flex;flex-direction:column;gap:7px">
      <div class="s-card" data-at="1"><div class="s-label">question</div>${line(86, 0, "ink")}${line(50, 0, "ink")}</div>
      <div class="s-card soft" data-at="2">${line(80)}${line(70)}${line(55)}</div>
      <div class="s-card" data-at="3">
        <div class="s-stage" data-at="3"><span class="tick">${CHECK}</span><span>ownership verified</span></div>
        <div class="s-stage" data-at="3"><span class="tick">${CHECK}</span><span>outcome verified</span></div>
      </div>
    </div>`
  },
  "g-insights": {
    label: "How Insights works",
    chapters: ["Generated only from the current report", "Themes cite report claims by key", "Uncertainties are listed, not hidden"],
    html: `<div class="scene" style="display:flex;flex-direction:column;gap:7px">
      <div class="s-card" data-at="1"><div class="s-label">summary</div>${line(90, 0, "dark")}${line(76)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="s-card" data-at="2">${line(70, 0, "dark")}<div class="s-row">${chip("hotspots/…", "accent")}</div></div>
        <div class="s-card" data-at="2">${line(60, 0, "dark")}<div class="s-row">${chip("evolution/…", "accent")}</div></div>
      </div>
      <div class="s-card soft" data-at="3"><div class="s-row">${chip("uncertainty", "warn")}${line(50)}</div></div>
    </div>`
  },
  "g-evidence": {
    label: "How Evidence works",
    chapters: ["Search across every loaded record", "Narrow by family", "Open the exact JSON record"],
    html: `<div class="scene" style="display:flex;flex-direction:column;gap:7px">
      <div class="s-row"><div class="s-input"><span class="s-type" data-at="1" style="--w:10ch">src/server</span></div></div>
      <div class="s-row" style="gap:5px">${chip("all")}${chip("files", "accent s-hl", 2)}${chip("commits")}${chip("deps")}</div>
      <div class="s-card" data-at="1">${line(76, 0, "dark")}</div>
      <div class="s-card" data-at="1">${line(62, 0, "dark")}</div>
      <div class="s-drawer" data-at="3" style="width:52%"><div class="s-label">record</div><div class="s-json">{ <b>"path"</b>: "…" }</div></div>
    </div>`
  },
  "g-contributors": {
    label: "How Contributors works",
    chapters: ["Authors are listed by exact Git identity", "Compare commits, churn and paths touched", "Context only — not ownership or effort"],
    html: `<div class="scene" style="display:flex;flex-direction:column;gap:9px;justify-content:center">
      ${[88, 64, 40, 22].map((w, i) => `<div class="s-row" data-at="1"><span style="width:1.6em;height:1.6em;border-radius:6px;background:${i ? "var(--surface-3)" : "var(--ink)"};flex:none"></span><div class="s-bar" style="flex:1"><i data-at="2" style="--w:${w}%"></i></div></div>`).join("")}
      <div class="s-row" data-at="3">${chip("descriptive, not ownership", "warn")}</div>
    </div>`
  },
  "g-operations": {
    label: "How Operations works",
    chapters: ["Live API, database and Redis health", "Queue counts for analysis jobs", "Refresh any time — it never touches evidence"],
    html: `<div class="scene">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${["api", "postgres", "redis"].map((n) => `<div class="s-card" data-at="1"><div class="s-row"><span style="width:.7em;height:.7em;border-radius:50%;background:var(--good)"></span><span class="s-label">${n}</span></div>${line(50, 0, "dark")}</div>`).join("")}
      </div>
      <div class="s-card" style="margin-top:8px" data-at="2">
        <div class="s-row"><span class="s-label" style="width:6em">active</span>${bar(30, 2)}</div>
        <div class="s-row"><span class="s-label" style="width:6em">waiting</span>${bar(12, 2)}</div>
        <div class="s-row"><span class="s-label" style="width:6em">done</span>${bar(84, 2)}</div>
      </div>
      <div class="s-row" style="margin-top:6px">${chip("↻ refresh", "accent s-hl", 3)}</div>
    </div>`
  }
};
