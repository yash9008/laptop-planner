# Reference Verification Handoff: Sunsama Interaction & Motion Baseline

> Historical consolidation from before the live synthetic-task follow-up. The current [Phase 2 reference pass](phase2-reference-pass.md) supersedes the unresolved editor/quick-add findings below for the interactions it actually tested. Read the [proposed Phase 2 contract](phase2-interaction-contract.md) for implementation scope. Full motion parity remains incomplete; Phase 2 code has not started.

**Date:** October 26, 2026  
**Document Status:** Existing-evidence consolidation; reference verification remains **INCOMPLETE** (Read-only; no application code or database changes)  
**Implementation Phase Gate:** UI Phase 2 remains unstarted; Phase 2 prerequisites are unresolved  
**Governing Documents:** [AGENTS.md](../AGENTS.md), [PLAN.md](../PLAN.md), [docs/interaction-audit.md](interaction-audit.md), [docs/motion-timings.md](motion-timings.md), [docs/ui-reference.md](ui-reference.md), [docs/reference-verification-review.md](reference-verification-review.md)

---

## 1. Executive Summary and Verification Status

This document consolidates the existing reference evidence regarding Sunsama’s UI and motion behaviors to prepare for Laptop Planner’s UI Phase 2. In compliance with [AGENTS.md](../AGENTS.md), Laptop Planner remains an offline personal planner with its own branding, database, and scheduling engine. Sunsama serves solely as an authorized layout and behavior reference.

### Current Status: Verification Incomplete
As confirmed in [docs/reference-verification-review.md](reference-verification-review.md), **reference verification is incomplete**. The evidence gathered to date provides computed styles and loaded CSS declarations for a defined subset of components, but does not establish:
1. Current task-editor presentation (centered modal vs. side drawer vs. inline view).
2. Quick-add cancellation and draft handling mechanics (empty vs. dirty drafts).
3. Contextual popup presentation, dismissal hierarchies, and focus restoration.
4. Completion dwell, list reordering, and Undo toast lifecycle choreography.
5. Comparative normal-motion behavior (all live captures were recorded under `prefers-reduced-motion: reduce`).

Per [PLAN.md](../PLAN.md), UI Phase 2 implementation cannot proceed until the task-editor presentation is verified against a current reference and the popup, dismissal, focus, and interrupted-transition behaviors are specified. These prerequisites cannot be deferred to UI Phase 5.

### Evidence Authority Classifications
To prevent unverified assumptions from entering the codebase, evidence is classified strictly into five categories:
1. **Measured:** Recorded directly via DevTools Animations panel or verified frame timestamps.
2. **Computed:** Read from a live, rendered DOM element via `window.getComputedStyle()`.
3. **Declared in CSS:** Extracted from active stylesheets (`/static/css/index.D-Ydq_78.css` or inline styles), where the rule exists but the transition was unexercised on live data.
4. **Estimated / Prior Observation:** Qualitative behavioral notes from earlier user recordings or public walkthroughs; does not establish millisecond constants or easing curves.
5. **Unknown:** Unobserved, obscured by client JavaScript logic, or unexercised due to privacy restrictions.

---

## 2. Findings Across the 5 Focus Areas

### Focus Area 1: Task-Editor Opening and Closing

