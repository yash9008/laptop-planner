# UI Phase 2 interaction contract

Status: R1–R8 fixes independently rechecked; [the final review](phase2-final-review.md) records the last focus correction, passing checks, and verification limits. UI Phase 2 is ready for the next phase. This document remains the Phase 2 acceptance contract. Read [the current reference pass](phase2-reference-pass.md), [PLAN.md](../PLAN.md), and [AGENTS.md](../AGENTS.md).

## Scope

Deliver a compact quick-add composer, a centered task detail editor, an anchored estimate popover, and a task action menu. Reuse existing typed application operations. Retain title, estimate, notes, date/backlog, project, deadline, recurrence controls, and recovery behavior currently exposed by `src/renderer/components/TaskEditor.tsx`. No schema, scheduler, cloud, branding, subtask, rich-text, comment, or manual timeboxing expansion is included.

## Reference and deliberate product choices

The current reference editor is centered, 670 CSS pixels wide in the measured viewport, with a dimmed backdrop. The clone should use a responsive centered editor with scrolling content and room at the viewport edges. The exact responsive bounds are a Laptop Planner design choice; a single reference size does not establish every breakpoint.

The following differences are **proposed Laptop Planner behavior**, not verified Sunsama parity:

| Situation | Observed Sunsama behavior | Proposed Laptop Planner contract |
| --- | --- | --- |
| Dirty quick-add Escape | Discards the fictional draft in-session | Close while retaining the draft in renderer state for reopening; expose an explicit discard action |
| Dirty quick-add outside click | Created the draft on the tested toolbar click | Never create merely because focus leaves; explicit submission creates the task |
| Nested Escape | Estimate/editor and date/editor behave differently | Close only the innermost surface on each Escape; preserve the parent's draft |
| Focus after dismissal | Page content was the observed focus target | Return focus to the initiating control/card using stable task identity without shifting board scroll |
| Detailed edits | Synthetic title/notes changed in-session without a Save action | Preserve the existing explicit save and atomic failure handling for this phase; autosave requires a separate reviewed persistence contract |

These choices protect drafts and preserve existing write/recovery guarantees. Review these proposed departures before implementation; do not silently describe them as copied reference behavior.

## Surface contracts

1. **Quick add:** `A` and a dated column's Add task control open the compact composer with the correct date and active project filter. Preserve existing backlog/project-view date defaults. Focus the title after mounting. Enter submits when ordinary text entry is intended; ignore composition events and keep shortcuts out of editable controls. Start the estimate empty, as the current new-task form does, and require a valid positive duration before creation; show inline validation without losing the title. Do not introduce a guessed estimate or a new remembered-estimate preference. Provide estimate/date/project access and an explicit route to full details. Reuse a stable creation ID through failed or ambiguous retries. Keep the draft and useful error after failure.
2. **Task editor:** title action opens the centered editor for a stable task ID. Keep existing fields and recurrence behavior. Save commits through the existing operation, with a saving state and retained failed draft. Child popovers close before the editor. Closing cannot silently discard a failed or uncommitted draft. Returning to the board retains date and horizontal position.
3. **Estimate popover:** duration opens the anchored estimate editor rather than full details. Offer practical presets and the existing duration parser. Reference Clear planned is not permission to bypass Laptop Planner's positive-duration validation. Saving one estimate must preserve every other field and use the existing atomic scheduling path. On failure keep the popup value/error available. Fit or flip the popup within the viewport.
4. **Task menu:** bind every action to the originating task ID. Expose supported existing operations only; do not add inert repeat/duplicate/objective items to mimic Sunsama. Support keyboard targeting, disabled states, child-first dismissal, and return focus to the trigger.
5. **Board:** preserve whole-card dragging, control exclusions, click suppression after drag, insertion preview, cancellation, atomic drop, rollback, and nearest-left-column calendar following.

## Draft ownership and save boundaries

These details clarify the proposed behavior so the implementing agent does not invent persistence or dismissal policies:

