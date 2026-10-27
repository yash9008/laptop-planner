# Laptop Planner plan and status

The codebase exists and all six requested implementation phases are complete. This file records current scope; it does not authorize new implementation. Pomodoro mode remains a backlog idea.

## Completed phases

| Phase | Status | Delivered |
| --- | --- | --- |
| 1 — Foundation | Complete | Electron + React + TypeScript + Vite, local-file launch, isolated preload, SQLite in Application Support, migrations and storage diagnostics |
| 2 — Scheduling engine | Complete | Pure TypeScript scheduler; explicit clock/date; priority, splitting, fixed events, capacity and overflow; standalone acceptance tests and demo |
| 3 — Core UI | Complete | Sidebar, Today view, task add/edit/complete/delete/undo/reorder, scheduled calendar blocks and daily totals including unscheduled minutes |
| 4 — Planning tools | Complete | Fixed-event CRUD/drag/resize, seven-day board, projects, backlog, deadlines and restart persistence |
| 5 — Recurrence and focus | Complete | Daily/selected-weekday occurrences; one focus timer; actual/planned time; active-task priority; sleep/quit/interruption recovery; midnight and DST handling |
| 6 — Settings and release | Complete | Planning hours/time zone, backup/restore with safety copies, unreadable-database recovery, save-failure handling and idempotent creation retries, acceptance checks, arm64 app and DMG |

## Additional completed requests

- Original charcoal UI based on the authorized Sunsama layout/behavior reference, with this app's own branding and data.
- Whole-card dragging, floating native drag image, live insertion slot, animated reflow/landing, same-day and cross-day/backlog moves, cancellation and failed-save rollback.
- Right-button drag panning, empty-space left dragging, horizontal scrolling and keyboard navigation. The calendar follows the dated column nearest the board's left edge without rebasing the board on every scroll.
- macOS menu bar elapsed timer, pause/resume and opening the planner; synchronized background, task-change and recovery behavior.

## UI improvement phases — requested October 26, 2026

This sequence follows the user's request to make the app feel closer to Sunsama, beginning with UI. Each phase ends with a working Electron build, appropriate checks, visible results, and user review before the next phase starts. The existing six implementation phases above remain complete.

| UI phase | Status | Scope |
| --- | --- | --- |
| 1 — Board and calendar workspace | Complete; awaiting user review | Neutral surfaces, quieter toolbar/sidebar, clearer task cards and current-day headings, workload totals above the board/day list, and a resizable calendar with keyboard controls and a remembered width |
| 2 — Task editing and quick actions | Complete; R1–R8 independently rechecked; ready for Phase 3 | Quick-add composer, centered task detail editor, estimate popover and task menu; verified 50 ms checkbox and 200 ms card/control feedback, with component-specific motion evidence; preserve drafts and failed-save recovery |
| 3 — Finding and organizing work | Complete; known R1–R8 findings resolved; ready for UI Phase 4 | Project/status filters, global search and backlog/search/recovery side panels; verified navigation opacity/icon feedback, plus trigger verification before adopting the 300 ms layout-margin rule; preserve date/scroll continuity |
| 4 — Keyboard navigation and focused work | Implemented; independent review found acceptance gaps; fixes required | Command palette, shortcuts and a true single-task Focus screen; verify actual Focus/palette transitions, including the loaded 300 ms Focus-calendar opacity rule, with the existing elapsed-time timer |
| 5 — Motion parity acceptance | Planned | Compare motion against controlled reference evidence; test normal/reduced motion, enter/exit, delays, interruption/reversal, cancellation, errors, focus, narrow windows and drag behavior; distinguish CSS definitions from observed elapsed spans and report unmatched effects |

**Before UI Phase 2:** the user requested an interaction/animation audit. [The audit](docs/interaction-audit.md) distinguishes live controls, the earlier board recording, older public walkthrough frames and unmeasured motion. The earlier task-drawer proposal is not established as Sunsama's current editor. The revised recommendation above is proposed scope: verify the editor presentation and specify quick-add, popup, dismissal, focus and interrupted-transition behavior before implementation. No Phase 2 code was added during the audit.

