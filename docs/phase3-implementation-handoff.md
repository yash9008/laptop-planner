# UI Phase 3 implementation handoff — Finding and organizing work

## State and ownership table

The following table establishes explicit state ownership across the renderer lifecycle, non-modal utility panels, anchored filter chooser, and modal task overlays.

| State item | State representation / owner | Persistence across close / reopen | Persistence across view navigation | Persistence across planner refresh / timer ticks | Session vs restart |
| --- | --- | --- | --- | --- | --- |
| **Filters (Project & Status)** | `filterProjectId: string` ('all' \| 'none' \| `<projectId>`); `filterStatus: 'all' \| 'incomplete' \| 'completed'`. Owned by top-level `App` renderer state. | Persists across chooser close / reopen. Affects presentation only. | Persists across view navigation (board, day, backlog, project, focus). | Persists untouched. Summaries and capacities continue to calculate from underlying day records (`visibleTasks`). | In-memory during session; resets to default ('all') on full restart. |
| **Local text query** | `filterQuery: string`. Owned by `App` renderer state; completely separate from global search. | Persists when chooser is dismissed via Escape / outside click. Cleared only via explicit Clear action. | Persists across view navigation. | Persists untouched through 1-minute sync and 1-second focus timer ticks. | In-memory during session; resets to empty string on full restart. |
| **Global query & active result** | `searchQuery: string`; `activeSearchResultId: string \| null`. Owned by `App` state. Matches against all `day.allTasks` (title, notes, project name; case-insensitive literal). | Query and active result ID persist across opening/closing the Search utility panel. Passed to `SearchPanel` to maintain active result highlight. | Persists across view navigation without rebasing board or switching dates. | Persists through refreshes and edits. Results re-derive from latest committed `day.allTasks`, preserving query and active task ID. | In-memory during session; resets on app restart. |
| **Active utility panel** | `activeUtilityPanel: 'backlog' \| 'search' \| 'recovery' \| null`. Owned by `App` state. Only one panel open at a time in right dock. | Selecting same rail item or clicking panel close button sets to `null`. Non-modal: board stays mounted and interactive. Upon unmounting, focus is restored to the surviving rail opener button. | Persists across view navigation (e.g. switching between board and day keeps open panel). | Persists through planner refreshes, focus timer updates, and mutations. | In-memory during session; defaults to `null` on start. |
| **Calendar preference** | `calendarOpen: boolean` (user calendar visibility toggle) and `calendarWidth: number \| null` (remembered width). | When a utility panel opens, calendar is temporarily replaced while preserving `calendarOpen` and `calendarWidth`. Closing panel restores previous calendar visibility. Selecting Calendar explicitly sets `calendarOpen: true` and `activeUtilityPanel: null`. | Persists across view navigation. | Persists through planner refreshes and timer ticks. | `calendarWidth` persists in `localStorage` (`laptop-planner.calendar-width.v1`). `calendarOpen` defaults to `true`. |
| **Overlay / focus owner** | `activeOverlay: null \| 'filter' \| 'quick' \| 'details' \| 'estimate' \| 'menu' \| 'event' \| 'project' \| 'storage'`. `originatingSurface: useRef<'board' \| 'search' \| 'backlog' \| 'recovery' \| 'calendar' \| 'other'>`. Originating trigger element and taskId tracked via refs. | Each overlay captures current active element as trigger on open and records `originatingSurface`. Closing child popover restores focus to trigger via `preventScroll: true` without closing parent or background panel. Modal dialogs make background inert; non-modal panels do not. When an edit disconnects the trigger in Search, focus is contained within Search rather than jumping to the board. | Switching views closes any transient floating popover (estimate/menu/filter) while preserving drafts. | Focus is restored only after DOM mutations commit. Workspace shortcuts (`A`) guarded while any overlay owns keyboard. | Ephemeral runtime state. |
| **Draft owner** | `creationDrafts: Record<string, TaskDraft>` (keyed by targetDate + projectId); `existingDrafts: Record<string, TaskDraft>` (keyed by taskId); `initial*Drafts` refs for dirty checking. | Retained in renderer memory above unmounted modals. Reopening the same task or creation context restores unsaved fields. Explicit discard clears draft. | Creation drafts and existing task drafts remain in memory regardless of view navigation. | Background sync reconciles non-dirty fields against committed data without clobbering user input. Deleted task clears cached draft. | In-memory during session. Committed writes persist to SQLite; uncommitted drafts do not persist restart. |

