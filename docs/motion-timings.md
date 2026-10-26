# Motion timings verified from Sunsama — October 26, 2026

## Later Phase 2 follow-up

[The current synthetic-task reference pass](phase2-reference-pass.md) adds computed geometry and motion for the current centered task editor, the estimate panel, and quick add. Editor containers report transition duration 0 s and no CSS animation under both normal and reduced motion; the normal-mode estimate panel and 16 selected quick-add overlay/control entries also report 0 s and no animation. These are computed states, not proof that every JavaScript motion path is absent. Recorder evidence and remaining limits are in that report and [its JSON receipts](evidence/sunsama-phase2-reference.json). The temporary macOS Reduce motion change was restored, with runtime confirmation. The older unresolved list below is superseded only for the specific observations covered by this follow-up.

The current page's developer tools provided exact motion declarations and computed values. These replace estimates for the specific elements below. They do **not** establish complete timing parity for every interaction in Sunsama.

## Verification method

- Inspected the running Mac app at `https://app.sunsama.com` using its existing Developer Tools. The native View menu was dismissed with its accessibility Cancel action before opening inspection. No remote debugging listener was enabled and the app was not relaunched.
- Used read-only Console expressions to inspect `getComputedStyle` and motion declarations in readable, currently loaded CSS stylesheets. The expressions did not read task text, input values, account storage, cookies or application stores, change the DOM/styles, dispatch application actions, or install observers/listeners.
- Captured 25 unique computed motion entries and 36 selected CSS motion rules. The selector scope and full selected results are retained as local evidence. Selection covers modal/popover/dropdown/navigation/kanban/calendar/checkbox families; it is not an inventory of every stylesheet rule or every dynamically loaded screen.
- Used DevTools' Animations panel at **100% playback**. The recorder retained two navigation-toggle opacity previews. Developer Tools was closed afterward and closure was confirmed. No draft was left open by the final inspection state.
- The inspected page reported **`prefers-reduced-motion: reduce`** and a 1155×1072 content viewport while tools were docked. This is the observed media-query state, not proof of which OS or emulation setting caused it. It was not changed. The normal-motion mode still needs a separately controlled comparison.
- An empty quick-add composer and filter were opened without submitting any data. No CSS/Web Animations group was recorded for their opening in this configuration. This negative result cannot exclude JavaScript-driven animation or behavior under another motion preference. Live actions were re-observed after an external window-state change; no user draft was edited.

The primary stylesheet observed through the live CSSOM was `/static/css/index.D-Ydq_78.css`. One font stylesheet could not be read through CSSOM; the selected app motion rules were readable. Loaded but unexercised rules are kept separate from active computed styles.

## Exact values and their authority

**Computed** means the value was read on a rendered element. **Declared** means the rule exists in a loaded stylesheet, but its associated transition was not exercised. **Recorded** means DevTools retained an actual effect; it does not mean all occurrences have the same elapsed duration.

| Element / effect | Exact duration and delay | Easing | Authority | Phase assignment |
| --- | --- | --- | --- | --- |
| Task checkbox background, text, border and opacity | Each 50 ms; no delay | `ease` | Computed and declared | UI 2: card feedback |
| Task-card opacity | 200 ms; no delay | `ease` | Computed and declared | UI 2: card feedback |
| Add-task label/icon, shortcut hint and sort-button opacity | 200 ms; no delay | `ease` | Computed and declared | UI 2: contextual controls |
| Day-plan button background and shadow | Each 240 ms; no delay | `ease` | Computed | UI 2 where the corresponding control exists |
| Sidebar/navigation toggle opacity | 200 ms; no delay | `ease` | Computed and recorded; see spans below | UI 3: navigation and panels |
| Navigation icon transform | 300 ms; no delay | `ease-in-out` | Computed and declared | UI 3: navigation feedback |
| Right workspace `margin-right` | 300 ms; no delay | `ease` | Computed; the triggering layout action is not yet established | UI 3 after trigger verification |
| Dropdown action background, text and border | Each 150 ms; no delay | `ease` | Declared | UI 2 after checking the matching action control |
| Quick-add pill-control opacity | 150 ms; no delay | `cubic-bezier(0.23,1,0.32,1)` | Declared; current visible composer used other button classes | UI 2 only if the corresponding pill control is implemented |
| Task fade entry / exit hooks | Entry 300 ms; exit 100 ms; no delay | `ease-in` | Declared, not exercised on user tasks | UI 2 only after controlled reference verification |
| Task timing-row enter/exit hooks | Height 50 ms; opacity 50 ms after a 50 ms delay | `ease` | Declared | Corresponding task-row work after reference verification |
| Task row accordion enter/exit hooks | Height 200 ms; opacity 200 ms after a 200 ms delay | `ease` | Declared | Corresponding expansion UI after reference verification |
| Focus calendar opacity | 300 ms; no delay | `ease-in` | Declared; Focus was not opened on a private task | UI 4 after live/demo verification |
| Editor formatting-tooltip opacity | 200 ms | CSS default easing | Declared in an inline stylesheet | Corresponding editor feature; no generic tooltip-delay claim |
| Special `modal-fade-in` enter/appear hooks | Opacity 500 ms after a 500 ms delay | `ease-in` | Declared; no current task-editor association established | Hold until its actual surface is identified |
| Visible quick-add overlay and inspected legacy buttons | Computed transition duration 0 ms; no CSS animation | Not applicable to a zero-duration transition | Computed; opening produced no recorded CSS/Web Animations group | UI 2 reference observation, not proof of universally instant opening |

