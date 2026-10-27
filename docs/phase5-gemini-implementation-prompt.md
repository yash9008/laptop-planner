# Gemini / Antigravity prompt — UI Phase 5

Implement **UI Phase 5 — Motion parity acceptance** in Laptop Planner. This
is the UI improvement phase in `PLAN.md`, not the already completed original
Phase 5 recurrence/focus feature work. Deliver component-specific acceptance
evidence, justified fixes, regression tests, full hosted verification, and a
reviewable handoff. Do not package/install a DMG, expand product features, or
claim your own independent acceptance. Codex will review the result later.

## Workspace and verified starting point

Verified Phase 4 source/test commit:
`d0f55c3ac6e558475d71522ddbbe5fe2c1691cfb`.
Full [Planner checks run](https://github.com/yash9008/laptop-planner/actions/runs/40500807107):
success, with 122/122 Electron tests, 63/63 database tests, and 78/78 scheduler
tests in each of two time zones. Later documentation-only commits publish
the verification receipts and this prompt without changing that tested source.

```sh
cd "/Users/yashsawant/Documents/Projects/sunsama clone"
git status --short --branch
git log -6 --oneline
git remote -v
```

Read `AGENTS.md`, `PLAN.md`, `NOTES.md`, `docs/phase4-final-verification.md`,
`docs/phase4-fix-review.md`, `docs/phase4-implementation-review.md`,
`docs/phase2-interaction-contract.md`, `docs/phase2-reference-pass.md`,
`docs/interaction-audit.md`, `docs/motion-timings.md`, and
`docs/github-actions.md`, plus the relevant source and tests.

The final Phase 4 verification document is the authority for the tested
source commit, successful full-run URL, counts, resolved R1–R11 findings,
and timer-test limitations. Start only from that verified source or a later
documentation-only descendant. Do not use an older failing review branch.
Preserve all Phase 4 tests, the actual mounted board subtree, horizontal and
vertical scroll continuity, current entry origins, and explicit timer actions.

Inspect the existing `ui-phase-5` branch if present; otherwise create it from
the verified Phase 4 baseline. Do not reset user work or discard local review
documents. Record the starting branch, commit, and pre-existing changes.

## 1. Establish a component-specific acceptance matrix

Write `docs/phase5-motion-acceptance.md` before making motion changes, then
complete the work in this task. Do not stop at a plan. Include one row per
interaction with: surface/property, trigger, evidence source/date, authority,
normal/reduced behavior, declared duration/delay/easing, measured visible
span, interruption result, local implementation, test, and remaining gap.

Cover the implemented surfaces:

- Checkbox, task-card, contextual action and navigation feedback.
- Quick add, centered task editor, nested estimate/date/project/task menus,
  command palette, keyboard help, backdrops, and focus transfer on dismissal.
- Sidebar and utility-panel opening/closing, calendar visibility and resizing,
  and Focus entry/exit with the previous workspace preserved.
- Whole-card drag lift, native source continuity, insertion preview, neighbor
  reflow, settling, cancellation, cross-day/backlog moves, failed-save rollback,
  edge scrolling, board panning/inertia, and keyboard navigation.
- Completion, removal, reinsertion and Undo, without changing scheduling or
  historical/actual data semantics.

Separate **observed/recorded**, **computed**, **loaded declaration only**,
**intentional Laptop Planner behavior**, **mismatch**, and **unverified**.
A green test badge or a matching duration alone does not establish parity.

## 2. Use reference evidence within its actual limits

Read the existing JSON/recorder receipts before choosing transitions. Known
examples include checkbox feedback at 50 ms, card/context opacity at 200 ms,
navigation opacity at 200 ms, and navigation icon transform at 300 ms. Check
the documented properties, easing and authority for each matching component.
The centered editor, estimate panel and sampled quick-add controls reported
zero-duration computed styles; this does not establish the absence of every
JavaScript animation. Preserve the explicit draft/save/dismissal choices in
the Phase 2 interaction contract even where they differ from the reference.

The 300 ms workspace-margin rule, 300 ms ease-in Focus-calendar opacity rule,
task entry/exit hooks, staged row effects, and delayed special-modal rule
must retain their documented authority. Do not turn an unexercised declaration
into observed trigger behavior or apply it to unrelated surfaces. No blanket
fade/scale, generic tooltip delay, guessed easing, or universal 300 ms timing.

New reference inspection requires an available authorized synthetic/demo
environment or suitable public evidence. Do not inspect, alter, import, or
use private Sunsama tasks/account data. Do not create fixtures in the user's
private workspace, change macOS settings, or launch local reference windows.
If a suitable hosted reference is unavailable, record that precise gap and
continue useful local-app acceptance and evidence-supported fixes. Mark
unmatched reference behaviors unverified; do not invent values or claim full
parity. Lack of reference access does not authorize unrelated redesign.

## 3. Implement only supported corrections

Preserve Laptop Planner branding and charcoal styling. Use the existing stack;
do not add dependencies, schemas/migrations, scheduler features, generic IPC,
runtime networking, accounts, telemetry, integrations, or OS-wide shortcuts.
Keep Electron restrictions and main-process filesystem/SQLite boundaries.

Motion must remain presentation. Never delay a committed save or timer action
until animation finishes, create duplicate writes from transition callbacks,
or use animation state as persisted timer authority. Keep failed drafts,
useful errors and retry controls. Entering/exiting Focus or closing an overlay
must never start/resume/pause/complete/transfer a timer.

Keep UTC elapsed time, sleep/quit/interruption recovery, recurrence identity,
atomic task/order/date/focus/schedule updates, unscheduled overflow, and stable
creation retry IDs unchanged. Do not add Pomodoro, subtasks, manual actuals,
timeboxing, daily rituals, automatic rollover, or new data features.

Retain actual mounted workspace/board state while Focus is displayed. Concealed
surfaces must remain inert and unavailable to assistive technology. Restore
the real initiating control or an appropriate visible fallback after removal
and inert clearing; do not recapture origins from BODY or a dismissed overlay.

## 4. Verify effects and interruption behavior meaningfully

Run GUI tests and automated previews only on GitHub's hosted macOS runner.
Do not launch local Electron UI suites, previews, packaged verification, or
Sunsama windows. Local type-check/build/scheduler/database checks remain
available under AGENTS.md.

Exercise normal and reduced motion, opening and closing, rapid repeated
toggles, reversal/interruption, Escape/outside-click cancellation, keyboard
navigation, focus containment/restoration, pending writes, injected failure
and successful retry, stable IDs with duplicate task presentations, and wide
1440×900 / narrow 860×680 viewports. Verify actual bounds/overflow.

Measure the matching property with suitable browser animation/frame/trace
evidence where possible. Separate input-to-paint latency, declaration values,
delay, elapsed effect span, and save latency. Use frame-bounded tolerances and
observable settling; avoid arbitrary sleeps, brittle exact wall-clock timing,
blanket retries, and treating every transitionend as completion of an action.

Reduced motion must suppress nonessential movement and staged delays while
preserving immediate focus, usable controls, writes and explicit timer actions.
An animation interrupted by navigation/unmount must not later steal focus,
restore stale scroll, apply an old drag result, or leave a blocking overlay.

Use temporary databases and controlled clocks. For native fault injection,
allow in-flight main-process transactions to finish before schema changes as
documented in AGENTS.md. Keep diagnostics for native menu failures and verify
committed resume before advancing the synthetic clock. Do not weaken elapsed,
closed-time exclusion, recovery, or restart assertions to obtain a pass.

Preserve all existing assertions, including Phase 2/3 focus regressions and
Phase 4 R1–R11/board-identity/Search-entry/native-menu coverage. Add tests that
exercise meaningful behavior; names must not claim checks absent from their
assertions. Do not skip/delete tests or modify the workflow to conceal failures.

## 5. Full hosted verification and visual receipts

Push the intended source/test revision, then obtain its exact push-triggered
**Planner checks** run and **Full checks on Apple Silicon macOS** job:

```sh
git push -u origin HEAD
gh run list --repo yash9008/laptop-planner --workflow check.yml --event push --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId,status,conclusion,url,headSha
```

Wait with `gh run watch RUN_ID --repo yash9008/laptop-planner --exit-status
--interval 30`. Inspect failures, fix them, and push again until the complete
`npm run check` suite passes. A focused/manual diagnostic, historical commit,
pending, skipped, cancelled or timed-out run does not count as a full pass.
If hosted execution is unavailable, report the actual blocker; do not fall
back to local GUI testing.

The workflow uploads no artifacts. Follow the existing synthetic screenshot
log-marker/base64 pattern and retrieve the raw log ZIP with
`gh api repos/yash9008/laptop-planner/actions/runs/RUN_ID/logs`. Extract only
controlled evidence, inspect the actual PNGs, and retain hashes/run metadata.
Static screenshots establish layout/state, not animation spans or keyboard
ownership. Preserve historical evidence files unchanged.

## 6. Handoff and stop

Complete `docs/phase5-motion-acceptance.md` and write
`docs/phase5-implementation-handoff.md` with:

- Starting and tested commits, pre-existing work, final scope and changed files.
- Component-specific findings/fixes and intentional product differences.
- Exact commands, full run/job URLs, head SHA, conclusion and test counts.
- Inspected wide/narrow screenshots, normal/reduced and interruption receipts,
  and actual injected-failure/clock/native-menu coverage.
- Verified matches, remaining mismatches, inaccessible/unverified reference
  behaviors, and limits on timing/easing claims.

Update PLAN.md honestly. If reference gaps remain, say acceptance is partial
and enumerate them; do not mark full motion parity complete. Finish with
**Ready for Codex review** only after implementation and hosted self-checks
are complete. Stop for independent review; do not package, install, publish a
release, start another feature phase, or message another chat/agent.
