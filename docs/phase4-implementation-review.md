# UI Phase 4 independent review — October 27, 2026

**Verdict: needs fixes before acceptance.** Eight issues were reproduced on
the hosted macOS runner. The palette and single-task Focus screen are
implemented, but keyboard ownership and workspace continuity have acceptance
gaps. Application fixes have not been applied by this review.

## Revisions and verification

- Reviewed implementation: `ui-phase-4`,
  `de3d6e909be3cc39c542617bb6fae102e688729e`.
- Independently inspected its [push-triggered full run](https://github.com/yash9008/laptop-planner/actions/runs/40487775270)
  and raw job log: type-check/build passed, scheduler **78/78 in each of two
  time zones**, database **63/63**, Electron **102/102**. The full macOS job
  succeeded; the optional diagnostic was skipped.
- Initial probes: `codex/phase4-review`,
  `a64cbeac0f9bb2e7fb1b5c329824e2d5f9faabab`. The initial
  [push-triggered full run](https://github.com/yash9008/laptop-planner/actions/runs/40489272975)
  passed type-check/build, both 78-test scheduler runs, 63 database tests,
  all 102 existing Electron tests, and one probe. Seven probes failed; six
  established findings, while the Search handoff probe sent Escape before
  confirming the editor's keyboard ownership.
- Refined probes: `codex/phase4-review`,
  `5ff04a01fdd4fc7ac0e5ee6676b25a3ce9f22bef`. The eight tests now wait for
  restored focus after palette Close, and test Search restoration through
  the editor's explicit Close control after its title has focus. Application
  source and existing tests remain unchanged. An intermediate run was
  superseded and is not counted as verification.
- Final [push-triggered full run](https://github.com/yash9008/laptop-planner/actions/runs/40490966909):
  **failure**, job **Full checks on Apple Silicon macOS**, ID
  `122144990523`. Type-check/build passed, scheduler **78/78 in each time
  zone**, database **63/63**, Electron **102 passed, 8 failed**. All 102
  existing tests passed; all eight independent probes reproduced the
  findings below. The raw job log and final test summary were inspected.
- Local command: `npm run typecheck`, successful. GUI execution uses the
  hosted Apple Silicon macOS runner, temporary databases, and a controlled
  clock. No local GUI, personal planner data, reference account data, or
  packaged app was used.

Hosted execution used `npm ci` and `npm run check`. The final run was
followed with `gh run watch 40490966909 --repo yash9008/laptop-planner
--exit-status --interval 30`; raw logs were retrieved with
`gh api repos/yash9008/laptop-planner/actions/runs/40490966909/logs`.

The original `ui-phase-4` checkout is restored. Review documents and immutable
copies of the probes/receipts remain in the workspace. The final tested
probe is `docs/evidence/phase4-independent-review/reproduce-v3.spec.ts`.
The original passing Enter probe asserted absence before the delayed
composer opening; waiting for focus restoration exposed that race in the
probe. The Search probe now reaches the actual origin-restoration assertion
after closing the editor, rather than failing during its entry handoff.

## Findings

### R1 — [P2] Focus exit resets the panned board and selected calendar date

Location: `src/renderer/App.tsx:1748`; board initialization in
`src/renderer/components/PlanningBoard.tsx:38`.

Entering Focus conditionally replaces the workspace main content, unmounting
`PlanningBoard`. Exiting creates a new board, whose layout effect resets
`scrollLeft` and queues nearest-column selection. Saving `previousViewRef`
does not save either the DOM scroll position or the board's selected day.

Reproduction: pan the board two columns, enter Focus, and exit. The review
probe compares both scroll offset and selected date across the round trip.
It recorded `{scroll: 544, date: '2026-10-27'}` before entry and
`{scroll: 0, date: '2026-10-25'}` after exit, with test today October 25.
Keep the workspace mounted while presenting Focus, or explicitly restore its
scroll/date state without allowing mount initialization to overwrite it.

### R2 — [P2] The F shortcut uses stale task selection

Location: `src/renderer/App.tsx:1153`, with the effect dependencies at `:1168`.

The window keyboard handler closes over `enterFocusView` and
`selectedTaskId`, but its effect does not depend on selection. Selecting a
different card does not replace the handler. Until another listed dependency
changes, bare F can display the default task or an older selection rather
than the intentionally selected task.

Reproduction: create Alpha and Beta, focus Beta's title to select it, move
keyboard focus to the Commands toolbar control, and press F. The selected
card remains Beta, but the hosted result displays Alpha. Route the listener through
current state, or include all selection dependencies without introducing
duplicate listeners.

### R3 — [P2] Palette navigation leaves focus on BODY

Location: `src/renderer/App.tsx:996` and `:801`.

`Navigate to Focus` removes the palette and sets the view, without focusing
the destination. The invoking palette input is removed, and `FocusScreen`
has no entry focus effect. Keyboard navigation therefore loses its place
instead of transferring to a visible Focus control. The same direct state
updates in other navigation commands should be audited.

Reproduction: open Commands, filter to Navigate to Focus, and execute it.
Assert that the resulting active element is inside the visible Focus screen.
Transfer focus deliberately after the palette has unmounted and the shell's
inert state has cleared, while keeping the original workspace exit target.

### R4 — [P2] The invisible Focus dock still receives keyboard focus

Location: `src/renderer/styles.css:1709`; dock rendering in
`src/renderer/App.tsx:1952`.

Focus hides the dock with `opacity: 0` and `pointer-events: none`. These
properties do not remove controls from sequential keyboard navigation or the
accessibility tree. With Search open before entry, tabbing past Focus's Edit
task control reaches the invisible dock's Resize calendar separator, then
hidden Search controls. Keyboard users can lose the visible focus indicator
and interact with concealed workspace controls.

Preserve the panel's state while making the concealed dock inert and
appropriately unavailable to assistive technology for the duration of Focus.
Check any other chrome covered by the Focus presentation as well.

### R5 — [P2] Closing keyboard help restores focus while its target is inert

Location: `src/renderer/App.tsx:2287`.

Help's close callback calls `setKeyboardHelpOpen(false)` and immediately
calls `restoreOriginatingFocus`. At that point React has not removed the
shell's inert state. The browser rejects focusing the captured toolbar
control, and removing the help dialog leaves focus on BODY.

Reproduction: open Commands from its toolbar button, run Show keyboard
shortcuts, and dismiss with Escape. The original Commands button should
receive focus. Use the post-unmount restoration pattern already used for
the palette and task editor.

### R6 — [P2] Enter on palette buttons executes the selected command instead

Location: `src/renderer/components/CommandPalette.tsx:100`.

The window listener unconditionally prevents Enter and invokes the active
result, including when Tab has moved focus to Close command palette or Clear
command query. This overrides the native button action. With a task action
selected, the same handler can invoke a task mutation while the user is
trying to close the palette; the hosted probe specifically exercises Add task.

Reproduction: filter to Add task, Tab past Clear to Close, then press Enter.
The final probe records focus in the new composer's Task title input instead
of the Commands trigger. The palette should close without opening a new
task composer. Limit result
execution to the query/list interaction and preserve native button activation.

### R7 — [P3] A repeated Cmd+K closes the palette

Location: `src/renderer/components/CommandPalette.tsx:67`.

The App listener ignores `event.repeat`, but the palette registers another
window listener that does not. After Cmd+K opens the palette, a repeated
keydown from holding those keys immediately closes it. A held opening
shortcut therefore violates the one-invocation-per-keypress requirement.

The probe dispatches a bubbling, cancelable Cmd+K event with `repeat: true`
from the focused query and asserts that the palette stays open. Apply a
consistent repeat guard to the owner handling the command.

### R8 — [P2] Palette-to-editor handoff discards the Search origin

Location: `src/renderer/App.tsx:875` and `:367`.

Opening the palette correctly captures its Search result trigger. The Edit
task command then unmounts the palette and later calls `openEditor` without
passing that origin. `openEditor` captures again from the current active
element, which is BODY after removal, and reclassifies the owner as board.
Editor dismissal consequently returns to a global board/toolbar fallback
instead of the originating Search surface.

Reproduction: search for a task, focus its result's Open control, invoke
Cmd+K, execute Edit task for that labelled task, wait for its title to receive
focus, and click Close dialog. The probe records focus on the board's
Search target title button, outside Search. Search must retain its query and
regain keyboard focus. Carry the captured
element, task ID and surface through handoff rather than recapturing from
the removed palette.

## Coverage and evidence limits

The implementation's seven new tests do cover basic palette interaction,
task actions, single-task navigation, explicit timer actions, editing, a
controlled UTC tick, and computed reduced-motion properties. Their titles
and the handoff claim more than their assertions establish:

- The shortcut test uses `fill` for the modal title, and types into Search.
  It does not create contenteditable content, dispatch IME composition,
  hold a pending write, or exercise child popups or a drag.
- The preservation test only asserts that the board reappears. It never pans
  it or compares scroll/date/filter/Search/calendar state across Focus.
- The targeting test completes a task and reopens the palette. It does not
  refresh, delete, or move the target while the palette remains open.
- There is no new injected failed start/pause/completion/save with retry,
  duplicate-action assertion, or native menu-bar consistency assertion.
- Motion checks establish computed properties; they do not establish
  reference trigger behavior, elapsed spans, rapid reversal or interruption.
  Reference motion remains unverified rather than independently accepted.

All six submitted screenshots were inspected at their saved dimensions.
The visible palette and Focus content fit 1440×900 and 860×680. The wide
`ui-phase4-focus-screen.png` shows an unstarted task with Start focus and
00:00, while the narrow screenshot shows running focus. The fixture helper
also parses the supplied `1h 30m` estimate as one minute, which explains the
displayed 1m. These static captures do not establish keyboard ownership or
the broader runtime claims. Their hashes and baseline run receipts are in
`docs/evidence/phase4-independent-review/`.

The source diff stays in renderer components/styles, tests and documents:
no dependency, schema, scheduler, main/preload, or runtime network change was
introduced. Existing atomic persistence and UTC timer authority remain in
the main process. This review does not claim exhaustive runtime correctness
for unexercised failure paths.

Stop at Phase 4 fixes and independent re-verification; Phase 5 acceptance
has not been performed.