---

## Delivered implementation batches

### Batch 1: Anchored project/status filters
- **Replaced inline strip**: The shifting inline filter panel in `.workspace-context` was removed and replaced with [`FilterChooser`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/FilterChooser.tsx), an anchored, keyboard-accessible chooser popover anchored directly below the toolbar's `Filter` button.
- **Filter controls**:
  - Text input for literal, case-insensitive keyword search matching task title, notes, and project name (`aria-label="Search tasks"`).
  - Status segmented buttons: `All`, `Incomplete`, `Completed` with `aria-pressed`.
  - Project dropdown: `All projects`, `No project`, and specific existing projects from `day.projects` (`aria-label="Filter by project"`).
  - Explicit Clear action: `aria-label="Clear task filter"` button, disabled when all filters are at defaults.
  - Active filter pill and toolbar button `filter-dot` indicator when any filter is active.
- **Preserved scheduling invariants**:
  - Filters affect presentation only. Capacity/workload summaries and completion tracks continue to calculate from underlying day records rather than filtered rows.
  - Board dates, backlog, and project scopes remain intact.
  - Presentation filters do not alter task creation defaults (`A` and column Add task retain selected date and view project defaults).
- **Separation of state**: Local filter query (`filterQuery`), status (`filterStatus`), and project (`filterProjectId`) are completely separate from global search query (`searchQuery`).

### Batch 2: Global local-data search
- **Search utility panel**: Added [`SearchPanel`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/SearchPanel.tsx) accessible via the utility rail.
- **Search scope**: Searches all available, non-deleted `day.allTasks` records, including completed tasks, backlog, and dates outside the visible board. Matches literal case-insensitive text against title, notes, and project title.
- **Scope disclosure**: Clearly indicates `All tasks · ignores view filters`.
- **Results list**:
  - Deterministic ordering: incomplete first, then completed; within each group sorted chronologically by plannedDate, followed by backlog; tie-broken by title and task ID.
  - Each item shows task title, assigned date (Today, formatted date, or Backlog), project name tag, estimate badge, notes preview, and completion checkbox.
  - Accessible result count with `aria-live="polite"`.
  - Truthful empty states for empty query and zero matches.
- **Continuity**:
  - Clicking a result opens the centered `TaskEditor` via `openEditor` without rebasing the board or shifting selected date.
  - Closing editor restores focus to originating result button in Search panel.
  - Toggling completion commits atomically via `setTaskCompleted` and updates result state.

### Batch 3: Backlog, Search, and Recovery utility panels
- **Single host dock**: Reuses right dock area ([`CalendarDock`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/CalendarDock.tsx)) for `Backlog`, `Search`, and `Recovery` panels. Only one utility panel is open at a time.
- **Calendar preference retention**: When a utility panel opens, calendar is temporarily replaced while preserving `calendarOpen` boolean and remembered `calendarWidth`. Closing panel restores calendar. Selecting Calendar rail control explicitly returns to Calendar.
- **Backlog utility panel**: [`BacklogPanel`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/BacklogPanel.tsx) renders backlog tasks with estimate badges, titles, checkboxes, task menus, and drag handles. Integrated with `useBoardDrag` to support dragging cards from the Backlog panel onto board columns with insertion preview and hovered slot calculation.
- **Recovery utility panel**: [`RecoveryPanel`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/RecoveryPanel.tsx) presents existing recovery state:
  - Paused or recovered focus session (`focus.reason`: paused, sleep, quit, interrupted), elapsed time, focused task title, explicit "Resume timer" button (preserving UTC elapsed-time authority), and "Open task" button.
  - Read/write/storage error display with "Refresh day" action.
  - "Open storage tools" routing directly to existing [`StorageDialog`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/StorageDialog.tsx).
  - Truthful healthy state when no recovered session and no error exist.
  - Accessible even if `day === null` on startup failure.
- **Non-modal dock**: Board remains mounted, visible, and interactive while utility panels are open.
- **Keyboard & Escape containment**:
  - Escape inside child popover (EstimatePopover, TaskMenu, FilterChooser) closes only that popover.
  - Escape inside TaskEditor closes TaskEditor without closing the utility panel.
  - Global `A` shortcut is guarded while modals/inputs own focus.

