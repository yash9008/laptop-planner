# UI Phase 2 implementation review — October 26, 2026

> Follow-up: [the independent fix re-review](phase2-fix-review.md) verifies R1–R7 resolved and records the remaining R8 focus issue. The findings below are historical. Some initial receipt/image paths were overwritten when the original reproducer was rerun; current receipts are retained separately in `evidence/phase2-fix-recheck/`.

Verdict: **fixes required before Phase 2 acceptance**. The requested surfaces are implemented, but independent Electron checks reproduced data-loss, containment, and error-handling defects. UI Phase 3 should not start yet.

## Independently executed checks

- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run test:app -- phase2-ui.spec.ts board-interactions.spec.ts` — all 12 existing tests passed.
- `node /tmp/laptop-planner-phase2-review.mjs` — collected seven diagnostic cases, reproduced below.
- `PHASE2_REVIEW_CASE='keyboard-date|nested-estimate-wide' node /tmp/laptop-planner-phase2-review.mjs` — collected two additional cases.

The diagnostic harness is retained as [reproduce.mjs](evidence/phase2-implementation-review/reproduce.mjs). From the repository root, run `node docs/evidence/phase2-implementation-review/reproduce.mjs` to collect all cases. It reports observed results, rather than treating the current incorrect behavior as a passing acceptance test. It creates a new temporary database for each case, uses a controlled clock, and closes/removes its own fixture afterward. Failure cases use test-only main-process IPC handler replacement in that disposable Electron process.

Original observations are in [results.json](evidence/phase2-implementation-review/results.json) and [results-extra.json](evidence/phase2-implementation-review/results-extra.json). Existing full-suite results in Gemini's handoff were not independently rerun; the focused suites were sufficient to establish that their passing coverage misses the defects below. A full `npm run check` remains required after fixes.

## Findings

### R1 — P1: cached editor state silently overwrites a newer estimate

Source: `src/renderer/App.tsx:186`–197 and 356–375.

Reproduction: open a 30-minute task in the editor and close it without editing. Change its duration to one hour through the standalone card popover. Reopen its editor: the estimate is still `30m`. Click Save changes: the committed estimate reverts from 60 to 30 minutes.

`openEditor` reuses every cached draft, including pristine drafts, while the standalone save does not reconcile that cache. This also affects dirty drafts when other committed fields change. Reuse dirty user fields deliberately; refresh pristine fields from the latest task and reconcile independently saved fields without losing retained user edits. Add an actual stale-cache/save regression test.

### R2 — P1: a failed delete discards the retained draft

Source: `src/renderer/App.tsx:439`–450.

Reproduction: change the title to `Uncommitted title`, dismiss the editor, then inject a delete failure. Delete the original task. The record remains, but reopening shows `Review task`; the retained title is gone.

`remove` clears `existingDrafts` before the delete operation succeeds. Clear the draft and baseline only after confirmed deletion; retain them on failure. Verify both failed deletion and successful deletion/Undo paths.

### R3 — P2: both modal surfaces allow keyboard interaction with the background

Source: `src/renderer/components/QuickAddComposer.tsx:89`–96 and `src/renderer/components/TaskEditor.tsx:72`–78.

Reproductions: Shift+Tab from the quick-add title focuses the background Create fixed event button. Tab from the editor's Save changes button focuses the background Home/Multi-day board control.

The new divs set `aria-modal=true` but have neither focus containment nor inert background behavior. This regresses the old native `dialog.showModal()` behavior. Implement real modal containment that includes child popovers, and test forward/reverse Tab plus prevention of background actions. Keep task-specific semantics separate from project/event/storage dialogs.

### R4 — P2: Escape dismisses an in-flight save

Source: `src/renderer/components/QuickAddComposer.tsx:35`–51, `src/renderer/components/TaskEditor.tsx:34`–50, `src/renderer/components/EstimatePopover.tsx:70`–80, and `src/renderer/App.tsx:204`–209.

Reproduction: hold the creation IPC response in the disposable test instance. The composer displays Saving…, but pressing Escape removes it before the save completes. Source inspection shows the same missing busy guard in other dismissal paths.

Guard Escape/backdrop/dismissal while the associated write is pending; disabled buttons alone do not cover those paths. Keep completion/error handling tied to the original surface, and add a controlled delayed-save regression rather than an arbitrary sleep.

### R5 — P2: estimate failures lose the requested preset and have no local error

Source: `src/renderer/App.tsx:356`–375 and 1358–1369; `src/renderer/components/EstimatePopover.tsx:82`–85.

Reproduction: fail a standalone estimate save after choosing the 90-minute preset. The popover remains, but has no inline alert and its custom input still reads `30m`. Only the background error banner changes. Retrying the custom input would apply the old value, not the failed selection.

Pass the operation result into this popover and retain the attempted value/error. Resolve the latest committed task by ID at submission rather than saving every field from the opening snapshot. Test failure and retry while preserving unrelated fields.

### R6 — P2: nested estimate popovers are positioned in the wrong coordinate space

Source: `src/renderer/components/EstimatePopover.tsx:51`–68 and 124–132; `src/renderer/styles.css:540`–553; nested rendering in `TaskEditor.tsx`.

At 1440 × 900, the trigger is x=682, y=299, width=23, height=23. The popover is x=1068, y=453, width=160, height=380. Its parent editor ends at x=1055; the popup is outside the editor and clipped out of the visible UI. The [wide screenshot](evidence/phase2-implementation-review/nested-estimate-wide.png) shows no visible menu despite its DOM being open. At laptop size it is visible but offset by approximately the parent's position.

Viewport coordinates are applied to a fixed element inside a transformed, scrolling container. Render into an appropriate overlay host outside that containing block (or compute the matching local coordinates). Measure actual panel bounds and handle available height, window changes, and scrolling. Preserve child-first dismissal/focus after correcting placement.

### R7 — P2: keyboard quick add uses the wrong day after board panning

Source: `src/renderer/App.tsx:514`–537 and 153–162.

Reproduction: pan the board one day with ArrowRight. The selected date control reads October 26, but pressing A opens a composer assigned to October 25. [Screenshot](evidence/phase2-implementation-review/keyboard-selected-date.png).

The shortcut effect omits `boardCalendarDate` from its dependencies and captures an older `openNew` closure. This omission also existed in the earlier source snapshot; it is an inherited contract gap, not evidence that Gemini newly introduced it. Phase 2 nevertheless claims correct selected-date defaults and needs a regression for keyboard and button paths after panning. Audit selected-project/default dependencies at the same boundary.

## Required follow-up

Fix R1–R7 within UI Phase 2. Add meaningful regressions for these cases and retain the earlier acceptance assertions. Re-run focused tests and `npm run check`, then inspect wide/narrow Electron views with temporary data. Update the implementation handoff with actual fixes/results and leave Phase 3 unstarted.

Other contract areas, such as every interrupted-response/retry permutation and every native-picker/platform detail, are not certified by this bounded review. Do not label unknown reference motion as verified parity. This review changed documentation and diagnostic evidence only; it did not patch application source, dependencies, schemas, or personal data.
