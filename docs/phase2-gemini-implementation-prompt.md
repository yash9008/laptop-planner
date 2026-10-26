Implement **UI Phase 2 only** for Laptop Planner in:

`/Users/yashsawant/Documents/Projects/sunsama clone`

This prompt authorizes the Phase 2 implementation and its internal batches, followed by testing and a final review handoff. Stop after Phase 2; do not begin Phase 3 or package/install a DMG. The contract's “proposed” status describes its state before this implementation instruction.

Read first:

- `AGENTS.md` and the current UI phase section of `PLAN.md`.
- `docs/phase2-interaction-contract.md`, including Draft ownership and save boundaries.
- `docs/phase2-reference-pass.md` and relevant records in `docs/evidence/sunsama-phase2-reference.json`.
- `docs/motion-timings.md` for component-specific evidence and limitations.

Inspect the existing source and tests before editing. Use the current contract and live-reference follow-up over conflicting statements in the historical handoff/review. Keep the existing implementation as the starting point; avoid a broad rewrite.

Deliver these in sequence within this phase:

1. A compact quick-add composer with correct selected-date/backlog/project defaults, keyboard entry, explicit submission, and access to full details.
2. A responsive centered task editor preserving all existing fields, recurrence controls, and explicit Save behavior.
3. An anchored estimate popover and a keyboard-accessible task menu. Minimum menu actions: Edit, Move to backlog, Delete using existing Undo. Preserve existing completion/focus/reorder access.
4. Integration tests, a real Electron smoke run, screenshots, and a review handoff.

Apply the deliberate Laptop Planner choices in the contract: keep drafts in renderer memory after dismissal, provide explicit discard, never create a task merely on outside click, dismiss child overlays before parents, and restore focus without moving the board. These are intentional product decisions, not claims of exact Sunsama parity.

Important implementation boundaries:

- Preserve a creation draft's ID and values across quick-add/full-details switching and uncertain retries. Opening full details must not create a record. Isolate drafts by task or creation context, and prevent stale save results from affecting another surface.
- A standalone card estimate save commits atomically while preserving other fields. An estimate chosen inside an unsaved editor/composer updates that draft only. Preserve busy states, failure drafts, useful errors, and retry reconciliation.
- Keep whole-card dragging, insertion preview, cancellation, atomic drop, rollback, post-drag click suppression, nearest-left-column calendar following, and UTC focus/recovery behavior working.
- Reuse typed operations and existing validation. Keep the app offline and security boundaries intact. No dependency, lockfile, schema, scheduler, integration, or unrelated feature expansion is part of this phase. If a contract requirement cannot fit these boundaries, explain the concrete conflict before departing from scope.
- Use the specific supported 50 ms checkbox and 200 ms opacity feedback where applicable. Do not invent a generic editor/popover fade, scale, or timing curve. Distinguish computed styles and declared rules from measured animation sequences. Respect reduced motion.

Test with temporary databases and controlled clocks using the existing Electron fixtures. Update affected tests for the new UI flows while preserving their behavioral acceptance assertions. Cover draft/context isolation, duplicate prevention, failed/uncertain saves, child dismissal, keyboard/IME behavior, focus/scroll continuity, estimate-save boundaries, drag regression, and wide/narrow windows in both motion modes.

Run focused checks during implementation, then `npm run check` at the completed phase boundary. Run the real app with `LAPTOP_PLANNER_TEST_DATA_DIR` set to a new temporary directory and `LAPTOP_PLANNER_TEST_NOW` set to a controlled instant. Fix failures; do not use the personal database or change Sunsama, macOS settings, or reference evidence. Keep builds/UI suites sequential. If you lack tools to execute a check, report it explicitly rather than claiming it passed.

Update phase status and relevant user-facing documentation with actual results. Write `docs/phase2-implementation-handoff.md` containing:

- What was implemented and the changed files.
- Exact commands and pass/fail results.
- The real Electron flows inspected and screenshot paths.
- Remaining limitations, failures, or departures from the contract.

Complete the authorized Phase 2 work without pausing between its internal batches unless a genuine scope/data-safety blocker requires input. Stop afterward for user review. Do not claim that completing Phase 2 completes all Sunsama features or animation parity.