**Timing verification follow-up:** [motion-timings.md](docs/motion-timings.md) records exact values from the running app's computed styles and 36 selected loaded CSS rules, plus a recorded opacity effect. This verifies a defined subset, not all animation timings. The observed page reported reduced motion enabled. JavaScript drag/settling, current task-editor choreography and other listed gaps require controlled reference evidence; their values remain unverified. Verified motion is assigned to Phases 2–4, with a new Phase 5 for end-to-end motion acceptance. No phase is authorized to label a declared-but-unexercised rule as verified behavior for a different component.

**Current Phase 2 reference pass:** [phase2-reference-pass.md](docs/phase2-reference-pass.md) now records the current centered editor, estimate/date/actions menus, quick-add Escape and outside-click behavior, and normal/reduced-motion computed styles using explicitly authorized synthetic examples. The temporary macOS motion change was restored. [phase2-interaction-contract.md](docs/phase2-interaction-contract.md) proposes the implementation and makes its draft preservation, explicit saves, consistent nested dismissal, and focus restoration differences clear. Review that contract before implementation. This supersedes the earlier uncertainty about editor shape; full JavaScript/frame timing and later motion acceptance remain incomplete. No Phase 2 application code was added.

Subtasks, manual actual-time entry, manual task timeboxing, daily rituals, and weekly planning/reporting remain future feature work. The UI phases do not silently introduce those data-model or scheduler changes. No cloud integrations, accounts, runtime networking, or automatic rollover are planned.

### UI Phase 1 behavior

- The selected date's workload is visible above the board or daily list and follows the same nearest-left-column rule as the calendar. Over-capacity work is marked explicitly.
- Drag the calendar divider, or focus it and use Left/Right arrows (24 pixels), Home (minimum), or End (available maximum). Escape cancels an active resize; double-click restores the responsive default.
- Width is a renderer display preference stored locally, bounded to 240–480 pixels and further constrained to leave at least 280 pixels for the main view. A narrow window does not discard the saved wider preference. Failure to save a preference cannot block planning.
- All task saves, whole-card dragging, insertion previews, cancellation, scheduling, focus recovery, storage, and offline protections continue through the existing implementations.

### UI Phase 1 verification — October 26, 2026

- `npm run check`: passed type-check/build, 78 scheduler tests in each of Asia/Kolkata and America/Los_Angeles, 63 database tests, and 50 real Electron tests.
- After the final narrow-layout adjustment, `npm run build && npm run test:app -- ui.spec.ts board-interactions.spec.ts`: all 11 tests passed. Coverage includes resizing/cancellation/keyboard bounds/reload persistence, unchanged planner data, top workload totals and overflow, board dragging, save failures, and calendar following.
- `node /tmp/laptop-planner-ui-phase1-preview.mjs`: launched a separate Electron preview with a controlled clock and newly created disposable sample database; no renderer errors. Inspected screenshots at 1440×900 and 860×680. The temporary script is session QA, not a shipped application entry point. Run `npm start` normally for the real planner.
- Visible result: clearer day columns and cards, selected-day totals above the board, balanced totals at laptop width, and a calendar that can be resized while retaining room for the board. [Wide screenshot](docs/screenshots/ui-phase1-wide.png) · [Laptop screenshot](docs/screenshots/ui-phase1-laptop.png).
- This is a verified source/development build. The packaged app and DMG have not been rebuilt for these UI changes.

### UI Phase 2 behavior

- Compact quick-add composer opened by pressing `A` or clicking a column/toolbar "Add task" control, with target date, active project, and backlog defaults. Focus begins in the title field, Enter submits valid input, and an inline alert guards against missing or non-positive durations without discarding the entered title.
- Draft preservation and isolation in renderer memory: dismissing quick-add or the task editor via Escape or backdrop click preserves unsaved drafts by context (creation key or task ID); an explicit "Discard" button allows discarding uncommitted drafts. Outside clicks never create a record.
- Creation handoff: "Full details" transfers uncommitted fields and the stable creation UUID directly into the centered task editor without creating a task record as a side effect.
- Centered task editor: responsive container (670px max width, viewport margins, scrollable content) with dimmed backdrop (`rgba(78, 73, 90, 0.6)`), retaining all existing fields (title, estimate, day/backlog, project, deadline, recurrence, notes), uncommitted draft retention, explicit discard, and atomic save.
- Anchored estimate popover: clicking a card's duration badge opens the popover with verified Sunsama presets (5 min through 8 hr) and custom duration entry; preset selection or custom submission performs an atomic save while preserving other fields. Choosing an estimate inside an uncommitted editor/composer updates that draft only.
- Keyboard-accessible task menu: opened via a more actions trigger button on each card, providing "Edit task", "Move to backlog" (disabled when already in backlog), and "Delete" (with Undo toast). Supports ArrowDown/ArrowUp, Enter, and Escape.
- Child overlay dismissal: Escape or outside click closes only the innermost child popover (e.g., estimate popover), leaving the parent editor or composer open with draft intact. Focus is returned to the initiating trigger using `preventScroll: true` without jumping or shifting board scroll.
- Motion timing adherence: 50 ms checkbox transitions, 200 ms card/control opacity feedback, 150 ms menu item hover transitions, and instant (0s) overlay appearances without invented animation curves. Full reduced-motion cancellation.

