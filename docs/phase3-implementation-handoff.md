# UI Phase 3 implementation handoff — Finding and organizing work

## State and ownership table

The following table establishes explicit state ownership across the renderer lifecycle, non-modal utility panels, anchored filter chooser, and modal task overlays.

| State item | State representation / owner | Persistence across close / reopen | Persistence across view navigation | Persistence across planner refresh / timer ticks | Session vs restart |
| --- | --- | --- | --- | --- | --- |
| **Filters (Project & Status)** | `filterProjectId: string` ('all' \| 'none' \| `<projectId>`); `filterStatus: 'all' \| 'incomplete' \| 'completed'`. Owned by top-level `App` renderer state. | Persists across chooser close / reopen. Affects presentation only. | Persists across view navigation (board, day, backlog, project, focus). | Persists untouched. Summaries and capacities continue to calculate from underlying day records. | In-memory during session; resets to default ('all') on full restart. |
| **Local text query** | `filterQuery: string`. Owned by `App` renderer state; completely separate from global search. | Persists when chooser is dismissed via Escape / outside click. Cleared only via explicit Clear action. | Persists across view navigation. | Persists untouched through 1-minute sync and 1-second focus timer ticks. | In-memory during session; resets to empty string on full restart. |
| **Global query & active result** | `searchQuery: string`; `activeSearchResultId: string \| null`. Owned by `App` state. Matches against all `day.allTasks` (title, notes, project name; case-insensitive literal). | Query and active result ID persist across opening/closing the Search utility panel. | Persists across view navigation without rebasing board or switching dates. | Persists through refreshes and edits. Results re-derive from latest committed `day.allTasks`, preserving query and active task ID. | In-memory during session; resets on app restart. |
| **Active utility panel** | `activeUtilityPanel: 'backlog' \| 'search' \| 'recovery' \| null`. Owned by `App` state. Only one panel open at a time in right dock. | Selecting same rail item or clicking panel close button sets to `null`. Non-modal: board stays mounted and interactive. | Persists across view navigation (e.g. switching between board and day keeps open panel). | Persists through planner refreshes, focus timer updates, and mutations. | In-memory during session; defaults to `null` on start. |
| **Calendar preference** | `calendarOpen: boolean` (user calendar visibility toggle) and `calendarWidth: number \| null` (remembered width). | When a utility panel opens, calendar is temporarily replaced while preserving `calendarOpen` and `calendarWidth`. Closing panel restores previous calendar visibility. Selecting Calendar explicitly sets `calendarOpen: true` and `activeUtilityPanel: null`. | Persists across view navigation. | Persists through planner refreshes and timer ticks. | `calendarWidth` persists in `localStorage` (`laptop-planner.calendar-width.v1`). `calendarOpen` defaults to `true`. |
| **Overlay / focus owner** | `activeOverlay: null \| 'filter' \| 'quick' \| 'details' \| 'estimate' \| 'menu' \| 'event' \| 'project' \| 'storage'`. Originating trigger element and taskId tracked via refs. | Each overlay captures current active element as trigger on open. Closing child popover restores focus to trigger via `preventScroll: true` without closing parent or background panel. Modal dialogs make background inert; non-modal panels do not. | Switching views closes any transient floating popover (estimate/menu/filter) while preserving drafts. | Focus is restored only after DOM mutations commit. Workspace shortcuts (`A`) guarded while any overlay owns keyboard. | Ephemeral runtime state. |
| **Draft owner** | `creationDrafts: Record<string, TaskDraft>` (keyed by targetDate + projectId); `existingDrafts: Record<string, TaskDraft>` (keyed by taskId); `initial*Drafts` refs for dirty checking. | Retained in renderer memory above unmounted modals. Reopening the same task or creation context restores unsaved fields. Explicit discard clears draft. | Creation drafts and existing task drafts remain in memory regardless of view navigation. | Background sync reconciles non-dirty fields against committed data without clobbering user input. Deleted task clears cached draft. | In-memory during session. Committed writes persist to SQLite; uncommitted drafts do not persist restart. |

---
*Implementation and verification details will be recorded below as batches complete.*


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
- **Backlog utility panel**: [`BacklogPanel`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/BacklogPanel.tsx) renders backlog tasks with estimate badges, titles, checkboxes, task menus, and drag handles. Allows dragging cards from Backlog panel directly onto any board column to assign dates. Supports dropping tasks into backlog (`data-backlog-drop="true"`). Full backlog view and project navigation in sidebar remain fully functional.
- **Recovery utility panel**: [`RecoveryPanel`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/src/renderer/components/RecoveryPanel.tsx) presents existing recovery state:
  - Paused or recovered focus session (`focus.reason`: paused, sleep, quit, interrupted), elapsed time, focused task title, and explicit "Resume timer" button (preserving UTC elapsed-time authority) and "Open task" button.
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
- Comprehensive Playwright test suite in [`tests/app/phase3-ui.spec.ts`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/tests/app/phase3-ui.spec.ts) covering all 8 specified behavioral requirements:
  1. Combined project/status/text filters, clearing, and unchanged underlying data/schedules/capacities.
  2. Global search matching completed, backlog, and off-board dates while ignoring view filters; separate local/global state.
  3. Search result open -> edit -> save -> close preserving query, stable result targeting, drafts, date, and focus.
  4. Switching Backlog/Search/Recovery/Calendar after panning in wide (1440x900) and narrow (860x680) viewports without horizontal overflow.
  5. Parent/child Escape containment, forward/reverse Tab cycling, focus restoration, and shortcut `A` guard.
  6. Filtered whole-card drag with hidden neighboring tasks, cross-day/backlog drop, and `beforeTaskId` order preservation.
  7. Paused/recovered focus session, explicit Resume, unaffected elapsed time, and storage tools.
  8. Visible popup bounds, rapid panel switching, and motion timing adherence.
  9. Visual evidence capture on hosted Apple Silicon runner.