- **Draft lifetime:** retain unsaved task drafts in renderer memory above components that unmount when a surface closes. Existing-task drafts are keyed by task ID. Creation drafts are keyed by target date/backlog and project ID, with one stable creation ID per draft. Closing and reopening the same context restores that draft; opening another context must not relabel or overwrite it. Drafts do not need to survive application exit/reload in this phase. Only committed records must survive restart.
- **Creation handoff:** Open full details transfers the same uncommitted title, estimate, date/backlog, project, notes, and creation ID. Preserve additional detailed fields, including deadline and recurrence choices, across any return to quick add. It must not save a task as a side effect. Keep that ID through failures, uncertain responses, dismissal/reopening, and switching between quick add and full details. Clear the creation draft after confirmed success or explicit discard; an explicitly discarded, never-submitted draft can receive a fresh ID next time. Preserve the existing reconciliation/retry semantics after an uncertain write instead of blindly resubmitting changed content under an already committed ID.
- **Existing-task dismissal:** Escape, backdrop click, and the close button may close the editor while keeping its draft. Provide an explicit discard action that returns to committed values. Background timer/clock refreshes must not overwrite dirty form fields. Restore saved values after a successful save, clear the appropriate cached draft after confirmed deletion, and retain draft/error state after failure.
- **Estimate save boundary:** a duration badge on a card opens a standalone popover whose explicit preset selection or submit saves through the existing atomic operation. Merely typing, blurring, closing, or opening a menu must not write. Inside an unsaved task editor or quick-add composer, choosing an estimate updates that parent draft; it does not independently commit or discard other fields. A standalone estimate write must resolve the current committed task by ID and preserve unrelated fields. Do not reuse a close-on-editor-save callback if it would dismiss a different surface.
- **Pending writes and stale results:** while a surface is saving, prevent repeat submission and dismissal/discard that would lose its state. Key completion/error handling to the originating task/draft and surface instance. A late response must not close, overwrite, or attach an error to a newly opened task. Preserve the existing busy/sequence protections and UTC timer authority.
- **Task menu minimum:** Edit task, Move to backlog (disabled when already in backlog), and Delete through the existing operation and Undo flow. Existing completion, focus, and reorder controls must remain reachable. Recurrence remains available through the detailed editor; this phase does not require a new Repeat or Duplicate command.
- **Focus and containment:** the detailed editor contains keyboard focus; each child consumes its own Escape and outside-click dismissal without also triggering its parent or a background action. Restore a connected originating control using `preventScroll`; if it no longer exists, focus a stable control in the same view. Do not introduce page jumps just to restore focus.
- **Shared primitives:** changes to `Modal.tsx` or other shared components must preserve project, event, and storage-dialog behavior. Prefer task-specific policies or explicit configuration over changing every dialog's semantics.

## Motion

- Match the specific computed/declared checkbox property feedback at 50 ms and card/context-control opacity at 200 ms where the component corresponds to the evidence.
- The 150 ms menu-item color/border rule is a loaded declaration; do not label it a measured complete-menu entrance.
- Start the new editor/composer/popup containers without an invented entrance fade/scale. Their inspected reference containers report zero-duration transitions in the tested configurations. An authored movement later requires matching evidence or an explicitly identified design decision.
- Reduced motion removes optional movement while keeping focus, state changes, error feedback, and insertion visibility. Saving/dismissal correctness must not depend on an animation callback.
- Repeated open/close, task switching, navigation, or failed writes must cancel stale work and leave one coherent state. Full drag/completion motion comparison remains in UI Phase 5.

## Delivery sequence and checks

Implement within Phase 2 in reviewable batches: quick add; centered editor; estimate popover and task menu; then integration verification. Only one agent edits the shared checkout or runs builds/UI suites at a time.

Use controlled clocks and disposable local databases. Cover meaningful acceptance cases: selected date/project defaults; Enter and composition; child Escape/outside click; draft reopening and context isolation; quick-add/full-details handoff without writes or duplicate records; focus/scroll restoration; standalone estimates preserving other fields versus child estimates updating an unsaved draft; rapid task switching; failed saves and idempotent creation retry; post-drag click suppression; narrow viewports; reduced motion; restart persistence after committed saves. These tests should exercise behavior, not mirror component implementation. Update tests for intentional UI flow changes while retaining their existing acceptance assertions; do not skip or weaken them to obtain a passing suite.

Run focused checks while implementing. At the completed feature-phase boundary run `npm run check`, run the real Electron app with disposable fixtures, fix failures, report exact commands and visible results, and wait for user continuation. Do not rebuild/install a DMG or begin UI Phase 3 as part of this work.

For a manual source-build smoke test, launch with `LAPTOP_PLANNER_TEST_DATA_DIR` pointing to a newly created temporary directory and `LAPTOP_PLANNER_TEST_NOW` set to a controlled instant. Reuse the provided Electron fixture patterns. Never run QA fixtures against the normal personal database. Save representative wide/narrow screenshots and report their paths along with any environment blocker.

## Gemini handoff after phase authorization

Read AGENTS.md, PLAN.md, docs/phase2-reference-pass.md, docs/phase2-interaction-contract.md, and the evidence they reference. Implement only the authorized UI Phase 2 scope in the sequence above. Preserve the reviewed product departures, existing offline/security/data guarantees, atomic saves, focus recovery, and board behavior. Run the required checks, report changed files and exact results, and stop for phase review. Treat unknown motion as unknown; do not invent reference timings.