### UI Phase 2 verification — October 26, 2026

Latest review: [phase2-final-review.md](docs/phase2-final-review.md). R1–R8 are resolved in the focused recheck, including a reviewer correction for restoring focus after switching creation entry points. Type-check/build and 23 real Electron Phase 2/board tests passed; four independent focus probes returned the required results. UI Phase 2 is ready to proceed; UI Phase 3 remains unstarted. [Phase 3 implementation prompt](docs/phase3-gemini-implementation-prompt.md).

Historical re-review: [phase2-fix-review.md](docs/phase2-fix-review.md). Independent `npm run check` passed at that revision, including all 64 Electron tests; original R1–R7 cases were resolved, and three additional probes found R8. Those focus findings are now resolved as recorded above.

Historical initial review: [phase2-implementation-review.md](docs/phase2-implementation-review.md). Type-check/build and 12 focused existing tests passed, but additional disposable Electron checks reproduced cached-field overwrite, draft loss after failed deletion, modal focus escape, pending-save dismissal, missing estimate failure state, clipped nested popovers, and an inherited keyboard date-default gap. These findings were fixed before acceptance. The implementation-stage results below remain historical reported verification; the final review above describes the current check and its limits.

- `npm run check`: passed TypeScript check, build, 78 scheduler tests in each of Asia/Kolkata and America/Los_Angeles, 63 database tests under Electron, and 57 real Electron application tests.
- Focused suites: `npx playwright test tests/app/phase2-ui.spec.ts` (all 7 passed), `tests/app/ui.spec.ts` (all 6 passed), `tests/app/board-interactions.spec.ts` (all 5 passed), `tests/app/menu-bar.spec.ts` (all 5 passed), `tests/app/phase4.spec.ts` (all 6 passed), `tests/app/phase5.spec.ts` (all 7 passed), `tests/app/phase6.spec.ts` (all 6 passed), `tests/app/planner.spec.ts` (all 10 passed).
- Real Electron preview with disposable database (`/tmp/laptop-planner-ui-phase2-preview.mjs`): captured screenshots at 1440×900 and 860×680 with zero console or renderer errors.
  - [Wide board screenshot](docs/screenshots/ui-phase2-wide.png)
  - [Laptop board screenshot](docs/screenshots/ui-phase2-laptop.png)
  - [Quick-add composer screenshot](docs/screenshots/ui-phase2-quick-add.png)
  - [Centered task editor screenshot](docs/screenshots/ui-phase2-centered-editor.png)
  - [Estimate popover screenshot](docs/screenshots/ui-phase2-estimate-popover.png)
  - [Task actions menu screenshot](docs/screenshots/ui-phase2-task-menu.png)
- Source/development build only; packaged app and DMG have not been rebuilt for UI Phase 2.

### UI Phase 3 independent review — October 26, 2026

Gemini's implementation on `ui-phase-3` at `29b0d08` passes its 77 existing
Electron tests, type-check/build, 78 scheduler tests in each of two time zones,
and 63 database tests on the hosted macOS runner. The independent
[Phase 3 review](docs/phase3-implementation-review.md) reproduced five issues:
search-result focus after removing a match, backlog-panel insertion/preview,
filtered completion totals, reduced-motion transitions, and panel-close focus.
Eight additional hosted probes produced five failures and three passes; the
combined Electron suite reported 80 passed and 5 failed. The application code
was not changed by the review. Phase 3 needs fixes and independent re-review;
Phase 4 has not been authorized.

### UI Phase 3 fix review — October 27, 2026

