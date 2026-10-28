# UI reference and redesign

Reference: the user's open Sunsama Mac app, observed through native accessibility and a screenshot on 2026-10-25. Only Home/Today navigation was used. No task, project, timer, account, or calendar data was edited or imported.

Observed in Home:

- Near-black navigation sidebar, neutral charcoal canvas and slightly raised cards.
- Home/Today/Focus navigation and a compact top toolbar.
- Horizontally scrolling day columns with weekday/date headers, completion progress and an Add task row.
- Time badges using hours:minutes, completion circles, and colored project labels.
- Calendar fixed on the right with a narrow panel toolbar, hour grid and zoom controls.

Applied to Laptop Planner:

- Home opens the seven-day board, with the selected day's calendar docked alongside it.
- Today, Focus, backlog and project views use the same neutral surfaces and compact cards.
- Home has separate Board and Calendars toolbars, a Board/Day dropdown, a local-settings avatar, and reference-position rail actions mapped to offline features.
- All implemented task, event, recurrence and timer operations remain available. Paused focus sits in a compact footer; a running focus session stays prominent above the board. Board capacity totals sit in each column's Add task row; the Today view retains the full summary.
- Task filtering affects presentation only. Calendar zoom, panel visibility, sidebar collapse and the A shortcut are local UI controls.
- Backlog is available from the sidebar and the final board column; task grips support cross-day moves, with the sidebar Backlog item also accepting drops.

Laptop Planner keeps its own wordmark, local SQLite database and offline operation. This redesign changes renderer presentation; it does not alter the scheduling engine or database schema.

Verification: real Electron interaction tests cover board completion, filtering without schedule changes, calendar zoom, panel toggling, sidebar collapse, keyboard creation, and the existing planner workflows. Screenshots in test-results are generated from disposable test data.

## Recorded board interactions

The supplied October 25 screen recording was inspected frame by frame for these behaviors:

- A card lifts at its original size, with a translucent native drag image and shadow. Drag from its body, title, or grip. Other card controls keep their normal click behavior.
- A dim card-sized slot previews the exact insertion point; neighboring cards slide into place. Reorder within a day or insert into another date/backlog. A short landing animation finishes the drop. Escape or dropping outside a valid target cancels without writing. Reduced-motion preferences disable the list and landing animation.
- Right-button dragging pans the board. Dragging empty board space with the left button, horizontal trackpad/wheel scrolling, the scrollbar, and focused-board arrow keys also work.
- The calendar follows the dated column whose left edge is nearest the board viewport’s left edge, rather than following the cursor. The seven-day range stays anchored while panning; the calendar, date picker, day totals and new-task/event defaults follow the visible date. The Today button returns to the start of today's range.

Each drop uses one validated SQLite transaction for date, order, focus changes and schedule reflow. A failed save restores the prior lists and shows an error. The source DOM node remains mounted during native dragging to avoid interrupted OS drags. No database schema or pure scheduling-engine changes were needed.

Real Electron pointer tests exercise live insertion, rapid consecutive drops, same-day order, cross-day/backlog moves, cancellation, rejected saves, nearest-day following, hover independence, right/left panning, wheel/keyboard scrolling and save-position retention. All fixtures use disposable local databases.

## UI Phase 1 — October 26, 2026

The user's next request prioritizes the interface before further planner features. The live Sunsama accessibility controls were inspected again for navigation and layout structure. Native screenshot capture returned blank, so this phase uses the earlier recorded visual reference and the planner's real Electron screenshots; it does not claim a new pixel-perfect comparison. No Sunsama tasks or other user records are used as fixtures.

- Refined neutral charcoal surfaces, smaller navigation, quieter toolbar controls, clearer task typography and time badges, and current-day/selected-column treatments.
- Moved the existing selected-day workload totals above the board/day list, with explicit overflow coloring. Totals continue to use the unfiltered schedule and the calendar's selected date.
- Added a calendar divider with pointer and keyboard adjustment, cancellation, responsive bounds, remembered local width, and reset. It stores only a renderer display preference and uses no planner database migration or new IPC surface.
- Preserved the 252-pixel columns and 20-pixel gaps, whole-card drag mechanics, native drag previews, ordering, cancellation, and nearest-left-column following.

Verification and the remaining UI phases are recorded in [the plan](../PLAN.md). Screenshots use controlled clocks and disposable databases.

## Interaction audit before UI Phase 2

The user requested a behavior and animation audit before further implementation. See [interaction-audit.md](interaction-audit.md) for 18 interaction families, live observations, older public-video evidence, source-backed clone timings and unresolved current motion details. The earlier drawer proposal is not a verified copy of Sunsama's current task editor. Phase 2 implementation has not started.

The subsequent [motion timing investigation](motion-timings.md) used the live app's computed styles, selected loaded CSS rules and DevTools animation recorder. Exact verified values are assigned to the relevant UI phases, with a final motion acceptance phase. This improves on screenshot estimates while leaving unverified JavaScript and component-specific effects explicit.

## UI Phase 2 — October 26, 2026

Delivered compact quick-add composer, responsive centered task editor, anchored estimate popover, and keyboard-accessible task actions menu according to [the interaction contract](phase2-interaction-contract.md):

- **Quick add:** pressing `A`, clicking a Home column's "Add task" row, or using another view's toolbar button opens the compact composer with context-appropriate defaults (selected date, active project, backlog). Focused on mount; Enter submits; positive duration validated inline; Escape or outside click closes without creating a task while preserving the draft in memory; explicit Discard clears draft.
- **Creation handoff:** "Full details" moves the draft and stable creation UUID into the centered editor without writing to storage; additional fields (notes, deadline, recurrence) survive switching back to quick add.
- **Centered task editor:** centered modal (up to 670px wide, scrollable content) with dimmed backdrop (`rgba(78, 73, 90, 0.6)`), retaining all existing fields (title, estimate + popover anchor, day, backlog, project, deadline, recurrence, notes), uncommitted draft retention across dismissals, explicit discard, and atomic save.
- **Estimate popover:** clicking a card's duration badge opens an anchored popover with practical presets (5m through 8h) and custom duration entry; saving commits atomically while preserving all other fields. Inside an uncommitted editor or quick-add composer, choosing an estimate updates that draft only.
- **Task actions menu:** accessed via card tools button, keyboard-navigable (`ArrowUp`/`ArrowDown`/`Escape`), offering "Edit task", "Move to backlog" (disabled when in backlog), and "Delete" (with Undo toast).
- **Nested dismissal & focus:** children (estimate popover) consume Escape and outside clicks before parent surfaces; dismissal returns focus to initiating controls with `preventScroll: true` without moving board scroll.
- **Motion adherence:** 50 ms checkbox transitions, 200 ms card/control opacity feedback, 150 ms menu item transitions, and instant (0s) overlay appearances without invented animation curves. Reduced motion disables optional transitions.