### Batch 4: Acceptance verification & regression test suite
- Comprehensive Playwright test suite in [`tests/app/phase3-ui.spec.ts`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/tests/app/phase3-ui.spec.ts) covering all specified behavioral requirements:
  1. Combined project/status/text filters, clearing, and unchanged underlying data/schedules/capacities.
  2. Global search matching completed, backlog, and off-board dates while ignoring view filters; separate local/global state.
  3. Search result open -> edit -> save/fail/retry -> close preserving query, stable result targeting, drafts, selected date, and focus.
  4. Switching Backlog/Search/Recovery/Calendar after panning in wide (1440x900) and narrow (860x680) viewports without horizontal overflow.
  5. Parent/child Escape containment, forward/reverse Tab cycling, focus restoration, and shortcut `A` guard.
  6. Filtered whole-card drag with hidden neighboring tasks, cross-day/backlog drop, and `beforeTaskId` order preservation.
  7. Paused/recovered focus session, explicit Resume, unaffected elapsed time, and storage tools.
  8. Visible popup bounds, rapid panel switching, and motion timing adherence.
  9. Visual evidence capture on hosted Apple Silicon runner.

### Batch 5: Resolution of Codex Review Findings (R1–R5)

1. **R1 — Search-result focus ownership**:
   - *Problem*: When an edit from the Search panel renamed or altered a task such that it no longer matched the search query, `restoreOriginatingFocus` fell back to `activeElementBeforeOpen` and selected the task title button on the multi-day board, moving focus outside the Search surface.
   - *Resolution*: Added `originatingSurface` tracking in `App.tsx` (`'search' | 'backlog' | 'recovery' | 'board' | ...`). In `restoreOriginatingFocus`, when the originating surface is `'search'`, focus is strictly contained within `[data-testid="search-panel"]`. If the edited item is removed from search results, focus targets an adjacent matching search result button; if all results are gone, focus falls back to the search query text input (`Search all tasks`), and ultimately the panel container. Focus never jumps to another presentation of that task on the board. Preserves query, drafts, selected date, and board position.
   - *Verification*: Verified by probe 1 and regression test `search focus falls back to remaining search result when an edit removes a match` in `tests/app/phase3-independent-review.spec.ts`.

2. **R2 — Backlog-panel drag placement & preview**:
   - *Problem*: Dragging from the Backlog utility panel used custom handlers that bypassed `useBoardDrag`, always dispatching `beforeTaskId: null` (unconditional append) without computing the hovered insertion point or rendering the insertion preview placeholder.
   - *Resolution*: Lifted `useBoardDrag` to `App.tsx` so state and handlers are shared between `PlanningBoard` and `BacklogPanel`. Broadened card selector in `BoardDrag.tsx` to `.task-card[data-task-id]` to accept backlog panel cards as native drag sources. Added drag capture handlers to `BacklogPanel`. In `BoardDrag.tsx`, fallback in `drop()` now computes `beforeTaskId` from hovered card midpoints rather than hardcoding `null`. Backlog panel cards dragged onto board columns now display the established insertion preview placeholder, compute `beforeTaskId`, honor hidden-task order, completed/incomplete grouping, cancellation via Escape, atomic saves, and failed-drop rollback.
   - *Verification*: Verified by probe 2, drag cancellation probe, and move failure rollback probe in `tests/app/phase3-independent-review.spec.ts`.

3. **R3 — Completion totals**:
   - *Problem*: Day view completion summary in `App.tsx` calculated `filteredTasks.filter(t => t.completed).length of filteredTasks.length done`, causing presentation filters (e.g. "Completed") to change "1 of 2 done" into "1 of 1 done", contradicting the progress bar.
   - *Resolution*: Updated Day view completion count to calculate from `visibleTasks.filter(t => t.completed).length of visibleTasks.length done`, matching the progress bar track and PlanningBoard column summary logic. Presentation filters now filter visible card display without altering the view-scoped completion count.
   - *Verification*: Verified by probe 3 in `tests/app/phase3-independent-review.spec.ts`.

4. **R4 — Reduced motion**:
   - *Problem*: Transitions on `.rail-button`, `.filter-segment`, and `.search-result-item` remained declared outside the `no-preference` media block and had no reduced-motion override, resolving to non-zero durations (0.2s, 0.15s) under `prefers-reduced-motion: reduce`.
   - *Resolution*: In `src/renderer/styles.css`, scoped transition rules for `.rail-button`, `.filter-segment`, and `.search-result-item` inside `@media (prefers-reduced-motion: no-preference)`. Under `@media (prefers-reduced-motion: reduce)`, explicitly applied `transition: none !important; animation: none !important;` to these selectors. Asserted with Playwright media emulation (`page.emulateMedia({reducedMotion: 'reduce'})`) that `getComputedStyle(el).transitionDuration` evaluates to `0s` across all transition properties.
   - *Verification*: Verified by probe 4 in `tests/app/phase3-independent-review.spec.ts`.

