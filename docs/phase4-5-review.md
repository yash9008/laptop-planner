# UI Phase 4 and 5 follow-up review — October 28, 2026

**Verdict: needs fixes.** The palette, Focus screen, and Phase 5 motion work are
implemented and the recorded hosted runs are green at their revisions, but
several documented behaviors are absent from the code, and two state paths
diverge from what the user sees.

**Reviewed revision**: `be64f26` (`ui-phase-5`), plus the uncommitted Phase 5
documentation and test-description edits on that branch.

## Verification of this pass

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `git diff --check` | pass |
| Phase 4 hosted receipt, `d0f55c3`, run `40500807107` | recorded 122/122 Electron |
| Phase 5 hosted receipt, `4548a8a`, run `40509013630` | recorded 128/128 |
| Evidence screenshot SHA-256 against files on disk | match |

Two limits apply. The receipts cover `d0f55c3` and `4548a8a`, not the current
uncommitted test-description and documentation edits. GitHub API access timed
out during this pass, so run status was read from the saved receipts in
`docs/evidence/phase5-motion-acceptance/` rather than re-queried live. No
Electron suite was run locally, per the hosted-execution preference.

## Phase 4 findings

### P1 — Palette task commands target a different task than Focus is showing

`App.tsx:902` derives the palette's task commands from `selectedTaskId`, but
Focus navigation only calls `setFocusTaskId` (`App.tsx:1814`; state at `:56`).
After Next, auto-advance, or a task click inside Focus, `Cmd+K` offers
`Edit task: "<previous task>"`. Editing it while a timer runs commits against
the wrong task.

### P1 — "Hide calendar" does nothing while a utility panel is open

`App.tsx:1117-1123` toggles `calendarOpen` only. The dock continues to render
the active utility panel (`App.tsx:2016-2093`, `:2101-2107`), so the command's
label promises a visible change that never happens.

### P2 — Palette handoffs lose their originating element

The Add-task command closes the palette and defers `openNew()` to a
`setTimeout` (`App.tsx:1066-1073`), so `captureTaskOrigin` inside `openNew`
(`App.tsx:340-350`) reads `BODY` after the palette has unmounted. Storage
settings and the Backlog/Recovery panel commands leave focus on `BODY` for the
same reason.

### P2 — Backlog panel does not focus its first task on open

The acceptance matrix and handoff state that opening Backlog focuses the top
backlog task. `BacklogPanel` has no mount-focus effect.

### P2 — Selection is not exposed to assistive technology

`aria-selected` is set on a plain `<article>` (`App.tsx:1269`,
`BacklogPanel.tsx:123`) with no supporting role, so ARIA ignores it. Selection
is not announced.

### P2 — No `?` trigger exists for keyboard help

`App.tsx` contains no `'?'` key handler. `keyboardHelpOpen` is only reachable
from the palette and other explicit controls, contrary to the matrix and
shortcut list.

### P3 — Focus view keeps the previous task's scroll position

`FocusScreen.tsx` has no `scrollTop` reset or `scrollIntoView` on task change.
Completing a long task can leave the next task scrolled out of view.

### P3 — Phase 4 screenshot fixture saves the wrong estimate

`phase4-ui.spec.ts:61` parses estimates with `endsWith('h')`, so the `'1h 30m'`
fixture at `:440` is saved as **1 minute**, not 90. Any schedule assertion
built on that task is measuring the wrong input.

## Phase 5 findings

### P1 — Navigation-icon motion does not exist

`styles.css:319` declares `transition: transform 300ms ease-in-out` on
`.nav-item svg`, but no rule in the file ever applies a `transform` to a
navigation icon. The transition animates nothing. `phase5-ui.spec.ts:117`
asserts the declaration's computed `transition` string, so the test passes on
inert CSS.

### P2 — Test names assert more than the bodies check

- `phase5-ui.spec.ts:69` claims "across all surfaces" while sampling a handful
  of selectors.
- `phase5-ui.spec.ts:307` promises "whole-card lift, placeholder reflow,
  settling" without asserting lift or settle timing.
- `phase5-ui.spec.ts:253` claims "rapid repeated toggles" while performing a
  short sequential loop with no interleaving.

### P2 — Acceptance matrix states behavior the code does not have

`phase5-motion-acceptance.md` row 45 (`?` trigger), row 48 (Backlog
auto-focus), and row 60 (completion undo toast) describe behavior absent from
the implementation.

### P3 — Handoff misdescribes an evidence screenshot

`phase5-implementation-handoff.md:95` calls `ui-phase5-focus-wide.png` a
running timer; the image shows `00:00` and "Start focus".

## Resolution plan

Behavior is implemented to match the documentation; documentation and test
descriptions are corrected only where they still overstate the result.

| Finding | Resolution |
| --- | --- |
| Palette task identity | Palette task commands follow the Focus task while the Focus view is active |
| "Hide calendar" | Command selects the board surface, closing an open utility panel |
| Handoff origin | Commands pass their triggering element into the follow-up action |
| Backlog auto-focus | Panel focuses the first task on mount without stealing focus on refresh |
| Selection semantics | Listbox/option roles with `aria-selected` valid for the element |
| `?` trigger | `?` opens keyboard help outside text entry and modal states |
| Focus scroll | Scroll container resets when the focused task changes |
| Estimate fixture | `1h 30m` parses to 90 minutes |
| Nav-icon motion | A real transform is applied; test asserts the applied transform |
| Test names | Renamed to match assertions, with assertions strengthened where cheap |
| Matrix rows 45/48/60 | Retained, now backed by implementation |
| Screenshot caption | Describes the captured `00:00` state |

## Fixes applied

All findings above are addressed on branch `fix/phase4-5-review`.

**Application**

- `App.tsx` — palette task commands derive from the Focus task while the Focus
  view is active, so `Cmd+K` matches the task on screen.
- `App.tsx` — the calendar command releases a docked utility panel before
  showing the calendar, and its label reflects the panel state.
- `App.tsx` — the Add-task command passes its palette trigger into `openNew`,
  and storage settings restore the originating control on dismiss.
- `BacklogPanel.tsx` — focuses the top backlog task on mount only, and exposes
  selection with `aria-current` instead of an unsupported `aria-selected`.
- `RecoveryPanel.tsx` — focuses the panel on mount.
- `App.tsx` — a task card marks its selection with `aria-current`.
- `App.tsx` — `?` opens keyboard help outside text entry and modal states;
  closing it restores the previous control.
- `FocusScreen.tsx` — the scroll container returns to the top when the focused
  task changes.
- `styles.css` — navigation icons scale to `1.12` on hover and keyboard focus,
  so the 300 ms transform transition now animates a real change.

**Tests**

- `tests/app/phase4-5-fix.spec.ts` covers the palette/Focus identity, the `?`
  trigger and its focus restoration, the calendar command against a docked
  panel, and the Backlog mount focus.
- `tests/app/phase5-ui.spec.ts` asserts the hovered navigation-icon matrix is
  not `none`, and three test names now match their assertions.
- `tests/app/phase4-ui.spec.ts` parses `1h 30m` as 90 minutes.

**Documentation**

- The navigation-icon, utility-panel, and completion rows of the acceptance
  matrix now describe implemented behavior.
- The wide Focus screenshot caption matches the captured `00:00` state.

The hosted run for this branch is the evidence for these changes; the receipts
recorded above cover the earlier revisions.
