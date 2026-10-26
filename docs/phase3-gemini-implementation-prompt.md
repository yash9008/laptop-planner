# UI Phase 3 — Finding and organizing work

Implement **UI Phase 3 only** in `/Users/yashsawant/Documents/Projects/sunsama clone` when the user sends this prompt as an implementation instruction. This saved planning document alone does not authorize execution. Phase 3 covers filters, global search, and utility panels. Keep Phase 4's command palette/Focus screen and Phase 5's exhaustive motion work out of scope.

## Implementation and review roles

Antigravity implements Phase 3 and performs its own verification. Codex will
independently review the implementation after the user reports that Antigravity
has finished. Deliver a concrete handoff marked **Ready for Codex review**;
do not mark Phase 3 independently accepted or infer acceptance from a green
CI run alone. Complete the implementation and required checks rather than
stopping after a plan. The user will initiate the review; do not send messages
to another agent or chat.

## Repository and GitHub access

The public remote is `https://github.com/yash9008/laptop-planner.git`.
GitHub CLI is installed at `/opt/homebrew/bin/gh` and was authenticated as
`yash9008` when this prompt was prepared. Antigravity can invoke the same CLI
from its terminal; access depends on its terminal permissions and the existing
macOS login/keychain session. Check access rather than assuming a ChatGPT
plugin is required:

```sh
cd "/Users/yashsawant/Documents/Projects/sunsama clone"
git status --short
git remote -v
/opt/homebrew/bin/gh auth status
```

Record the starting commit and branch in the handoff. Work on a dedicated
Phase 3 branch, preserving any existing user changes. Commit and push the
implementation, relevant tests, and handoff to `origin` for hosted validation.
Do not upload personal data, credentials, generated builds/releases, or ignored
reference captures. Do not force-push or change repository visibility, account
billing, runner type, or payment settings. If CLI authentication is unavailable
to Antigravity, report the actual error and required user action; do not
silently switch to local GUI tests.

## Read and preserve the baseline

Read AGENTS.md, PLAN.md, docs/phase2-final-review.md, docs/phase2-interaction-contract.md, docs/motion-timings.md, and the current source/tests. Historical Phase 2 review findings are resolved as described in the final review; preserve their fixes and regression tests. Do not rerun reference-capture harnesses into existing evidence directories or overwrite their screenshots/results.

Keep the existing charcoal design and Laptop Planner branding. This phase adds working controls and continuity, not placeholder menus or a visual rewrite. No new dependencies, lockfile changes, database/schema changes, scheduler changes, runtime networking, integrations, automatic rollover, or generic IPC/filesystem access. Use existing typed operations and locally available planner snapshots. Do not inspect or modify Sunsama or macOS settings.

## Required behavior

### 1. Anchored project/status filters

Replace the shifting inline filter strip with an anchored, keyboard-accessible chooser. Support project: All projects / No project / an existing project; status: All / Incomplete / Completed; and retain a local text filter for title, notes, and project name. Give controls clear labels, active-filter indication, and an explicit clear action.

Filters intersect the current view's existing scope: board dates stay board dates, backlog stays backlog, and a project view stays within its project. They affect presentation only. Never alter task dates/order, scheduling inputs, capacity/workload totals, focus accounting, or recurrence. Completed/total workload summaries must continue to use underlying data rather than filtered rows. Do not silently use a visibility filter as a task-creation default: existing selected-project-view and selected-date/backlog defaults remain authoritative.

Local text/project/status filtering and global search use separate state. Clearing a local filter must not erase the global query. Keep filter state through utility-panel changes and dialog dismissal during the session; no new persisted settings are required.

### 2. Global local-data search

Add a Search utility-panel entry. Search all available, non-deleted `day.allTasks` records, including completed tasks, backlog, and dates outside the visible board. Match trimmed, case-insensitive literal text against title, notes, and project name. Do not materialize imagined future recurrence occurrences or search external services. Global search ignores the main view's filters; disclose that scope in the UI.

Results show task title, assigned date or Backlog, project, and completion state with an accessible result count and empty/no-match states. Use deterministic ordering and stable task IDs. Preserve the query and active result by ID through planner refreshes, edits, and timer ticks; do not bind actions to an array index or a captured obsolete task object.

