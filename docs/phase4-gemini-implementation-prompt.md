# Gemini / Antigravity prompt — UI Phase 4

Implement **UI Phase 4 — Keyboard navigation and focused work** in Laptop
Planner. This means the UI improvement phase in `PLAN.md`, not the already
completed original Phase 4 planning-tools work. Deliver the implementation,
tests, hosted verification, and a reviewable handoff in this task. Codex will
independently review it after the user reports completion. Do not start UI
Phase 5, package/install a DMG, or mark your own work independently accepted.

## Workspace and baseline

```sh
cd "/Users/yashsawant/Documents/Projects/sunsama clone"
git status --short --branch
git log -5 --oneline
git remote -v
/opt/homebrew/bin/gh auth status
```

Read `AGENTS.md`, `PLAN.md`, `NOTES.md`, `docs/phase3-final-review.md`,
`docs/phase3-fix-review.md`, `docs/phase2-interaction-contract.md`,
`docs/motion-timings.md`, and `docs/github-actions.md`, plus the current
application and relevant tests. The Phase 3 final review identifies the
verified starting source and its full hosted run; preserve its fixes. Do not
base Phase 4 on the older failing independent review branch.

Start from the latest verified `ui-phase-3` source with its final-review
documentation. Create a dedicated `ui-phase-4` branch if it does not already
exist. If it exists, inspect it and continue without resetting user work.
Record the starting branch/commit and any uncommitted changes. Preserve
existing user changes and immutable historical evidence. The public remote
is `https://github.com/yash9008/laptop-planner.git`; terminal Git and GitHub
CLI access can be used without the ChatGPT GitHub plugin.

Before implementation, write a concise state/ownership and shortcut table in
`docs/phase4-implementation-handoff.md`. Then implement in this same task;
do not stop after a plan. Resolve ordinary implementation details yourself.

## 1. Accessible local command palette

Add a visible toolbar control with the **Cmd+K** hint and a command palette
opened with Cmd+K. It uses local application state only. Provide an accessible
dialog name, initially focused query, labelled results, deterministic order,
clear empty/no-match states, keyboard navigation with Up/Down and Enter, and
Escape to dismiss. Constrain it to the viewport at wide and narrow sizes;
scroll its results internally. Make the background inert while it owns focus
and support forward/reverse Tab without escaping the dialog.

Provide a small useful command set, using existing actions:

- Navigate to Board, Today, Backlog, or Focus.
- Add a task using the current date/project/backlog defaults.
- Open Search, Backlog, or Recovery utility panels; show Calendar.
- Open existing storage/settings tools.
- For an explicitly selected task: Edit, Start/Resume focus, Pause focus, and
  Complete/Reopen as appropriate. State the target task in each command label.

Commands must use the latest committed snapshot and a stable task ID. Capture
task context from the actual invoking card/result/control before focus moves
into the palette. Do not guess the target from the first DOM match or last
array index. A task highlighted only by a search query is not implicitly a
chosen task. Explain disabled commands; skip disabled items during keyboard
execution. Refresh eligibility if a task is completed, moved, deleted, or
changed while the palette is open. Never execute a stale command against a
different row. Disable mutations while a write is pending.

Use one invocation per keypress; ignore repeated/IME-composition events and
respect `defaultPrevented`. Cmd+K toggles the palette when it already owns
focus. While an editor, composer, nested popup, native dialog, drag, or pending
mutation owns interaction, it must not steal focus or close that owner.
Opening the palette from the non-modal Search input may preserve its query,
but must not discard any retained task draft. Do not introduce a global OS
shortcut, browser/OS interception, or a second search implementation for
planner records: Search remains the all-task search surface.

Closing without an action restores the actual invoking control, or a visible
fallback within its originating surface. When a command opens an editor or
changes navigation, transfer focus deliberately after the palette is removed
and inert state is cleared; do not race a generic close-focus effect against
the destination. Reuse and extend Phase 3's focus-origin handling rather than
adding another independent set of stale trigger refs.

## 2. Keyboard actions and task context

Keep `A` for quick-add. Add unmodified `F` to enter Focus and `/` to open
Search, and show their hints in a compact keyboard-help view reachable from
the palette. Retain the board's Left/Right arrow navigation and existing
popup/editor/menu keys. No destructive global Delete/Backspace shortcut is
required in this phase.

