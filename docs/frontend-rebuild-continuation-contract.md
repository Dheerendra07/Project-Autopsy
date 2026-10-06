# Frontend Rebuild Continuation Contract

Updated: 2026-10-06

## Non-negotiable product direction

Project Autopsy frontend is a serious developer tool. The target is premium simplicity, not visual spectacle.

- No gradients, glow, neon, decorative colour soup, AI-looking visuals, or excessive rounded-card UI.
- Light and dark themes must remain the same product/system; only surfaces, contrast, and semantic colours adapt.
- Colour is functional: interaction/selection, healthy/verified, attention, and failure only.
- Information hierarchy, typography, whitespace, dividers, tables, tabs, and dense-but-readable layouts do the heavy lifting.
- Never call the UI "company-grade", "premium", "professional", or "done" without actual browser-level evidence.

## 11 feature pages — hard requirement

All 11 product surfaces must remain exposed and understandable. No feature, control, workflow, data, or next action may be hidden merely for visual cleanliness.

Canonical 11-stage navigation:
1. Overview
2. History
3. Structure
4. Quality
5. Runtime
6. Report
7. Interview
8. Insights
9. Evidence
10. Contributors
11. Operations

Each page must be:
- visually neat and calm
- immediately understandable to a developer
- information-dense where useful, without clutter
- explicit about important actions and states
- complete: no accidental omission of existing functionality
- usable in loading, empty, success, error, and retry states
- consistent in light and dark themes

## Development rules

Do NOT enter an endless edit/fix loop.

For each milestone:
1. Inspect current implementation and requirements.
2. Define the page/feature contract before editing.
3. Implement one coherent slice.
4. Run targeted tests.
5. Run relevant full checks.
6. Perform actual browser/live interaction verification.
7. Record exact result: PASS / FAIL / NOT VERIFIED.
8. Commit to a branch with a clear checkpoint.
9. Only then move to the next slice.

A failing verification must be diagnosed first. Do not randomly patch multiple unrelated files.

## Session continuity / checkpoint rule

Every significant frontend session must leave a continuation record containing:
- current branch
- current commit SHA
- last verified commit
- exact page(s) completed
- features verified working
- features not yet verified
- known defects
- files changed
- tests/checks run and results
- live deployment status/URL when applicable
- exact next action
- any user decision that must not be re-litigated

A new chat must resume from this record instead of restarting or guessing.

## Current checkpoint (2026-10-06)

- Main merge checkpoint: 24cfd08b0874b3185ac3d1cb413c00ee744134cf
- PR #244 was merged.
- Current deployed UI/API are live from the same merge commit.
- New frontend shell files: public/index.html and public/ui-chatz.css.
- public/app.js was intentionally preserved in PR #244 to avoid breaking existing runtime/API contracts.
- Full quality CI for the rebuild was green before merge.
- Live Firecrawl verification confirmed the rebuilt landing surface and its major sections, but this does NOT count as verification that all 11 live workspace pages are fully functional.
- Therefore: the 11-page frontend is NOT considered finally verified yet.

## Exact next work

The next frontend work must be a real 11-page product audit/rebuild, not another landing-page polish pass:
1. Inspect the existing runtime/page rendering for all 11 stages.
2. Map every existing control/data/action to each stage.
3. Rebuild the visual system/page shells around the restrained developer-tool direction above.
4. Ensure no existing feature is hidden or removed.
5. Verify each stage through actual interaction, including important states.
6. Verify theme parity.
7. Run CI and live Render verification.
8. Record a new checkpoint before any further design iteration.

## Scope protection

Project Autopsy is independent. Do not touch Family Museum or unrelated Render services/repos.

Backend/data contracts are presumed stable unless a concrete frontend requirement proves otherwise. Prefer frontend-only changes; do not change public/app.js or backend logic casually.

## Anti-hype rule

Never report "working" based only on source presence, CI green, or deployment status. Report those separately:
- source implemented
- tests passed
- browser interaction verified
- live deployment verified
- visual quality reviewed

Only claim what was actually checked.