Opening a result uses the existing Phase 2 editor without rebasing the board or changing its selected date. After editing/deleting/moving, update the result from the latest committed data, preserve the query, and focus the originating result or a visible fallback in that panel. Existing draft reconciliation, errors, and atomic saves apply. No new global command-palette shortcut such as Cmd+K belongs to this phase; the Search button remains fully keyboard reachable.

### 3. Backlog/search/recovery utility panels

Use one utility-panel host with active mode Backlog, Search, Recovery, or closed. Only one utility panel is open at a time. Reuse the right dock area: temporarily replace the calendar while a utility panel is open, retain the user's calendar visibility/width, and restore it on closing. Selecting Calendar explicitly returns to it. At narrow widths the main workspace must remain usable with no page-wide horizontal overflow; use scrolling within the panel and responsive bounds.

Keep the existing full Backlog and project navigation working. A dedicated utility-rail Backlog control opens the panel beside the current main view; distinguish its accessible label from full-view navigation. Backlog panel rows use existing task operations, estimate/editor/menu behavior, and safe drag-to-date support where already available. They do not introduce new scheduling semantics.

Recovery is an actionable presentation of **existing** state: the current paused/recovered focus session and its saved reason, plus current read/write/storage errors. A healthy state has a truthful empty message. Expose existing explicit Resume/Open task/Refresh day/Open storage tools actions as applicable. Resume must remain explicit and preserve UTC elapsed-time authority; switching panels must not start/pause/complete a timer. Route backup/restore to the existing dialog, native pickers, and explicit restore confirmation; do not create another restore implementation, reset a database, or fabricate a recovery queue/history. Recovery/storage access must remain reachable when `getDay` fails and no day snapshot exists. Preserve drafts and useful error messages after failed operations.

## State and interaction rules learned from Phase 2

Before editing, write a concise state/ownership table in `docs/phase3-implementation-handoff.md`: filters, local text query, global query/active result, active panel, calendar preference, overlay owner, and draft owner. State what persists across close/reopen, navigation, and refresh. Proceed with implementation in this same task; do not stop after planning.

- Keep the board mounted across utility-panel changes. Do not reset its scroll, seven-day range/navigation key, or selected-day state merely because a panel opens. Preserve horizontal position where geometry allows; if viewport clamping is unavoidable, keep nearest-left-column selection truthful rather than inventing a new calendar-following rule.
- Use stable task IDs plus the latest committed snapshot for actions. Reconcile retained dirty fields against their baseline. Never replace drafts on timer refresh or discard them before a successful mutation. Delete failures must preserve records and drafts; successful deletion/Undo must not resurrect obsolete drafts.
- Treat board, backlog, and search as multiple presentations of the same records. Scope locators and focus targets to the originating surface, avoid duplicate HTML IDs, and never select the first DOM row as an identity shortcut.
- Utility panels are non-modal and allow board interaction. Modal editors make the background inert; their drafts and panel state survive. Child popup Escape closes only that child. Escape with a task dialog open must not also close the utility panel. Outside clicks must not leak into background actions or commit a draft.
- Capture the actual current trigger each time a surface opens, including repeated entry from different controls. Restore focus only after DOM/inert/visibility changes have committed; use `preventScroll`, a connected visible target, and a safe fallback in the same surface. Focus newly visible popovers once without stealing focus during resize or typing. Guard workspace shortcuts while overlays own keyboard interaction, including transient BODY focus.
- Render viewport-positioned popovers outside transformed/scrolling containing blocks. Measure actual dimensions, fit/flip/clamp within the viewport, and update on relevant resize/scroll. DOM visibility alone is not proof that a menu can be seen and clicked.
- Keep write-pending dismissal/submit guards and originating-surface ownership. A delayed response or out-of-order search/render update must not overwrite, close, or attach errors to another task/panel. Keep attempted values and local errors available for retry.
- Preserve whole-card drag, insertion preview, atomic drop/rollback, cancellation, click suppression, and hidden-task ordering. A filtered drop uses full record IDs/order: hidden tasks retain their relative order, and cancellation/failure leaves all records unchanged. Verify against the current `beforeTaskId` contract; do not derive persistent order from visible indexes alone.

## Motion boundary

Use supported navigation opacity/icon feedback only where the component corresponds to the evidence. The 300 ms layout-margin rule's trigger is unverified: do not blindly assign it to panel widths. Start panel layout transitions without invented motion, document these as Laptop Planner design choices, and leave exhaustive parity to Phase 5. Reduced motion, interrupted actions, and errors must retain immediate meaningful feedback and working focus.

