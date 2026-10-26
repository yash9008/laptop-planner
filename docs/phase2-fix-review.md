# Phase 2 fixes: independent re-review — October 26, 2026

Verdict: **R1–R7 are verified fixed in their reproduced scenarios. One focus-lifecycle issue, R8, remains before Phase 2 acceptance.** No Phase 3 implementation is authorized by this review.

## Independent verification

- `npm run check` — passed: type-check, build, scheduler tests in both configured time zones, database tests, and **64 real Electron tests**.
- `node /tmp/laptop-planner-phase2-fix-recheck.mjs` — repeated the nine original diagnostic scenarios and added three focus-lifecycle probes in disposable Electron instances.
- `PHASE2_REVIEW_CASE='child-dismissal-restores-parent-trigger-focus' node /tmp/laptop-planner-phase2-fix-recheck.mjs` — isolated the remaining child-focus behavior after the first probe found that the child did not autofocus. The follow-up entered it with Tab before testing dismissal.

The retained [reproducer](evidence/phase2-fix-recheck/reproduce.mjs) writes to a separate directory from the original review. Run `node docs/evidence/phase2-fix-recheck/reproduce.mjs` from the repository root. [Combined observations](evidence/phase2-fix-recheck/combined-results.json) contain all 12 scenarios; raw outputs and screenshots remain alongside them. These diagnostics collect facts; their process exit code alone is not an acceptance assertion.

| Finding | Independent observed result |
| --- | --- |
| R1 stale estimate | Estimate stays 60 minutes; reopened editor shows `1h`; saving does not revert it |
| R2 failed delete | Task remains and `Uncommitted title` is retained |
| R3 modal containment | Forward/reverse boundary Tab stays inside both dialogs |
| R4 pending save | Escape no longer dismisses the pending creation |
| R5 estimate failure | One inline alert; attempted `1h 30m` remains available |
| R6 popup placement | Wide popup x matches its trigger, vertical gap approximately 4 px; laptop placement stays in the viewport |
| R7 selected date | Keyboard composer and selected board date both read `2026-10-26` |

This confirms the original failure cases and the expanded test suite, not every possible input sequence. The implementation now has meaningful regression coverage for R1–R7.

## R8 — P2: focus is lost on dismissal, allowing a workspace shortcut to replace an open editor

### Reproduction and effect

1. Open quick add using the toolbar Add task button, then Escape. The composer closes, but focus is **BODY**, not the originating button. The shell is no longer inert.
2. Open a task editor from its title, then Escape. Again focus is **BODY**, not the originating task control.
3. Open the estimate child inside a task editor. The custom input does not autofocus in the reproduced run. Tab enters it. Escape closes the child while the editor remains visible, but focus becomes **BODY**, outside the parent.
4. Press `A` in that state. A new quick-add composer opens and replaces the existing task editor. This is an unintended workspace shortcut while the parent editing flow is still active.

The receipts are `quick-add-dismissal-restores-trigger-focus`, `editor-dismissal-restores-trigger-focus`, and `child-dismissal-restores-parent-trigger-focus` in the combined results. The final case records `aOpenedUnrelatedComposer: true` and `editorStillOpen: false`.

### Source and cause

- `src/renderer/App.tsx:215`–220 calls `restoreOriginatingFocus` immediately after scheduling modal state changes. At that point the target is still inside the inert shell (`App.tsx:813`–817), so focusing it fails. The helper returns because the element is connected; it does not retry after the modal removal and inert update commit.
- `src/renderer/components/TaskEditor.tsx:368`–377 and `QuickAddComposer.tsx:302`–311 close the estimate child without restoring its parent trigger. The portal removes the focused input, leaving focus on the body.
- `EstimatePopover.tsx` attempts input focus on initial mount while positioning starts hidden. Focus must be applied when the panel is actually visible and must not be repeatedly stolen during resizing or typing.
- The global `A` handler in `App.tsx:571`–590 checks the event target's ancestors but not the active modal state. When focus is BODY, it processes the workspace shortcut despite the task editor still being open.

### Required fix and acceptance

Restore focus after React has committed removal/inert changes, using a lifecycle-based mechanism tied to the correct surface. If the initiating control disappears, use a connected, focusable fallback in the same view without scrolling. Restore child focus to its parent trigger after Escape, outside click, and preset selection. Ensure the child's initial keyboard focus is set after it becomes visible. Guard workspace shortcuts while a modal flow owns keyboard interaction, even during transient focus loss.

Add regressions asserting the actual active element after parent and child dismissal, child entry, successful save, and a disappearing origin. Specifically verify that pressing `A` after closing only the estimate child does not replace the editor. Preserve the fixed containment, busy guards, field reconciliation, and portal placement. Re-run `npm run check` and update the handoff; stay within Phase 2.

## Evidence and scope notes

Gemini's run of the original reproducer overwrote some files in `phase2-implementation-review/`; its old hash manifest no longer matches those paths. The original review text describes the historical failures. This re-review retains fresh receipts in `phase2-fix-recheck/` with a separate manifest; it does not treat the overwritten images as original before-fix proof.

The handoff's final line had called Phase 3 calendar/timeline refinement. PLAN.md defines Phase 3 as **Finding and organizing work**; that scope should remain unchanged.

This review changed documentation and diagnostics only. Application source, dependencies, schemas, personal databases, Sunsama, and macOS settings were not changed.