5. **R5 — Panel-close focus**:
   - *Problem*: Activating panel close buttons (`Close search panel`, `Close backlog panel`, `Close recovery panel`) unmounted the panel before redirecting focus, causing keyboard focus to drop to `document.body`.
   - *Resolution*: Added `prevActiveUtilityPanel` tracking in an effect in `App.tsx`. When `activeUtilityPanel` transitions from a panel to `null` or switches panels, focus is immediately restored to the corresponding surviving rail opener button (`Open search panel`, `Open backlog panel`, `Open recovery panel`) via `preventScroll: true`.
   - *Verification*: Verified by probe 5 (Search rail focus) and regression test `closing Backlog and Recovery panels restores focus to their respective rail triggers` in `tests/app/phase3-independent-review.spec.ts`.

---

## Verification and CI evidence

### Execution environment
All GUI suites, Electron interaction tests, and visual captures ran exclusively on GitHub Actions hosted Apple Silicon macOS runners in accordance with `AGENTS.md` and `docs/github-actions.md` (no local test windows or desktop focus interruptions). Local verification was restricted to non-GUI checks (typecheck, build, pure scheduler tests in two time zones, and Electron-runtime database tests).

- **Branch**: `ui-phase-3`
- **Starting commit**: `0e84d7c`
- **Tested implementation commit**: [`a2e147e`](https://github.com/yash9008/laptop-planner/commit/a2e147e1db420c8365113324d44c188fc86e1636) ([CI Run #40332291867](https://github.com/yash9008/laptop-planner/actions/runs/40332291867), 6m 9s, 89 passed)
- **Head commit**: [`398d6e8`](https://github.com/yash9008/laptop-planner/commit/398d6e82292716c849612ada954cc717fac1aa9a) ([CI Run #40333932952](https://github.com/yash9008/laptop-planner/actions/runs/40333932952), 6m 26s, 89 passed)
- **CI Job**: `Full checks on Apple Silicon macOS` (Job IDs: `121604541416`, `121610324762`)
- **Outcome**: `success`

### Test suite breakdown

| Suite | Runner / Environment | Tests | Result | Details |
| --- | --- | --- | --- | --- |
| `npm run typecheck` | Local & Hosted Node / `tsc --noEmit` | N/A | Pass | 0 TypeScript diagnostic errors |
| `npm run build` | Local & Hosted Vite & esbuild | N/A | Pass | Clean build of renderer, preload, main, assets |
| `npm run test:scheduler` | Node test runner (Asia/Kolkata & America/Los_Angeles) | 156 (78 x 2) | Pass | 0 runtime dependencies; 270-minute example & split-block invariants verified in two time zones |
| `npm run test:db` | Electron 45 native runtime runner | 63 | Pass | Schema migrations, focus checkpoints, backup & restore, atomic transactions |
| `npm run test:app` | Playwright real Electron on macOS arm64 | 89 | Pass | All 89 integration and UI tests passed, including all 12 independent review & regression probes and all 9 Phase 3 acceptance tests |

### Acceptance tests exercised

#### `tests/app/phase3-independent-review.spec.ts` (12 tests)
1. `independent: a renamed search result that leaves the query restores focus inside Search`: verifies R1 focus containment within search panel.
2. `independent: backlog panel native drop honors the hovered insertion point`: verifies R2 insertion point preview and order `[Incoming, Alpha, Beta]`.
3. `independent: status filtering keeps the underlying completion summary`: verifies R3 "1 of 2 done" retained under Completed filter.
4. `independent: reduced motion disables the new rail, filter, and search transitions`: verifies R4 computed durations evaluate to `0s` under media emulation.
5. `independent: closing Search returns keyboard focus to its rail trigger`: verifies R5 opener focus restoration.
6. `independent: a failed search edit retains the draft and can be retried`: injected disk write failure retains draft notes, subsequent retry succeeds and restores focus to search result.
7. `independent: Recovery and storage remain reachable with no day snapshot`: injected `getDay` failure renders error banner, Recovery panel opens and exposes read failure alert and storage tools.
8. `independent: panel switching preserves a hidden calendar and panned board`: verifies calendar remains hidden and board scrollLeft/selected date are preserved across search and recovery panel toggles.
9. `independent: closing Backlog and Recovery panels restores focus to their respective rail triggers`: verifies R5 across Backlog and Recovery panels.
10. `independent: search focus falls back to remaining search result when an edit removes a match`: verifies fallback to remaining matching item button when active item is removed.
11. `independent: backlog panel drag cancellation via Escape restores original state without moving`: Escape during panel-source drag removes placeholder and preserves null plannedDate.
12. `independent: panel-source insertion rolls back gracefully on simulated move failure`: simulated `moveTask` failure cleans up placeholder and retains backlog card state.

#### `tests/app/phase3-ui.spec.ts` (9 tests)
1. `combined project, status, and text filters affect view presentation only while underlying tasks, order, schedules, and capacity totals remain unchanged`: verifies filters affect presentation only under controlled clock (`2026-10-25`).
2. `global local search matches across completed tasks, backlog, and dates outside board; ignores view filters with scope disclosure and separates local/global state`: verifies full search scope disclosure and state isolation.
3. `search result open -> edit -> save/fail/retry -> close preserves query, stable result targeting, drafts, selected date, and focus`: verifies editor round-trip from search result.
4. `repeated Backlog/Search/Recovery/Calendar switching after panning preserves calendar preference, width, board position, and query states in wide and narrow windows`: tests dock continuity and responsive behavior.
5. `parent/child Escape containment, forward/reverse Tab, focus restoration, repeated opening, and A shortcut guard during modal ownership`: verifies modal focus and Escape nesting.
6. `filtered whole-card drag with hidden neighboring tasks preserves beforeTaskId contract and relative order without reordering hidden records`: tests board card drag with filtered rows.
7. `recovery panel exposes paused focus session, explicit resume, unaffected elapsed time, and storage tools`: verifies recovery session presentation and local storage access.
8. `visible popup bounds, rapid panel switches, and reduced motion respect verified timings without layout jitter`: tests layout bounds and rapid toggle stability.
9. `captures Phase 3 visual evidence on hosted runner`: authentic screenshot capture at 1440x900 and 860x680 resolutions.

---

## Visual evidence

The following screenshots were captured on the hosted macOS Apple Silicon runner during test execution and extracted to `docs/screenshots/`:

| Artifact | Resolution | Content / Verification Focus |
| --- | --- | --- |
| [`ui-phase3-filter-chooser.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-filter-chooser.png) | 1440x900 | Anchored filter popover showing search input, status segment controls (`All`, `Incomplete`, `Completed`), project select, and Clear action below the Filter button. |
| [`ui-phase3-search-panel.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-search-panel.png) | 1440x900 | Global local search panel in right dock with query `benchmarks`, scope disclosure (`All tasks · ignores view filters`), 1 matching result item with project tag, date, estimate, and completion checkbox. |
| [`ui-phase3-backlog-panel.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-backlog-panel.png) | 1440x900 | Backlog utility panel in right dock with draggable backlog cards, estimate badges, and action menus alongside interactive board. |
| [`ui-phase3-recovery-panel.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-recovery-panel.png) | 1440x900 | Recovery utility panel in right dock exposing paused focus session card ("Analyze performance benchmarks", `Elapsed: 00:00`, `Status reason: paused`), explicit "Resume timer" button, "Open task" button, bottom paused focus bar, and "Open storage tools" button. |
| [`ui-phase3-laptop.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-laptop.png) | 860x680 | Narrow laptop responsive layout with Recovery panel open showing paused focus session card, verified absence of horizontal document overflow, and clean column layout. |

---

## Limitations and boundaries

1. **Phase 4 Exclusions**: In strict adherence to scope, command palette (`Cmd+K`), global keyboard action router, and full-screen True Focus view are intentionally deferred to Phase 4.
2. **Phase 5 Polish**: Micro-interactions, custom transition curves, and FLIP card animations are deferred to Phase 5.
3. **Local Storage Authority**: All search and filter operations evaluate purely in-memory against local SQLite-backed planner state (`day.allTasks`). There are no external indexers, remote telemetry, or web dependencies.
4. **Focus Authority**: Resuming focus from the Recovery panel or focus timer maintains UTC elapsed time authority without fabricating interrupted time. Recovered timers require explicit user resumption and never auto-resume.