Route shortcuts through one consistent eligibility/ownership check. Bare keys
must do nothing as workspace commands while typing in inputs, textareas,
selects, any contenteditable descendant, during IME composition, or while a
modal, child popup, drag, pending mutation, or native-dialog request owns the
interaction. Protect the transient BODY-focus interval during surface
handoff. Preserve normal text selection, editing, and browser input behavior.
Avoid multiple listeners firing the same action after rerenders.

Task selection is ephemeral renderer state, separate from keyboard focus,
global Search's query/result identity, filters, and persisted timer state.
Use stable IDs and an intentional click/focus action to choose a task. Keep
selection visually and accessibly apparent without turning ordinary buttons,
completion controls, and drag handles into conflicting click targets. Remove
or reconcile deleted targets; do not silently transfer selection by index.

## 3. A real single-task Focus screen

Replace the current Focus view's day-list presentation with a dedicated screen
for **one task at a time**. Show its title, project/date context, notes,
planned duration, saved actual/elapsed time, and clear Start/Resume/Pause,
Complete, Edit, and Exit Focus controls. Provide a useful empty state when
there is no task to show. Do not render the whole daily task board as Focus.

For generic entry via navigation or `F`, prefer the existing active/paused
focus task, otherwise the explicitly selected available task, otherwise a
deterministic incomplete task assigned to today. A task-specific palette
action uses that explicitly labelled task. Preserve main-process focus
eligibility: backlog, completed, and other-date tasks cannot become runnable
merely by being displayed. Explain unavailable actions; do not assign dates
or change list order to make a task eligible.

Displaying a task, navigating between tasks, entering/exiting Focus, or closing
an overlay must never start, resume, pause, complete, or transfer a timer.
Timer actions require explicit controls/commands and use the existing typed
operations. There remains exactly one persisted focus session. If a different
task is running while another is displayed, show that fact and label actions
truthfully. Starting a different eligible task uses existing atomic behavior;
do not invent a second timer or new switching semantics.

After successful completion, choose the next appropriate incomplete task
deterministically for display, or show the empty state; never auto-start it.
On a failed completion/start/pause/save, keep the displayed task, useful error,
and retry controls coherent with committed state. Editing from Focus retains
the existing draft/reconciliation and nested-dismissal behavior.

Elapsed time stays authoritative in Electron main: UTC timestamps,
checkpoints, actual totals, menu-bar state, midnight/DST handling, and explicit
recovery/resume remain unchanged. Do not implement renderer interval counters
as a competing authority or count sleep/closed/interrupted time. A recovered
or paused timer remains paused after entering Focus or reopening the app.

Entry/exit must preserve the previous workspace view, board range/selected
date/scroll, filters, Search query, utility panel, and calendar preference and
remembered width. Hide distracting workspace chrome only as presentation;
do not clear its state or call date navigation merely to enter Focus. Exit
restores the prior workspace and a visible initiating control/fallback.
Escape closes the innermost popup/dialog/palette first; only when none owns
it may Escape exit Focus. Do not bind Space globally in a way that breaks
buttons, typing, or scrolling.

## 4. Motion and reference evidence

Preserve Laptop Planner's charcoal style and branding. Read the existing
reference evidence before choosing transitions. `docs/motion-timings.md`
records a **loaded declaration** for Focus-calendar opacity: 300 ms,
`ease-in`, no delay. Its actual Focus trigger/enter/exit behavior has not
been verified; it is not permission to apply a universal 300 ms fade to the
screen, palette, backdrop, or every control.

Verify actual Focus/palette behavior only through an available authorized
synthetic/demo reference. Do not inspect, modify, create fixtures in, or use
the user's private Sunsama data; do not change macOS settings. Do not launch
local reference windows/previews that interrupt this Mac. If a suitable hosted
reference is unavailable, record that precise evidence gap and continue the
functional implementation with conservative motion; do not claim reference
parity or turn an unexercised CSS rule into an observed timing.

Use component-specific evidence. Check normal and reduced motion, rapid
opening/closing, reversal/interruption, focus transfer, narrow bounds, and
pending/error states. Reduced motion must suppress nonessential transitions
without delaying focus, saves, or explicit timer actions. Distinguish computed
durations from observed effect spans and from end-to-end action latency.
Keep unmatched reference motion listed for UI Phase 5 acceptance.

## 5. Preserve architecture and data

This is renderer UI work using existing typed operations. No new dependencies,
lockfile changes, schema/migration changes, scheduler changes, production test
bypasses, generic IPC/SQL/filesystem exposure, runtime networking, cloud
accounts, telemetry, integrations, or OS-wide shortcuts. Keep Electron
isolation and network/navigation/permission restrictions intact. Do not use
personal data as test fixtures or reset/replace a database to fix an error.