The [independent fix review](docs/phase3-fix-review.md) checked `f9fd68c`
and its successful full hosted run: 89 Electron tests, 63 database tests,
and 78 scheduler tests in each of two time zones. The original R1–R5
reproductions now pass, and the Recovery screenshot evidence is corrected.
Three additional probes on unchanged application source reproduced R6–R8:
quick-add inherits Search focus ownership, scheduling the last Backlog task
through its title leaves focus on BODY, and the menu route focuses the board.
The independent full suite reported 89 passed and 3 failed. Phase 3 remains
unaccepted pending these focus fixes and hosted re-verification. Application
code was not changed by the review; Phase 4 has not been started.

### UI Phase 3 final verification — October 27, 2026

At the user's request, R6–R8 were fixed using shared task-origin capture,
an actual empty-Backlog focus fallback, and explicit menu-anchor handoff.
The [final verification](docs/phase3-final-review.md) records source `f61a836`
and its successful full hosted run: 95 Electron tests, 63 database tests,
and 78 scheduler tests in each of two time zones, plus type-check/build.
All known R1–R8 findings are resolved. The original three failing probes
are preserved unchanged and now pass alongside three added action/entry-point
regressions. GUI execution remained hosted; no personal data was used.

Phase 3 is ready to proceed. The user requested the
[UI Phase 4 implementation prompt](docs/phase4-gemini-implementation-prompt.md)
for Gemini. Phase 4 code and UI Phase 5 motion acceptance have not started.

### UI Phase 4 implementation and verification — October 27, 2026

Gemini's implementation on branch `ui-phase-4` at `5c455ff` delivers:
- **Command Palette (`Cmd+K`)**: accessible modal combobox with categorized task, navigation, action, panel, and settings commands; Up/Down navigation, Enter execution, Tab focus containment, and origin focus restoration.
- **Guarded shortcuts**: `A` (Quick-add), `F` (Focus view), `/` (Search), and `Cmd+K` strictly suppressed during text editing, contenteditable, open modals, popovers, and pending SQLite saves.
- **Single-task Focus screen**: dedicated view rendering one task at a time with context tags, notes, planned duration, authoritative elapsed time (`data-testid="focus-elapsed"`), explicit Start/Pause/Resume and Complete controls, eligible task navigation, empty state, and workspace state preservation on exit.
- **Motion parity**: zero-duration overlay transitions under normal and reduced motion, and 300 ms Focus-calendar opacity transition suppressed under reduced motion.