#### Inspected Evidence
- **Loaded CSS Declarations:** [`docs/evidence/sunsama-motion-rules.json`](evidence/sunsama-motion-rules.json) records `.modal-fade-in-enter-active, .modal-fade-in-appear-active` (`transition: opacity 0.5s ease-in 0.5s`) and `.tiptap-editor .editor-highlight-menu-button-tooltip` (`transition: opacity 200ms`).
- **Computed Overlay Styles:** [`docs/evidence/sunsama-composer-motion.json`](evidence/sunsama-composer-motion.json) records `.overlay-container` (`transition: all 0s ease 0s`, `animation: none`).
- **Public Walkthrough Video:** Loom walkthrough referenced in [`docs/interaction-audit.md`](interaction-audit.md#L11,L28) shows a light-theme centered modal overlay around 1:25.
- **Audit Findings:** [`docs/interaction-audit.md`](interaction-audit.md#L28) notes that task details were deliberately **not opened** on the user's private tasks during the October 26 audit.

#### Observed Interaction vs. Proposed Designs
- The older vendor video demonstrates a centered modal dialog over a dimmed board.
- The live Mac app’s current task editor presentation was **not observed**.
- An earlier Laptop Planner proposal suggested a "slide-in drawer." This was an internal proposal, not an observed Sunsama design.
- The computed style of `.overlay-container` evaluated to zero transition duration in the inspected state.

#### Timing Classification
- `.modal-fade-in-enter-active`: **Declared in CSS** (`opacity 0.5s ease-in 0.5s`).
- Editor highlight tooltip: **Declared in CSS** (`opacity 200ms`).
- Overlay container default: **Computed** (`0s` transition, `none` animation).
- Task-editor opening/closing animation: **Unknown**. The association between `.modal-fade-in-*` and the current task detail editor is unverified.

#### Unresolved Items (Phase 2 Prerequisites)
- Whether the current dark-mode editor is a centered modal, a side drawer, or an expanding column.
- Backdrop appearance, opacity, and enter/exit transition.
- Dismissal mechanics via Escape, backdrop click, or close button, and focus restoration to the originating card.
- Draft retention policy when closing an edited task.

---

### Focus Area 2: Nested Menus (Actions, Date Picker, Filters, Dropdowns)

#### Inspected Evidence
- **Computed Styles:** [`docs/evidence/sunsama-motion-computed.json`](evidence/sunsama-motion-computed.json) records `.navigation-dropdown-menu-navigation-panel-toggle-btn` (`opacity 0.2s ease 0s`) and `.kanban-sort-btn` (`opacity 0.2s ease 0s`).
- **Loaded CSS Declarations:** [`docs/evidence/sunsama-motion-rules.json`](evidence/sunsama-motion-rules.json) records `.dropdown-action-btn` (`transition: background-color 0.15s, color 0.15s, border-color 0.15s`).
- **DevTools Animations Recorder:** [`docs/evidence/sunsama-motion-recorder.txt`](evidence/sunsama-motion-recorder.txt) captured two opacity spans (`200 ms` and `184 ms`) on `.navigation-dropdown-menu-navigation-panel-toggle-btn`.
- **Live Audit Observations:** [`docs/interaction-audit.md`](interaction-audit.md#L30-L34) records live trigger and dismissal attempts.

#### Observed Interaction
- Dropdown triggers and action buttons exhibit immediate visual hover/focus transitions.
- During live audit inspection on October 26:
  - Clicking the filter button opened a category popover; pressing `Escape` closed it.
  - Clicking the date button opened a month calendar grid; in that single observed state, pressing `Escape` produced no accessibility-tree change, while clicking the trigger again closed it.
  - The board view dropdown opened on click; pressing `Escape` did not close it, but clicking the trigger did.
- Contextual action menus nested inside task cards were not opened on live tasks.

#### Timing Classification
- Dropdown action button (`.dropdown-action-btn`): **Declared in CSS** (`150ms ease`).
- Panel toggle button (`.navigation-dropdown-menu-navigation-panel-toggle-btn`): **Computed** (`200ms ease`) and **Measured** in recorder (`200 ms` and `184 ms`). The exact cause of the 184 ms span (e.g. interruption/reversal or sampling cadence) is unverified and not demonstrated by the recorder text alone.
- Menu container entrance/exit (transform, scale, opacity): **Unknown**. Computed styles for `.dropdown` containers showed `0s`, with no animation group retained.

#### Unresolved Items (Phase 2 Prerequisites)
- Multi-level dismissal: when a date picker or submenu is opened inside an action menu, whether `Escape` dismisses only the child or cascades.
- Whether menu containers animate via uncaptured JavaScript transforms or pop open instantly (0 ms).
- Anchor positioning, viewport boundary collision, and keyboard arrow-key navigation within menus.

---

### Focus Area 3: Quick-Add Cancellation

#### Inspected Evidence
- **Computed Styles:** [`docs/evidence/sunsama-composer-motion.json`](evidence/sunsama-composer-motion.json) records 14 elements of the open composer (`.overlay-container`, `.dropdown`, `.add-task-modal-btn`, etc.), all returning `duration: 0s` and `animation: none`.
- **Loaded CSS Declarations:** [`docs/evidence/sunsama-motion-rules.json`](evidence/sunsama-motion-rules.json) records `.add-task-modal-pill-control` (`opacity 0.15s cubic-bezier(0.23, 1, 0.32, 1)`) and `.kanban-task-add-btn-*` (`opacity 0.2s`).
- **Live Audit Observations:** [`docs/interaction-audit.md`](interaction-audit.md#L9,L16,L26).

#### Observed Interaction
- Pressing `A` opens a compact composer over the board.
- Accessibility inspection observed keyboard focus moving into the task description input.
- During live inspection, an uncommitted draft was observed in the composer. Inspection ceased immediately, leaving the draft untouched to safeguard user data. This protected user data, but did not test whether uncommitted drafts persist across window closures or dismissals.
- The composer container displayed no CSS transition or animation under the inspected reduced-motion state.

#### Timing Classification
- Add-button icon/text opacity: **Computed and declared** (`200ms ease`).
- Pill control opacity: **Declared in CSS** (`150ms cubic-bezier(0.23, 1, 0.32, 1)`).
- Composer container opening in observed state: **Computed as 0s**.
- Exit transition and normal-motion entrance: **Unknown**.
- Cancellation mechanics: **Unknown**.

#### Unresolved Items (Phase 2 Prerequisites)
- Empty cancellation: does pressing `Escape` or clicking outside dismiss the composer with an exit animation or an instant unmount?
- Dirty cancellation: does pressing `Escape` on a non-empty composer prompt for discard, silently cache the draft in session memory, or discard immediately?
- Focus restoration target upon cancellation (Add-task button vs. previous active card).

---

### Focus Area 4: Drag Settling (Reflow, Ghosting, Insertion Slot, Landing)

#### Inspected Evidence
- **Prior Reference Recording:** October 25 user board recording notes summarized in [`docs/ui-reference.md`](ui-reference.md#L27-L33).
- **Clone Source Code:** `src/renderer/components/BoardDrag.tsx` and `PlanningBoard.tsx`.
- **Loaded CSS Declarations:** [`docs/evidence/sunsama-motion-rules.json`](evidence/sunsama-motion-rules.json) records `.kanban-task-container.kanban-task-chosen:not(.kanban-task-ghost)` (`transition: opacity 0.2s, box-shadow 0.15s, border-color 0.15s`) and `.folder-drop-animating .navigation-item-icon` (`animation: folder-drop-pulse 0.5s ease-in-out`).
- **Computed Styles:** [`docs/evidence/sunsama-motion-computed.json`](evidence/sunsama-motion-computed.json) records draggable task container opacity (`0.2s ease`).

#### Observed Interaction: Prior Observation vs. Clone Implementation
- **Prior Reference Observation (Sunsama):** The October 25 recording showed a card lifting at 1:1 scale with a translucent drag image; neighboring cards shifted to open an insertion slot; dropping finished with a short landing movement; Escape canceled the drag cleanly.
- **Clone Implementation (Laptop Planner):** Authored in `src/renderer/components/BoardDrag.tsx` using `170 ms cubic-bezier(.2,.8,.2,1)` for neighbor reflow and `180 ms` for landing/return. Reduced-motion suppression of drag animations is authored in the clone's source; it was not derived from comparative Sunsama runs.
- **Sunsama Drag Mechanism:** The 36 selected CSS rules contain styling for the chosen card (`.kanban-task-chosen`), but no displacement CSS transitions for neighboring rows. Whether Sunsama executes reflow via unselected CSS rules, JavaScript-driven inline transforms, or a third-party drag library remains unverified.

#### Timing Classification
- Lifted card styling (`.kanban-task-chosen`): **Declared in CSS** (`opacity 0.2s, box-shadow 0.15s, border-color 0.15s`).
- Draggable card opacity: **Computed** (`0.2s ease`).
- Clone reflow and landing: **Declared in clone source** (`170ms` and `180ms`).
- Sunsama reflow and landing duration/curve: **Unknown**.
- Sunsama reduced-motion drag suppression: **Unknown**.

#### Unresolved Items (Deferred to Phase 5 Motion Acceptance)
- Exact duration, spring physics, or cubic-bezier curve of card reflow in Sunsama.
- Drop landing settling duration and cancellation trajectory (snap vs. FLIP return).
- Edge auto-scroll acceleration and distance thresholds.

---

### Focus Area 5: Completion and Undo

#### Inspected Evidence
- **Computed Styles:** [`docs/evidence/sunsama-motion-computed.json`](evidence/sunsama-motion-computed.json) records `.task-item-checkbox-btn.completed` (`transition: background-color 0.05s, color 0.05s, border-color 0.05s, opacity 0.05s`) and `.kanban-day-task-column-progress-indicator` (`transition: opacity 0.2s ease 0s`).
- **Loaded CSS Declarations:** [`docs/evidence/sunsama-motion-rules.json`](evidence/sunsama-motion-rules.json) records `.kanban-task-timing-container-transition-*` (`transition: height 50ms, opacity 50ms 50ms`), `.kanban-task-row-accordian-*` (`transition: height 0.2s, opacity 0.2s 0.2s`), and `.kanban-task-text-fade-*`.
- **Audit Findings:** [`docs/interaction-audit.md`](interaction-audit.md#L39) notes that completion and deletion were **not** executed on live user tasks.

#### Observed Interaction vs. Declarations
- The checkbox button transitions background, border, text color, and opacity across 50 ms.
- The column progress indicator CSS and computed properties specify **opacity only** (`0.2s ease`); they do **not** declare or compute a width animation.
- Staged timing row enter/exit hooks (`50ms height + 50ms opacity`) and accordion hooks (`200ms height + 200ms opacity`) exist in loaded stylesheets. However, because completion was not exercised live, whether these classes trigger during task completion in the current app remains unexercised.
- User documentation describes keyboard completion (`E`) and undo (`Cmd+Z`), but the visual appearance and timing of any completion snackbar or undo toast remain unverified.

#### Timing Classification
- Checkbox button feedback: **Computed and declared** (`50ms ease`).
- Column progress indicator opacity: **Computed and declared** (`200ms ease`).
- Completed task container opacity: **Computed** (`200ms ease`).
- Commitment-faded task opacity: **Declared in CSS** (`150ms ease-out`).
- Staged timing row and accordion hooks: **Declared in CSS** (staged schedules of 100 ms and 400 ms respectively). Lifecycle trigger unverified.
- Task completion dwell, list movement, and Undo lifecycle: **Unknown**.

#### Unresolved Items (Deferred to Phase 5 Motion Acceptance)
- Dwell time between checking a task and its movement to the completed section.
- Text strikethrough animation vs. opacity fading.
- Reinsertion animation when invoking Undo.
- Toast appearance, dwell, and auto-dismissal durations.

---

## 3. Summary Table: Verified Findings vs. Unresolved Gaps

| Component / Interaction | Property & Timing | Authority | Verification Status & Notes |
| :--- | :--- | :--- | :--- |
| **Task Checkbox** | `bg/border/color/opacity: 50ms ease` | Computed & Declared | **Verified.** Rapid local feedback. |
| **Task Card Opacity** | `opacity: 200ms ease` | Computed & Declared | **Verified.** Card surface opacity; not all hover properties. |
| **Context Controls** | `opacity: 200ms ease` | Computed & Declared | **Verified.** Add-button text/icon and sort button opacity. |
| **Dropdown Action Item** | `bg/color/border: 150ms ease` | Declared in CSS | **Declared.** Loaded rule for `.dropdown-action-btn`; unexercised. |
| **Nav Toggle Button** | `opacity: 200ms ease` | Computed & Measured | **Measured.** Recorder captured 200ms and 184ms spans; cause of difference unverified. |
| **Column Progress Bar** | `opacity: 200ms ease` | Computed & Declared | **Verified.** Opacity only; width transition unestablished. |
| **Visible Composer** | `transition: 0s`, `animation: none` | Computed | **Computed.** Reduced-motion state; normal motion unverified. |
| **Timing / Accordion Rows**| Staged 50ms / 200ms schedules | Declared in CSS | **Declared.** Rules exist in stylesheet; lifecycle trigger unverified. |
| **Delayed Modal Fade** | `opacity: 500ms ease-in (500ms delay)` | Declared in CSS | **Declared.** Loaded rule; association with task editor unverified. |
| **Task Editor Presentation**| Centered modal vs. drawer | Unknown | **Unresolved.** Phase 2 prerequisite; reference evidence missing. |
| **Quick-Add Cancellation**| Empty vs. dirty draft handling | Unknown | **Unresolved.** Phase 2 prerequisite; reference evidence missing. |
| **Nested Menu Dismissal** | Escape / click-outside hierarchy | Unknown | **Unresolved.** Phase 2 prerequisite; single-observation live date Escape did not close. |
| **Drag Reflow / Landing** | 170ms / 180ms in clone | Declared in clone | **Unresolved.** Sunsama JS timing unmeasured; deferred to Phase 5. |
| **Completion / Undo** | Dwell, list collapse, toast | Unknown | **Unresolved.** Live data untouched; deferred to Phase 5. |

---

## 4. Distinguishing Reference Evidence from Laptop Planner Proposals

To prevent unverified assumptions from being treated as requirements, proposed Laptop Planner contracts are distinguished from verified reference evidence:

### Verified Reference Constants
- Checkbox toggle transitions: `50 ms ease` across background, border, text color, and opacity.
- Task card, contextual control, and column progress indicator opacity: `200 ms ease`.
- Menu action item hover styling: `150 ms ease` background, color, and border transition.

### Proposed Laptop Planner Design Contracts (Not Verified Sunsama Behavior)
1. **Task Editor Geometry:** An interim proposal suggested a centered modal or inline popover that preserves board scroll and selected-day continuity. This is a design proposal; Sunsama's current editor presentation remains unverified. No drawer or modal fallback should be labeled as verified Sunsama parity.
2. **Overlay Transition Duration:** A general 150–200 ms fade/scale for modals is an internal proposal. Sunsama's computed styles showed 0 ms under reduced motion, and the loaded modal fade rule specifies a 500 ms delay with a 500 ms duration.
3. **Card Hover Highlights:** The verified rule specifies opacity (`200 ms`). Applying 200 ms transitions to borders, shadows, or transforms on card hover is an authored design choice.
4. **Nested Overlay Dismissal Hierarchy:** Laptop Planner proposes that the innermost overlay consume the first `Escape`, and the parent overlay consume the second. This is an intentional engineering contract to resolve observed inconsistencies in Sunsama (where the date picker did not close on `Escape` in one observed state).

---

## 5. Next Steps and Prerequisite Verification Checklist

Per [PLAN.md](../PLAN.md), UI Phase 2 is held until task-editor presentation and popup/dismissal behaviors are verified against controlled reference evidence. Missing items are divided into Phase 2 prerequisites and later motion acceptance work:

### Phase 2 Prerequisites (Required Before Phase 2 Implementation)
- [ ] **Current Task Editor Presentation:** Verify whether the current macOS client uses a centered modal, a side drawer, or an expanding column using a disposable reference.
- [ ] **Quick-Add Cancellation & Draft Policy:** Record pressing `A`, typing into the composer, and pressing `Escape` or clicking outside to verify discard confirmation vs. silent retention.
- [ ] **Nested Action & Date Menus:** Record opening a task action menu, opening an anchored date or project picker from within it, and observing sequential `Escape` dismissal and focus restoration.
- [ ] **Normal-Motion Baseline:** Re-verify composer and menu entrance transitions in an environment reporting `prefers-reduced-motion: no-preference`.

### Later UI Phase Motion Acceptance (Phases 3–5)
- [ ] **Phase 3:** Verify the triggering action and layout mechanics for the 300 ms right-workspace margin rule before adding utility panels.
- [ ] **Phase 4:** Verify Focus screen entrance transitions and command palette choreography.
- [ ] **Phase 5:** Capture 60/120 fps video or performance profiles for drag reflow/landing curves, completion dwell times, and Undo toast lifecycles.
