# UI Phase 4 Fix Handoff — Codex Review Resolution

This document records the resolution of findings R1–R8 from Codex's independent UI Phase 4 review (`docs/phase4-implementation-review.md`), the regression test coverage, and hosted macOS verification receipts.

## Reviewed Findings and Implementations

### R1 — Focus exit resets board scroll and selected date
- **Root Cause**: Entering Focus conditionally replaced the workspace main element with `FocusScreen`, unmounting `PlanningBoard`. Exiting recreated a new board instance whose layout effect reset `scrollLeft = 0` and queued nearest-column selection back to the first column (today).
- **Fix**:
  1. Maintained `<main className="planner-main view-board">` mounted continuously in the DOM during Focus mode by rendering it with `style={{ display: 'none' }}`, `inert={true}`, and `aria-hidden="true"`.
  2. Captured `savedBoardScrollRef` (`boardPanelRef.current.scrollLeft`) and `savedBoardDateRef` (`boardCalendarDate`) upon `enterFocusView()`.
  3. Restored `scrollLeft` and `boardCalendarDate` synchronously via `useLayoutEffect` and `requestAnimationFrame` when returning to `view === 'board'`.
- **Changed Files**: `src/renderer/App.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: Focus exit preserves a panned board and selected calendar date") and related Escape exit test.

---

### R2 — F uses stale task selection
- **Root Cause**: The window keyboard shortcut handler closed over `selectedTaskId` without including it in the effect's dependency array. Selecting a card via focus or click updated React state, but the bare-key shortcut listener retained stale closure values.
- **Fix**:
  1. Synchronized an ephemeral ref `selectedTaskIdRef.current = selectedTaskId` on every render.
  2. Included `selectedTaskId` in the shortcut listener dependency array.
  3. Routed `enterFocusView()` through `selectedTaskIdRef.current ?? selectedTaskId`.
- **Changed Files**: `src/renderer/App.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: bare F uses the latest explicitly selected task").

---

### R3 — Palette navigation leaves focus on BODY
- **Root Cause**: `Navigate to Focus` unmounted the palette and set the view without transferring focus to an element in `FocusScreen`. The removed palette input dropped focus to `document.body`.
- **Fix**:
  1. Preserved `originatingElement.current` as `focusExitTriggerRef.current` across palette navigation so exiting Focus returns to the initiating workspace trigger.
  2. Added an entry focus effect in `FocusScreen.tsx` (and companion `useEffect` in `App.tsx` on `view === 'focus'`) to transfer keyboard focus to the primary action button (`Start focus` / `Resume focus` / `Pause focus`) or `Exit Focus view` button after unmount.
  3. Audited and added explicit focus transfer to all other palette navigation actions (`Navigate to Board`, `Navigate to Today`, `Navigate to Backlog`).
- **Changed Files**: `src/renderer/App.tsx`, `src/renderer/components/FocusScreen.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: palette navigation transfers keyboard focus into Focus") and related Board navigation test.

---

### R4 — Invisible Focus dock remains tabbable
- **Root Cause**: `.workspace.focus-view .calendar-dock` applied CSS `opacity: 0; pointer-events: none;`, which hid the dock visually from pointer clicks but left its resize divider (`tabIndex={0}`) and panel controls in sequential keyboard Tab order.
- **Fix**:
  1. Added `inert?: boolean` prop to `CalendarDock`.
  2. Applied `inert={view === 'focus'}` and `aria-hidden={view === 'focus' ? 'true' : undefined}` to `.calendar-dock`.
- **Changed Files**: `src/renderer/components/CalendarDock.tsx`, `src/renderer/App.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: invisible Focus dock is excluded from sequential keyboard navigation").

---

### R5 — Help dismissal restores focus while target is inert
- **Root Cause**: `KeyboardHelpDialog`'s `onClose` callback called `setKeyboardHelpOpen(false)` and immediately called `restoreOriginatingFocus()`. Because React had not yet cleared `inert` on `planner-shell`, the browser rejected focusing the initiating toolbar control, leaving focus on `document.body`.
- **Fix**:
  1. Implemented `pendingHelpRestore` ref pattern matching `pendingPaletteRestore`.
  2. Deferred focus restoration to a post-render `useEffect` when `!keyboardHelpOpen && pendingHelpRestore.current`.