The complete suite was verified on GitHub Actions hosted Apple Silicon macOS runner ([run 40485227492](https://github.com/yash9008/laptop-planner/actions/runs/40485227492), job `122125218410`):
- `npm run typecheck` passed (0 errors).
- `npm run build` passed (0 errors).
- `npm run test:scheduler` passed in two runner time zones (78/78 in `Asia/Kolkata` and 78/78 in `America/Los_Angeles`).
- `npm run test:db` passed (63/63 SQLite/persistence tests under Electron).
- `npm run test:app` passed (102/102 Electron interaction tests, including all 95 regression tests and 7 new Phase 4 tests).
- Visual evidence captured in wide 1440×900 and narrow 860×680 viewports. Details and receipts are in [docs/phase4-implementation-handoff.md](docs/phase4-implementation-handoff.md).

Phase 4 is complete and stopped; ready for Codex's independent review. Phase 5 has not started.

### UI Phase 4 independent review — October 27, 2026

[Independent review](docs/phase4-implementation-review.md): **needs fixes before
acceptance**. The submitted source `de3d6e9` passes its full hosted suite
(102 Electron tests), but independent probes reproduce loss of board
scroll/date on Focus exit, stale selection in the F shortcut, lost focus on
palette navigation and help dismissal, invisible dock controls receiving Tab,
and repeated Cmd+K dismissal. The refined probes also reproduce Enter on the
palette Close control executing Add task, and palette-to-editor handoff
returning focus to the board instead of Search. The final
[full hosted run](https://github.com/yash9008/laptop-planner/actions/runs/40490966909)
on `5ff04a0` passed type-check/build, scheduler 78/78 in each time zone, and
database 63/63; Electron reported **102 passed, 8 failed**. All 102 existing
tests passed, while all eight independent probes reproduced findings.
Application source and existing tests are unchanged by the review; the
original `ui-phase-4` checkout is restored. Phase 5 has not started.

### UI Phase 4 fix verification — October 27, 2026

Findings R1–R8 from Codex's independent review were resolved:
- **R1**: Retained planning board DOM hierarchy during Focus mode (`display: none`, `inert`, `aria-hidden`) and restored panned scroll offset and calendar date on exit.
- **R2**: Synchronized `selectedTaskIdRef` on render and updated shortcut listener dependencies to eliminate stale closures on bare `F`.
- **R3**: Preserved initiating workspace origin across palette navigation and transferred keyboard focus to the Focus screen primary action button upon entry.
- **R4**: Set `inert` on the concealed calendar dock during Focus mode to exclude its divider and controls from sequential Tab navigation.
- **R5**: Deferred focus restoration on keyboard help dialog dismissal until React removes shell `inertness`.
- **R6**: Guarded palette Enter handler against native button targets to allow normal Enter activation on Close and Clear query buttons.
- **R7**: Added `event.repeat` guard to CommandPalette window keydown listener to prevent repeated `Cmd+K` from immediately closing the palette.
- **R8**: Carried task origin element and `'search'` surface ownership through the palette-to-editor handoff to restore focus to Search upon closing the editor.

All eight independent probes from review revision `5ff04a0` were imported into `tests/app/phase4-independent-review.spec.ts` alongside four related regression tests.
The full check suite passed on the hosted Apple Silicon macOS runner ([run 40497127060](https://github.com/yash9008/laptop-planner/actions/runs/40497127060), job [122165286408](https://github.com/yash9008/laptop-planner/actions/runs/40497127060/job/122165286408)): typecheck (0 errors), build (0 errors), scheduler (78/78 in two time zones), database (63/63), and Electron interaction (114/114 passed, 0 failed).
Receipts and details are recorded in [docs/phase4-fix-handoff.md](docs/phase4-fix-handoff.md). Ready for Codex re-review. Phase 5 has not started.

## Previously recorded release verification

The last completed release verification recorded:

- 78 scheduler tests in each of two runner time zones.
- 63 SQLite/database tests under Electron.
- 48 Electron interaction tests.
- Packaged arm64 app and DMG-mounted copy: renderer/main network rejection, SQLite writes, backup/restore, restart persistence, 270 planned minutes (4h30m), and split intervals 13:00–14:00 / 16:00–17:00.
- App signature verification and a DMG checksum.

These are the previously recorded results, not a claim that documentation edits reran the suite. Test counts may change with future work. Current runner time zones are Asia/Kolkata and America/Los_Angeles; see `scripts/test-scheduler.mjs`.

## Release artifacts

Current version: `0.1.0`.

- App: `release/mac-arm64/Laptop Planner.app`
- Installer: `release/Laptop-Planner-0.1.0-arm64.dmg`
- Packaged reports/screenshots: `release/verification/`
- Installer digest: `release/SHA256SUMS.txt`

Build with `npm run package:mac`; verify with `npm run verify:package`. The app is locally ad-hoc signed. The DMG is unsigned. Apple Developer ID signing/notarization are not configured.

## Backlog

### Pomodoro mode idea — not implemented

Add an optional work/break cycle mode alongside the existing elapsed-time focus timer. The current timer is a count-up timer and does not implement Pomodoro cycles.

Potential scope, to settle before implementation:

- Configurable work, short-break and long-break durations, plus the long-break cadence. Exact defaults are undecided.
- Show the current cycle and remaining interval in the app and menu bar while retaining the task's actual elapsed work total.
- Decide whether cycle transitions require confirmation or can start automatically, and whether local alerts are wanted.
- Keep break time separate from task actual work and remaining-estimate calculations. Ending a work interval should not silently complete the task.
- Persist enough cycle state to handle pause/resume, sleep, quit, interruption, midnight and restart consistently with current recovery rules.
- Add meaningful tests for interval transitions, work/break accounting, menu bar parity and recovery. Keep the scheduling engine independent of Electron and UI.
- Keep everything local; do not introduce accounts, cloud services or network calls.

This backlog entry is a design idea, not an accepted specification or an instruction to start coding.

## Remaining verification and distribution limits

No requested Phase 6 feature is intentionally deferred. Outstanding checks are physical hardware sleep/wake and power loss, another Mac, and an Internet-downloaded/quarantined copy. Native power-event handlers and process-kill recovery have automated coverage.

Developer ID signing and Apple notarization would require a separate distribution decision and developer identity; they are outside the current local build setup. See [docs/acceptance.md](docs/acceptance.md) for the recorded coverage and limitations.