## Verification and CI evidence

### Execution environment
All GUI suites, Electron interaction tests, and visual captures ran exclusively on GitHub Actions hosted Apple Silicon macOS runners in accordance with `AGENTS.md` and `docs/github-actions.md` (no local test windows or desktop focus interruptions). Local verification was restricted to non-GUI checks (typecheck, build, pure scheduler tests, and Electron-runtime database tests).

- **Branch**: `ui-phase-3`
- **Starting commit**: `0e84d7c`
- **Tested commit**: `691722b`
- **Full CI run URL**: [https://github.com/yash9008/laptop-planner/actions/runs/40311022708](https://github.com/yash9008/laptop-planner/actions/runs/40311022708)
- **CI Job**: `Full checks on Apple Silicon macOS` (Job ID: `121531938101`)
- **Outcome**: `success` (elapsed: 4m 12s)

### Test suite breakdown

| Suite | Runner / Environment | Tests | Result | Details |
| --- | --- | --- | --- | --- |
| `npm run typecheck` | Local & Hosted Node / `tsc --noEmit` | N/A | Pass | 0 TypeScript diagnostic errors |
| `npm run build` | Local & Hosted Vite & esbuild | N/A | Pass | Clean build of renderer, preload, main, assets |
| `npm run test:scheduler` | Node test runner (Asia/Kolkata & UTC) | 78 | Pass | 0 runtime dependencies; 270-minute example & split-block invariants verified |
| `npm run test:db` | Electron 45 native runtime runner | 63 | Pass | Schema migrations, focus checkpoints, backup & restore, atomic transactions |
| `npm run test:app` | Playwright real Electron on macOS arm64 | 77 | Pass | All 77 integration and UI tests passed, including all 9 Phase 3 acceptance tests |

### Acceptance tests exercised (`tests/app/phase3-ui.spec.ts`)
1. **Filters**: Combined project, status, and text filters affect view presentation only while underlying tasks, order, schedules, and capacity totals remain unchanged under a controlled clock (`2026-10-25`).
2. **Global Search Scope**: Matches across completed tasks, backlog, and dates outside board; ignores view filters with clear scope disclosure (`All tasks · ignores view filters`); verifies separation of local and global query state.
3. **Search Interaction & Stability**: Search result open -> edit -> save/fail/retry -> close preserves search query, stable result targeting, drafts, selected date, and focus restoration to the originating result trigger.
4. **Dock & Navigation Resilience**: Repeated Backlog/Search/Recovery/Calendar switching after panning preserves calendar preference, width, board position, and query states in wide (1440x900) and narrow (860x680) viewports without horizontal overflow or header clipping.
5. **Escape Containment & Modal Focus**: Parent/child Escape containment (EstimatePopover inside TaskEditor closes child first, second Escape closes parent and restores focus to task title button); Tab and Shift+Tab cycling; shortcut `A` guard during modal ownership.
6. **Filtered Drag & Drop**: Filtered whole-card drag with hidden neighboring tasks preserves `beforeTaskId` contract and relative order without reordering hidden records.
7. **Recovery & Storage Access**: Recovery panel exposes paused focus session, explicit resume button, unaffected elapsed time, and direct routing to local storage tools even under read/write errors.
8. **Layout & Timings**: Visible popup bounds within viewport, rapid panel switching without race conditions, and reduced motion styling adherence without jitter.
9. **Visual Evidence Capture**: Captures real macOS arm64 renderer screenshots at 1440x900 and 860x680 viewports.

## Visual evidence

The following screenshots were captured on the hosted macOS Apple Silicon runner during test execution and extracted to `docs/screenshots/`:

| Artifact | Resolution | Content / Verification Focus |
| --- | --- | --- |
| [`ui-phase3-filter-chooser.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-filter-chooser.png) | 1440x900 | Anchored filter popover showing search input, status segment controls (`All`, `Incomplete`, `Completed`), project select, and Clear action below the Filter button. |
| [`ui-phase3-search-panel.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-search-panel.png) | 1440x900 | Global local search panel in right dock with query, scope disclosure, result counts, date meta, project tag, and task completion checkbox. |
| [`ui-phase3-backlog-panel.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-backlog-panel.png) | 1440x900 | Backlog utility panel in right dock with draggable backlog cards, estimate badges, and action menus alongside interactive board. |
| [`ui-phase3-recovery-panel.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-recovery-panel.png) | 1440x900 | Recovery utility panel in right dock exposing paused focus session (`45m` elapsed), explicit "Resume timer" button, task details link, and storage management tools. |
| [`ui-phase3-laptop.png`](file:///Users/yashsawant/Documents/Projects/sunsama%20clone/docs/screenshots/ui-phase3-laptop.png) | 860x680 | Narrow laptop responsive layout with utility dock open, verified absence of horizontal document overflow, and readable controls. |

## Limitations and boundaries

1. **Phase 4 Exclusions**: In strict adherence to scope, command palette (`Cmd+K`), global keyboard action router, and full-screen True Focus view are intentionally deferred to Phase 4.
2. **Phase 5 Polish**: Micro-interactions, custom transition curves, and FLIP card animations are deferred to Phase 5.
3. **Local Storage Authority**: All search and filter operations evaluate purely in-memory against local SQLite-backed planner state (`day.allTasks`). There are no external indexers, remote telemetry, or web dependencies.
4. **Focus Authority**: Resuming focus from the Recovery panel or focus timer maintains UTC elapsed time authority without fabricating interrupted time. Recovered timers require explicit user resumption and never auto-resume.