Selectors and raw values are in [the motion-rule evidence](evidence/sunsama-motion-rules.json) and [the computed-style evidence](evidence/sunsama-motion-computed.json). The quick-add observation is in [composer evidence](evidence/sunsama-composer-motion.json). Do not apply a rule to a different component simply because its duration looks plausible. In particular, the special delayed modal fade must not become a default for every popup/editor.

The two staged row declarations describe property schedules: their opacity transition ends 100 ms or 400 ms after activation respectively if allowed to run to completion. They do not establish the total time for mounting, saving, changing list position or removing a component.

## Recorded effect and why one duration is not universal

The Animations panel displayed **200 ms** and **184 ms** spans for two opacity previews belonging to `.navigation-dropdown-menu-navigation-panel-toggle-btn`. Both previews and the effect identity were inspected; the panel text is retained in [recorder evidence](evidence/sunsama-motion-recorder.txt). The declared/computed duration is 200 ms. The observed 184 ms span is not a new fixed design constant.

Interrupted/reversed CSS transitions can shorten their effective duration under the [CSS Transitions specification](https://www.w3.org/TR/css-transitions/#reversing). That is a possible explanation, not a demonstrated cause of this particular shorter preview. Repeat controlled cycles are needed to establish trigger-to-effect correspondence. Main-thread delays, rendering cadence and screenshot sampling are different measurements from CSS duration.

The recorder's lack of an opening group for the filter or composer proves only that no supported effect group was retained during those checks. [Chrome's animation inspection documentation](https://developer.chrome.com/docs/devtools/css/animations) describes the supported inspection surface; arbitrary JavaScript/timer-driven motion requires separate observation. No zero-duration claim is made for every animation those surfaces could use.

## Evidence still needed for full interaction certainty

These remain **unverified** rather than assigned guessed values:

- Current task-editor entrance/exit, backdrop, shape and nested action/time/date menus.
- JavaScript-driven drag reflow, settling, cancellation, edge auto-scroll, board inertia and distance-dependent movement.
- Completion/removal/reinsertion and Undo choreography, including list and progress changes.
- Full sidebar and utility-panel movement, tooltip appearance delay and focus transitions, including the actual trigger for the 300 ms margin rule.
- Normal-motion versus reduced-motion behavior, rapid reversals, and interrupted transitions across screens and window sizes.

A current recording can establish frame-bounded visible durations, but it cannot by itself reveal an exact easing function or hidden JavaScript configuration. Full certainty needs the matching runtime/source definition plus repeatable controlled behavior. A disposable demo/workspace is needed for data-changing actions; private task records are not test fixtures.

The earlier local board recording could not be located for a fresh timing analysis. Its behavioral notes remain valid prior evidence, but no milliseconds are inferred from those notes. The older public task walkthrough is also not used as a timing source for the current app.

## Implementation and acceptance placement

1. **UI 2 — task editing and quick actions:** include the verified card/checkbox/context-control motion, then verify each new editor/popup's component-specific timing before applying it. Preserve draft/error states, focus and post-drag click suppression. Do not replace every interaction with one generic fade.
2. **UI 3 — finding and organizing work:** apply verified navigation feedback and validate the actual panel/width triggers before adopting their loaded duration. Keep the selected day and board position continuous.
3. **UI 4 — keyboard navigation and focused work:** verify the actual Focus transition and palette behavior using a disposable reference; match confirmed effects while preserving timer/recovery contracts.
4. **UI 5 — motion parity acceptance:** compare repeatable normal-motion and reduced-motion runs, opening and closing, hover/focus, delayed properties, rapid reversal, cancellation, failed writes, small windows and drag/keyboard behavior. Verify declared values separately from elapsed/rendered spans. Report unmatched behaviors explicitly before packaging.

No application code, dependencies, database, security controls or packaged releases were changed during this timing investigation. Evidence extraction and phase planning do not mark UI Phases 2–5 implemented.
