# Review of Gemini's reference verification handoff

> Historical review of the initial Gemini draft; line references below refer to that version. Gemini subsequently corrected the consolidation, and [a live synthetic-task follow-up](phase2-reference-pass.md) added new evidence. Use [the current Phase 2 contract](phase2-interaction-contract.md) for proposed implementation scope. This review remains a record of the original evidence-quality issues.

Date: October 26, 2026

Verdict: revisions needed. The handoff is a useful consolidation of existing evidence; it does not close the remaining reference-verification gaps or establish readiness to implement UI Phase 2.

## Checks performed

- Read `reference-verification-handoff.md` against `interaction-audit.md`, `motion-timings.md`, `ui-reference.md`, and the phase gate in `../PLAN.md`.
- Recomputed SHA-256 for all five evidence files listed in `evidence/sunsama-motion-sha256.json`; all five match the manifest. This checks consistency with the manifest, not independent authenticity or completeness of the original captures.
- Inspected the 25 computed-style entries, 36 selected CSS rules, 14 composer entries, and the recorder's two opacity spans.
- Checked the clone's 170 ms reflow, 180 ms landing, easing, and reduced-motion branches in `../src/renderer/components/BoardDrag.tsx`.
- Found no new recording, runtime trace, or measurement cited by the handoff. Its evidence references point to the earlier captures and audit notes. No current Sunsama runtime inspection was performed during this review.

## Findings

### 1. Phase 2 verification is still incomplete

Handoff lines 4, 234, and 260 need clearer scope. The document calls itself complete and prescribes implementation boundaries, but its checklist still lacks current editor presentation, draft cancellation, nested dismissal, completion/Undo, and normal-motion observations. Moving the evidence deadline to Phase 5 does not satisfy PLAN.md's pre-Phase-2 requirement to verify editor presentation and specify popup/dismissal/focus behavior.

Correction: label the document an existing-evidence consolidation with verification incomplete. Preserve the current phase gate. Separate Phase 2 prerequisites from later motion acceptance; not every drag or Focus detail must block task-editing work.

### 2. Drag behavior and implementation mechanisms exceed the evidence

Handoff lines 139–150 mix prior Sunsama observations with clone behavior. Reduced-motion drag suppression is established in the clone source, not by a comparison of Sunsama drag runs. The assertion that Sunsama has no displacement CSS and executes reflow through JavaScript/requestAnimationFrame is not established by 36 selected rules. The existing timing document explicitly limits that selection. Likewise, line 82 assigns possible causes to the 184 ms span that the recorder does not demonstrate.

Correction: label each drag assertion as prior reference observation, clone implementation, or unknown. Leave Sunsama's motion mechanism, cancellation trajectory, reduced-motion behavior, and the cause of the shorter opacity span unresolved pending controlled evidence.

### 3. Computed declarations are promoted to observed interaction sequences

Handoff lines 104 and 112 claim synchronous focus and zero-duration entrance/exit. An accessibility focus observation does not establish synchronous timing; the composer capture records computed styles and no retained opening animation group, not a measured exit or every possible JavaScript effect. Lines 173–175 assert completion-driven row collapse, progress width animation, and an Undo toast without matching interaction evidence. The captured progress rule specifies opacity only. Completion/Undo was not exercised, and no direct guide citation establishes the toast claim. Lines 223–225 label unexercised row/text hooks as verified collapse/entrance.

Correction: retain exact values with their original authority and property. Say focus moved into the description, report the observed opening configuration, keep exit unverified, and remove or source the unsupported completion/width/toast sequence. Do not infer a lifecycle trigger from a selector name alone.

### 4. Product proposals are presented as reference-derived requirements

Handoff lines 234–245 recommend a centered modal or inline popover, 150–200 ms fade/scale, and 200 ms card hover highlights as boundaries based strictly on verified evidence. These are design proposals. The current editor shape is unknown, no generic overlay fade/scale is verified, and the card evidence specifies opacity rather than every hover-highlight property. The 150 ms menu-item rule is declared but unexercised. Nested Escape handling can be a deliberate Laptop Planner contract, without claiming observed Sunsama nesting parity. The date-picker Escape result should retain the original single-observation qualification.

Correction: separate evidence from proposed Laptop Planner behavior. Do not adopt a modal/drawer fallback or generic duration as verified Sunsama behavior. Preserve review of any proposed departure from the phase plan.

### 5. Provenance and citations need tightening

The handoff's first-person inspection language does not distinguish the original investigator's work from Gemini's document review. Several line anchors point to unrelated JSON entries or use combined range fragments that do not identify one location. The claim that a draft was closed without discarding it is stronger than the earlier note that it was left untouched; that note does not demonstrate retained draft state after closing.

Correction: attribute observations to the earlier audit, identify each evidence item by filename and selector/class, and avoid claims of independent inspection or verified draft retention without a new receipt.

## What remains usable

The matching evidence supports the specific 50 ms checkbox property declarations, 200 ms card/control opacity declarations, 150 ms menu-item declaration, two recorded navigation opacity spans, and zero-duration computed composer styles in the observed reduced-motion configuration. The clone's 170/180 ms values and reduced-motion branches are correctly identifiable as clone implementation choices. None of these establish every interaction trigger or full motion parity.

## Next useful evidence

Prioritize a current disposable reference showing task-editor presentation, quick-add empty/dirty cancellation, estimate/action/date menus, nested dismissal, and focus restoration. Record the app/version, motion preference, input sequence, and file/timestamps. Capture runtime styles/effects where exact timing is needed; use video only for frame-bounded observations. Normal-motion comparison remains necessary. Keep personal records out of fixtures.

Correcting the report will improve the handoff but will not supply these missing observations. Preserve unresolved completion/Undo, drag, and panel details in their appropriate phase acceptance work. Phase 2 remains unstarted.

This review added documentation only. No application code, dependencies, databases, packages, or original evidence files were changed. App tests were not run because this review changes no runtime behavior.