Preserve atomic writes, creation retry IDs, failed-save drafts, Undo,
recurrence identities, board dragging/insertion/hidden-task ordering,
cancellation/rollback, nearest-left-column calendar following, local backups,
and native restore confirmation. Phase 4 does not include Pomodoro, subtasks,
timeboxing, manual actual-time entry, or daily/weekly planning rituals.

## 6. Required meaningful coverage

Retain all existing assertions, including Phase 3 R1–R8 regression cases.
Add hosted real-Electron tests that exercise behavior, not just component
presence or misleading test titles:

1. Palette open/toggle/close; query filtering and no matches; disabled command
   handling; Up/Down/Enter; Tab/Shift+Tab; Escape and outside-click containment;
   initiating control restoration across board, Search, Backlog, and Focus.
2. Palette-to-editor/panel/navigation handoff; latest-ID targeting with duplicate
   task presentations, refresh, deletion/movement/completion while open;
   pending and failed mutations with successful retry and no duplicate action.
3. Shortcuts in ordinary workspace versus inputs/contenteditable/IME, open
   child popups, editors, drag, and pending writes. Repeated keys/listener
   rerenders do not create duplicate tasks or invoke commands twice.
4. Single-task Focus selection/empty states, task navigation, edit round-trip,
   explicit start/pause/resume/complete, failed action recovery, and no timer
   mutation from entry/exit/selection alone. Ineligible targets stay ineligible.
5. Controlled-clock UTC elapsed time, pause/recovery and menu-bar consistency;
   preserved workspace/date/scroll/calendar/filter/Search state after Focus.
6. Wide 1440×900 and narrow 860×680 screenshots of the palette, a populated
   Focus screen, and paused/recovered Focus. Check actual visible bounds and
   document overflow. Capture a state only after observable assertions show
   the claimed task/status; retrieve and inspect the actual PNGs.
7. Normal/reduced-motion computed properties and relevant observed transitions,
   rapid reversal/cancellation, correct focus and no delayed-write dismissal.
   Inject real delayed/failed responses if claiming those cases are covered.

Use disposable databases and controlled clocks. Align native content size
with the Playwright viewport, use one UI worker, and wait on observable state
rather than arbitrary sleeps. Preserve immutable prior screenshots/results;
save new evidence under Phase 4 paths.

## 7. Run every GUI check on GitHub

The user wants to use their browser uninterrupted. **Do not run local Electron
UI suites, `npm start`, previews, or packaged verification.** Local typecheck,
build, scheduler, and the provided non-GUI database runner are permitted.
The complete `npm run check`, disposable app interaction, and screenshot
capture must run on GitHub's hosted desktop.

Use the existing public-repository **Planner checks** workflow, full
push-triggered **Full checks on Apple Silicon macOS** job on standard
`macos-26`. Keep the public-only guard, pinned actions, no artifact uploads or
cache, and no paid/larger runners. Do not change billing or visibility, weaken
assertions, add blanket retries, or skip implementation/test-change checks.

```sh
git push -u origin HEAD
gh run list --repo yash9008/laptop-planner --workflow check.yml --event push --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId,status,conclusion,url,headSha
```

Wait for the returned exact revision's full run using `gh run watch RUN_ID
--repo yash9008/laptop-planner --exit-status`. Inspect failures, fix them, and
push again until required checks pass. A manual board-wheel diagnostic,
historical run, pending, cancelled, skipped, or timed-out check does not count.
If hosted access is blocked, report the actual blocker instead of launching
local GUI tests or claiming success.

The workflow does not upload screenshot artifacts. Follow the existing
synthetic screenshot log-marker/base64 pattern for Phase 4, retrieve the raw
Actions log ZIP with `gh api repos/yash9008/laptop-planner/actions/runs/RUN_ID/logs`,
and extract only the controlled screenshots. The normal CLI log display can
truncate long image lines: inspect the raw job log's final summary as well.

## 8. Handoff and stop

Update `docs/phase4-implementation-handoff.md` and the relevant `PLAN.md`
status with final behavior, state/shortcut ownership, changed files, starting
and tested commits, exact commands and counts, full run URL/conclusion,
inspected screenshots, real injected-failure/clock coverage, and remaining
reference or implementation limits. Keep historical evidence immutable.

End with **Ready for Codex review** only when the required implementation and
hosted self-verification are complete. Do not claim independent acceptance or
full motion parity from a green test badge. Stop after UI Phase 4; the user
will initiate Codex's independent review. Do not message another chat/agent.
