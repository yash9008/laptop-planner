# Current Sunsama reference pass — October 26, 2026

This follow-up supersedes the earlier handoff's unresolved statements about the current task-editor shape and the specific interactions tested below. It establishes a bounded Phase 2 reference, not full animation parity across Sunsama.

## Method and receipts

The user created `UI Reference Test` and explicitly authorized synthetic task setup and inspection in the existing workspace. Only newly authored synthetic tasks were edited. Selected accessibility excerpts, read-only DOM geometry/computed styles, selected loaded CSS, and the DevTools Animations panel are retained in [the evidence JSON](evidence/sunsama-phase2-reference.json). Observation names identify receipts inside that file.

The normal/reduced comparison used the same 1155 × 1072 CSS-pixel content viewport with DevTools docked. DevTools reported **No emulation**. macOS Reduce motion was initially on; the user approved temporarily switching it off. Runtime receipts confirm `reducedMotion: true`, then `false`, then `true` after restoration. Developer Tools, the task editor, and quick add were closed at the end. The final receipt confirms the test-channel filter and exactly three visible synthetic tasks.

Native screenshot capture still returns an almost entirely white image (3420 × 2144, sampled RGB means about 254.998/255). It is unusable as visual proof. No successful screenshot or current frame-by-frame video analysis is claimed; geometry and behavior claims below use runtime/AX receipts.

## Observed behavior

| Area | Current observation | Receipt names / authority |
| --- | --- | --- |
| Task editor | Centered overlay, **670 × 1000** at x=242.5, y=36 in the inspected viewport. `.event-details`, `.event-details-container`, and `.group-overlay` share this geometry. This is not a side drawer. | `editor-runtime-reduced-motion`, `editor-runtime-normal-motion`; computed DOM geometry |
| Backdrop | `.overlay-container` fills the viewport at z-index 1002. Its computed background is `rgba(78, 73, 90, 0.6)` for the editor. | Runtime geometry and `selected-editor-popup-css.backdrop` |
| Editor fields | Title, notes, planned time, actual time, start date, due date, channel, priority, timer, and actions are exposed. The synthetic title and notes remained after closing/reopening. | Synthetic title/notes receipts and `editor-reopened-for-motion-comparison`; observed edits/persistence in-session |
| Estimate popup | Presets span 5 minutes through 8 hours, plus Clear planned. Choosing a preset immediately updated the synthetic task and closed the popup. Its panel measured **120 × 332.8**, at x=776.5, y=180, beneath the estimate trigger in the normal-motion sample. | `second-task-planned-time-preset-selected`, `first-task-planned-time-ten-minutes`, `normal-motion-estimate-panel-runtime` |
| Estimate Escape | One Escape closed both the estimate popup and its parent editor in the observed reduced-motion run. | `escape-from-editor-planned-time-popup`; AX focus returned to page content |
| Date popup | Start-date menu exposes move/backlog commands and a month grid. Escape closed this picker while leaving the task editor open. No date change is claimed from inspection of this picker. | `synthetic-editor-start-date-popup`, `escape-from-editor-date-picker` |
| Actions | Repeat, align with objective, duplicate, delete, and copy link are exposed. One Down key switched the selected synthetic task rather than establishing menu-item keyboard targeting; subsequent Escape closed the editor. Destructive actions were not executed. | `task-other-actions-open`, `other-actions-arrow-down`, `escape-from-other-actions` |
| Quick-add entry | `A` opens the composer and, with page keyboard focus, moves focus into Task description. Channel was inherited from the filtered view during initial setup. | `dirty-composer-reopen-after-escape`; current normal-mode keyboard cycle observed through AX |
| Empty/dirty Escape | Empty composer closes. A dirty fictional draft also closed without a prompt; reopening showed an empty description. This verifies in-session discard, not storage implementation or restart behavior. | `empty-composer-escape`, `dirty-composer-before-cancel`, `dirty-composer-escape`, `dirty-composer-reopen-after-escape` |
| Dirty outside click | Clicking the outside toolbar/filter control with a nonempty composer created that synthetic draft as a task. Treat this as the specific observed trigger, not a universal rule for every outside target. The created task was subsequently renamed to `TEST — Menu interactions`. | `dirty-composer-outside-filter-trigger-click`, `after-outside-click-synthetic-task-created`, `second-synthetic-task-renamed` |
| Editor backdrop click | A pointer click outside the measured editor, with its estimate menu open, closed both surfaces. | Normal-mode backdrop recorder sequence and subsequent board state |
| Focus after dismissal | Earlier page-focused Escape checks reported the page content as focused, rather than a restored originating card. DevTools-focused checks cannot establish ordinary page focus behavior. | Escape AX receipts; do not generalize inspector focus |

The exact date/estimate/menu keyboard results differ by surface. They are observations, not a recommendation to reproduce inconsistent dismissal or silent draft loss in Laptop Planner.

## Motion authority

- The inspected editor containers had computed transition duration **0 s**, animation name **none**, and no transform under both reduced and normal motion.
- The actual estimate panel (`.dropdown-menu-kanban-time`) had computed transition duration **0 s** and animation name **none** in the normal-motion sample.
- The normal-motion quick-add receipt captures 16 visible overlay/control entries with transition duration **0 s** and animation name **none**. Its transparent overlay background differs from the task editor's dimmed backdrop.
- After a controlled editor close/reopen cycle, the Animations panel at 100% showed **Currently waiting for animations** and no retained effect groups. A later backdrop/pointer sequence recorded a **200 ms navigation-toggle opacity** effect; its identity was checked. It is not evidence of a 200 ms editor fade.
- These are computed configurations and supported recorder observations. They do not prove the absence of every JavaScript-driven movement or measure total input-to-paint latency. No generic 150–200 ms editor fade/scale or delayed 500 ms modal fade is established.
- CSS selection matched 309 editor/popup-related declarations but retained only the first 100; `completeWithinSelection` is false, and one stylesheet was unreadable. This partial collection must not be used to assert global absence of a rule.

The earlier specific checkbox/card/control declarations remain supported by [motion-timings.md](motion-timings.md). Drag physics, edge scrolling, completion/Undo choreography, narrow-window collision behavior, and exhaustive interruption/frame timing remain separate acceptance work. No exact easing is inferred from an unrecorded video.

## Final synthetic data and incident

- `TEST — Edit this task`: 10-minute estimate; notes `Example notes.`
- `TEST — Menu interactions`: 20-minute estimate.
- `TEST — Capture artifact`: planned time cleared. An inspection expression was accidentally pasted into quick add because console focus was not verified. The resulting extra synthetic task was renamed and its estimate cleared. Undo reported no commands to undo. A backlog move was not confirmed, so no relocation or deletion is claimed. It remains in the test channel.

No personal task was intentionally selected for editing, completed, deleted, moved, or timed. Opening/creating synthetic tasks caused Sunsama's own estimate/schedule behavior; this pass does not use that behavior as evidence for Laptop Planner's scheduler. The test records remain available for review. macOS Reduce motion is restored to **on**.

## Readiness

The editor presentation and core Phase 2 behaviors now have current reference evidence. [The proposed implementation contract](phase2-interaction-contract.md) separates reference behavior from intentional Laptop Planner choices and defines implementation acceptance. UI Phase 2 has not started. This does not certify every Sunsama animation or close the later motion-acceptance phase.
