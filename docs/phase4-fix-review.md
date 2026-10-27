# UI Phase 4 fix review — October 27, 2026

**Verdict: needs fixes before acceptance.** The eight original regression
probes pass on Gemini's fixed source. Three remaining acceptance gaps were
reproduced by four new hosted probes. The independent full run also recorded
a separate failure in an existing native-menu test.

## Revisions and checks

- Reviewed checkout: `ui-phase-4`,
  `9e1ea8f1e11d82d19a30781bcbec05d77d4d08df`.
- Gemini's tested application/test source:
  `99080018799a5a42db5d2b2d3590f7fe1620e42b`. The next commit changes only
  `PLAN.md` and the fix handoff. The successful
  [full hosted run](https://github.com/yash9008/laptop-planner/actions/runs/40497127060)
  and raw job log were independently inspected: type-check/build passed,
  scheduler **78/78 in each time zone**, database **63/63**, Electron
  **114/114**. This includes all eight original probes and four additional
  Gemini regressions.
- The exact reviewed head's separate
  [full run](https://github.com/yash9008/laptop-planner/actions/runs/40498134033)
  also succeeded. Its raw log confirms both 78-test scheduler runs, 63
  database tests, and all 114 Electron tests passed.
- The original eight probes match the immutable final review copy exactly;
  Gemini appended four tests without changing the original assertions.
- New independent probes: `codex/phase4-fix-review`,
  `08ac98b02307bdc0787426788e1d8980557a7684`.
- New [push-triggered full run](https://github.com/yash9008/laptop-planner/actions/runs/40498584153):
  **failure**, job **Full checks on Apple Silicon macOS**, ID
  `122170210884`. Type-check/build passed; scheduler **78/78 in each time
  zone**, database **63/63**, Electron **114 passed, 5 failed**. Of five new
  probes, four reproduced R9–R11 and the Search/paused-timer continuity case
  passed. Of the 114 existing tests, 113 passed, including all eight original
  probes, and one native-menu test failed. Application source and existing
  tests are unchanged.
- Local command: `npm run typecheck`, successful. No local Electron GUI,
  personal database, packaging, or reference-account access was used.

Hosted commands were `npm ci` and `npm run check`. The independent run was
followed with `gh run watch 40498584153 --repo yash9008/laptop-planner
--exit-status --interval 30`; raw logs came from
`gh api repos/yash9008/laptop-planner/actions/runs/40498584153/logs`.

## Findings

### R9 — [P2] Today and Backlog palette navigation still targets non-focusable elements

Locations: `src/renderer/App.tsx:1061` and `:1077`.

Both new focus callbacks include the destination `<main>` in their selector
list. `querySelector` uses document order, so `.view-day` and `.view-backlog`
match the enclosing main before any descendant heading, card, or Add task
button. Neither main has `tabIndex`; calling `.focus()` does nothing. The
heading/card alternatives in the Today selector are also not focusable.

Reproduction: open Commands, execute Navigate to Today or Navigate to
Backlog, then inspect `document.activeElement`. Both hosted cases recorded
BODY after the destination was visibly rendered. The destination should
contain a focused, usable control after palette removal. Select a known
enabled button, or deliberately make and focus the destination container.
The Board command's passing test does not establish the other routes.

This is an unclosed portion of R3's requested navigation audit, rather than
a failure of the now-passing Navigate to Focus probe.

### R10 — [P2] Direct Focus entry prefers a stale origin from an earlier interaction

Location: `src/renderer/App.tsx:815`.

`enterFocusView` prioritizes `originatingElement.current` whenever that
element remains connected and outside a dialog. This shared reference can
belong to an earlier palette/editor interaction. A direct rail/sidebar click
does not capture a new origin before entry, so the actual current initiating
control loses precedence.

Reproduction: open and dismiss Commands, click the Open focus view rail
control, then click Exit Focus. Exit should restore that rail control, not
the earlier Commands button. The hosted result focuses Open command palette
instead of Open focus view. Capture the current direct-entry origin, and
pass the saved pre-palette origin explicitly for palette entry. Avoid using
an unrelated connected element as proof of current ownership.

This is a regression introduced by the R3 exit-origin fix.

### R11 — [P2] Focus still unmounts the board and loses vertical column scrolling

Location: `src/renderer/App.tsx:1907`, with scroll restoration at `:853`.

The fix retains the outer `<main>`, but its children still branch on
`view === 'board'`. Entering Focus replaces `PlanningBoard` with the hidden
day-list branch, so the board itself still unmounts. The manual restoration
saves only `boardPanelRef.scrollLeft` and the selected date. Each column's
`.board-task-list.scrollTop` is lost on remount.

Reproduction: create enough tasks in a day column to overflow, scroll its
task list down, enter Focus, and exit. The same column should retain its
vertical position. The hosted probe recorded `{before: 300, after: 0}`.
Retain the actual board subtree or restore all relevant
scroll state using stable column identity. The passing horizontal-scroll
probe is insufficient to establish full board continuity.

The R1 handoff's claim that PlanningBoard remains mounted continuously is
incorrect. Its horizontal/date symptom is fixed; vertical continuity still
requires correction.

## Additional unresolved validation failure

The existing `tests/app/menu-bar.spec.ts:58` test, **sleep and clean restart
keep a paused menu timer and exclude closed time**, also failed in the
independent run. After simulated sleep/resume and an explicit native Resume
action, it expected `00:10` but observed `Ⅱ 00:06` until the assertion timed
out. It failed before reaching the clean-restart part of the test.

That test passed in both successful baseline runs. The review adds only a
new test file; its probes execute later in the suite, and main/menu code and
the existing test are unchanged. The evidence does not establish whether
this is an intermittent test issue or a runtime defect, and it is not
attributed to a particular renderer fix. The full independent suite is
therefore recorded as failed. Investigate this failure separately during
the next validation; do not silently classify it as passing or weaken its
timer assertions.

## Preserved behavior and limits

The changes stay within renderer components, tests, and documents. No
dependency, main/preload, scheduler, schema, or runtime network change was
introduced. The original main-process timer authority remains intact.

The historical independent review and evidence remain unchanged. The final
new probe copy and run receipts are stored in
`docs/evidence/phase4-fix-review/`. The original `ui-phase-4` checkout is
restored, with review documents/evidence left in the workspace.

Six synthetic Phase 4 screenshots were retrieved from the exact reviewed
head's successful run, with file hashes retained. The narrow command palette
and paused Focus images were inspected: both fit the 860×680 viewport, and
paused Focus displays 00:10 with an explicit Resume action. Static images
do not establish keyboard focus or scroll continuity.

Reference motion parity and packaged-app verification are not established
by this review. UI Phase 5 has not been started.