## Delivery batches and verification

Complete these internal batches sequentially without stopping for permission between them: anchored filters; global search; utility-panel integration; acceptance/visual verification. One agent edits/builds/tests the shared checkout at a time. Refactor only as needed to establish clear ownership; avoid another wholesale rewrite of App.tsx.

Add behavioral regressions, not just happy-path clicks or assertions of CSS class names. At minimum test:

1. Combined project/status/text filters, clearing, and unchanged underlying tasks/order/schedule/totals under a controlled clock.
2. Global matches in completed, backlog, and off-board-date records despite local filters; zero matches; separate local/global query state.
3. Open result → edit → save/fail/retry → close: query, stable result targeting, drafts, selected date, scroll, and focus remain correct. Delete failure and Undo preserve expected state.
4. Repeated Backlog/Search/Recovery/Calendar switching after panning, with calendar initially shown and hidden; queries/filters and calendar width remain intact. Validate narrow and wide windows.
5. Parent/child Escape, forward/reverse Tab, actual initial/restored focus, repeated opening from different triggers, and A while a modal owns keyboard interaction.
6. Filtered whole-card drag with hidden neighboring tasks, cross-day/backlog drop, cancellation, and failed-save rollback without hidden-record reordering.
7. Paused/recovered focus, explicit Resume, unaffected elapsed time during panel changes, and recovery access when storage reads fail. Never use the personal database.
8. Delayed writes, rapid panel/result switches, and normal/reduced motion. Test actual visible/clickable popup bounds and focus, not only presence in the DOM.

Use the existing real Electron fixture patterns, temporary data directories, controlled clocks, and observable completion. Update existing tests only for intentional UI flow changes while retaining acceptance assertions. Run focused checks while working, then `npm run check` at the completed phase boundary. Run a disposable real-app preview, inspect wide/narrow screenshots, and fix failures. Do not claim a check passed if tools were unavailable or results were merely inferred.

**Run GUI validation in the background on GitHub, not on this Mac.** The user
wants to keep using their browser without test windows or focus interruptions.
Use the public `yash9008/laptop-planner` repository and its standard macOS
**Planner checks** workflow for the complete `npm run check`; use the
push-triggered full job for the exact uploaded revision, not the optional
board-wheel diagnostic. Follow `docs/github-actions.md` and `AGENTS.md`.
Disposable Electron previews and visual checks must also run on a hosted
desktop unless the user explicitly requests local execution. Retrieve and
inspect actual synthetic screenshot evidence before claiming visual
verification; the current workflow retains logs but does not upload screenshot
artifacts. Keep Actions usage on the free standard public-repository runner
and do not enable paid features. If hosted validation is blocked, report that
blocker rather than launching local GUI tests or claiming success.

After committing and pushing, identify the full push-triggered run for that
exact commit:

```sh
git push -u origin HEAD
/opt/homebrew/bin/gh run list --repo yash9008/laptop-planner --workflow check.yml --event push --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId,status,conclusion,url,headSha
```

If the run has not appeared yet, wait briefly and list again. Use its returned
ID with `/opt/homebrew/bin/gh run watch RUN_ID --repo
yash9008/laptop-planner --exit-status`. On failure, read `/opt/homebrew/bin/gh
run view RUN_ID --repo yash9008/laptop-planner --log-failed`, fix the cause,
commit/push, and wait for the new revision's full check. A diagnostic-only,
historical, pending, cancelled, timed-out, or skipped run does not satisfy the
full-check requirement. Do not add skip instructions to implementation or
test-change commits, remove assertions, or enable retries simply to obtain a
green result. Do not finish while required checks are still running.

Update `docs/phase3-implementation-handoff.md` with the final changed files, exact commands/results, cases actually exercised, screenshots, remaining limitations, and any departure from this specification. Separate reported implementation from verified acceptance; keep reviewer evidence immutable. Stop after Phase 3 for review. Do not start Phase 4 or build/install a DMG.

End with **Ready for Codex review** only when the required implementation and
self-verification are complete. Include the branch, starting commit, tested
commit, full CI run URL/result, the handoff path, actual visual evidence, and
any remaining limitations. If a required item is blocked or incomplete, state
that plainly instead. Codex will review the diff and acceptance behavior,
inspect the evidence, and run independent hosted checks/probes as needed.