- **Changed Files**: `src/renderer/App.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: help dismissal restores the palette initiating control").

---

### R6 — Enter on palette Close executes highlighted command
- **Root Cause**: `CommandPalette`'s window keydown listener unconditionally intercepted `event.key === 'Enter'`, called `event.preventDefault()`, and executed `activeItem.run()`, overriding native button activation when Tab moved focus to the Close button or Clear query button.
- **Fix**:
  1. Guarded Enter handling: if `(event.target as HTMLElement)?.closest('button')` is present, the handler returns immediately without `preventDefault()`, allowing native Enter button activation.
- **Changed Files**: `src/renderer/components/CommandPalette.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: Enter on the palette close control does not execute Add task") and related Clear query button test.

---

### R7 — Repeated Cmd+K closes the palette
- **Root Cause**: `App.tsx` guarded shortcuts with `if (event.repeat) return;`, but `CommandPalette.tsx` registered a separate window listener without an `event.repeat` guard. Holding `Cmd+K` sent repeat keydowns that immediately closed the newly opened dialog.
- **Fix**:
  1. Added `event.repeat` check to `CommandPalette`'s keydown handler guard (`if (event.defaultPrevented || event.isComposing || event.repeat) return;`).
- **Changed Files**: `src/renderer/components/CommandPalette.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: repeated Cmd K does not dismiss the palette").

---

### R8 — Palette-to-editor handoff loses Search ownership
- **Root Cause**: When opening `TaskEditor` from the Command Palette, `openEditor(selectedTask)` was called without passing the originating element or surface. `captureTaskOrigin` re-evaluated from `document.activeElement` (which was `document.body` after palette removal), reclassifying the surface as `'board'` and breaking focus restoration back to Search.
- **Fix**:
  1. In `paletteCommands`, `task-edit` captures `savedTrigger = originatingElement.current` and `savedSurface = originatingSurface.current` before closing the palette.
  2. Passed `savedTrigger` and `savedSurface` through `openEditor(selectedTask, savedTrigger, savedSurface)`.
- **Changed Files**: `src/renderer/App.tsx`.
- **Test**: `tests/app/phase4-independent-review.spec.ts` ("independent phase4: palette to Search task editor preserves Search focus ownership") and related Backlog handoff test.

---

## Hosted Verification Receipts

- **Commit**: `99080018799a5a42db5d2b2d3590f7fe1620e42b` (on branch `ui-phase-4`)
- **Workflow**: `Planner checks` (`.github/workflows/check.yml`) triggered via push
- **Hosted Run**: [Run 40497127060](https://github.com/yash9008/laptop-planner/actions/runs/40497127060)
- **Job**: [Full checks on Apple Silicon macOS (ID 122165286408)](https://github.com/yash9008/laptop-planner/actions/runs/40497127060/job/122165286408)
- **Commands & Counts**:
  - `npm run typecheck`: passed (0 errors)
  - `npm run build`: passed (0 errors)
  - `npm run test:scheduler`: passed in both time zones (78/78 in `Asia/Kolkata` and 78/78 in `America/Los_Angeles`)
  - `npm run test:db`: passed under Electron native SQLite (63/63 tests)
  - `npm run test:app`: passed (114/114 Electron tests; 0 failed):
    - All 102 previously verified Phase 4 interaction tests passed
    - All 8 Codex independent review probes passed (R1–R8 resolved)
    - 4 added regression coverage tests passed (Board palette nav, Clear query button Enter, Focus exit via Escape, Backlog palette-to-editor focus ownership)

## Remaining Limits & Unverified Motion

- **Reference Motion**: Transitions (e.g. 300 ms loaded dock opacity) are verified via computed CSS styles and property suppression under `prefers-reduced-motion: reduce`. Live frame-by-frame gesture settling and kinetic drag curves remain reserved for UI Phase 5 motion acceptance.
- **No Scope Expansion**: No cloud, telemetry, schema migration, or runtime networking was introduced. Personal SQLite storage remains strictly local and offline.
