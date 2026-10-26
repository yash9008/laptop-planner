# Sunsama interaction audit — October 26, 2026

Follow-up: [the current synthetic-task reference pass](phase2-reference-pass.md) establishes current editor presentation and specific quick-add/menu behaviors that were still unknown in this initial audit. It also compares selected computed styles under normal and reduced motion. Earlier limitations below describe the initial audit; the follow-up does not establish every animation or hidden state.

This audit is preparation for UI Phase 2, not its implementation. Matching visible elements is only part of matching the experience. Each control needs a trigger, intermediate state, result, dismissal/cancellation rule, keyboard behavior, and response to persistence failures. Motion connects those states.

## Evidence and limits

Four kinds of evidence are kept separate:

- **Live:** controls exercised in the user's Sunsama Mac app on October 26, without submitting tasks or changing settings. This includes the filter, date picker, and empty task composer. The Board view menu was also inspected earlier in this chat on October 26.
- **Recording:** the previously documented October 25 user-supplied board recording, summarized in [ui-reference.md](ui-reference.md). That is prior evidence, not a fresh frame analysis in this audit.
- **Public video:** sampled frames from the vendor-linked [task walkthrough](https://www.loom.com/share/95c8e2b9a03b4a40a7aa835f93947a99), reached through the official task guide. It shows an older-looking light interface; it does not establish the current Mac app's exact geometry or motion. Samples include the board around 0:20, a calendar event popover around 0:50, an editor/action-menu state around 1:25, and subtasks/notes around 2:58. These are approximate video positions, not animation measurements.
- **Guide:** current official documentation of functional behavior. A documented action is not proof of its exact animation, duration, or focus management.

One current native board screenshot was usable. Later native captures were mostly white; reselecting the window did not resolve that reliably. The initial successful frame establishes appearance only. It does not establish a hover transition's trigger, duration, or easing.

During live inspection, the previously empty composer changed to contain a draft that the agent had not entered. Live actions stopped immediately, leaving that draft untouched. The agent did not type task content, submit a task, change a timer, complete/delete/move a task, or alter settings. Private records are not copied into this document or used as fixtures.

This is a bounded audit of **18 interaction families**, not a claim that every Sunsama screen, animation, hidden state, or integration has been observed. A subsequent [timing investigation](motion-timings.md) established exact computed/declared values for a defined subset using the live app's Developer Tools and recorded an opacity effect. Tooltip delays, scroll inertia, JavaScript motion and the remaining listed interaction gaps are still unverified.

## Interaction map

| # | Interaction | Evidence about Sunsama | Current clone and implication |
| --- | --- | --- | --- |
| 1 | Card hover / keyboard highlight | Live frame shows one outlined card with additional controls while neighboring cards are quieter. The older video also shows contextual card actions. Hover trigger/timing was not independently exercised. | Hover and focus-within reveal controls. Preserve card geometry during reveal; verify that all mouse actions have a keyboard equivalent. |
| 2 | Click versus drag | Prior recording establishes dragging from the card body/title and moving neighboring cards. It does not establish every click threshold. | Whole-card native dragging, excluded controls, insertion preview, cancellation and click suppression are already implemented. Preserve them when adding menus/editors. |
| 3 | Quick add | Live `A` opens a compact composer with a description entry, date, time and category controls. Accessibility focus moves into the description. The date reflects the selected day, including a past day. | `A` opens the full creation form. Separate rapid capture from detailed editing; keep the selected-day default. Submission/cancel behavior still needs its own verified contract. |
| 4 | Creation shortcuts | [Creating Tasks](https://help.sunsama.com/docs/usage-guides/tasks/creating-tasks/) documents inline directives for date, duration and classification, and separate create versus create-and-open actions. | The form has separate fields. Add shortcuts only as explicit future scope, with normal typing protected and no AI/network dependency. |
| 5 | Task details | Public video shows a tall centered editor over a dimmed board, with small menus inside it. Current live task details were not opened. | Earlier Phase 2 wording proposed a drawer. That was a design proposal, not a verified Sunsama match. Presentation should be validated against a current reference before implementation. |
| 6 | Notes and subtasks | Public video shows notes and multiple subtasks within task details. [Task basics](https://help.sunsama.com/docs/getting-started/basics/task-basics/) documents separate subtask completion and timing. | Plain notes exist; subtasks do not. Do not display inert checklist controls or imply that subtask storage/timers already exist. |
| 7 | Duration quick edit | [Planned and Actual Times](https://help.sunsama.com/docs/usage-guides/tasks/planned-and-actual-times/) documents direct time entry and timer controls. [Timeboxing](https://help.sunsama.com/docs/usage-guides/timeboxing/timeboxing-how-to-timebox/) describes the working-session popover for scheduled work. | Clicking duration opens the entire task editor. A small estimate popover can use existing saves; actual-time entry and working-session editing require separate feature work. Live popup geometry and dismissal remain unverified. |
| 8 | Contextual actions | The public editor frame shows a separate actions menu. [Command Palette](https://help.sunsama.com/docs/usage-guides/keyboard-driven-actions/command-palette/) documents commands that depend on the highlighted task and current view, including disabled actions. | No task action menu or command palette exists. Bind actions to a stable task ID and keep ordinary clicks, dragging, and menu selection distinct. |
| 9 | Date navigation | Live date-button click opens a month grid with day navigation and shortcut hints. Escape produced no accessibility-tree change in that observed state; clicking the trigger again closed it. | The clone uses a native date input and date arrows. An anchored picker would be a closer interaction. Do not generalize the single Escape observation into a universal intended rule. |
| 10 | Filtering | Live filter click opens a category-selection popup with a search field. Escape closed it. No category was selected or changed. | The clone inserts a text-filter row into the workspace. An anchored chooser would avoid shifting the whole board; project/status choices should remain presentation-only. |
| 11 | Choosing views | Earlier live inspection found Board plus one-day, three-day, weekdays, week and month calendar choices. Escape did not close that menu; the trigger did. | Board and Day buttons exist. Additional calendar modes are separate work. Do not add choices that lead nowhere merely to resemble the menu. |
| 12 | Side panels and sidebar reveal | [Workspace Navigation](https://help.sunsama.com/docs/usage-guides/workspace-navigation/) documents calendar/task panels, utility views, sidebar collapse and edge reveal. Their exact travel and durations are not verified. | Calendar toggle and sidebar collapse exist; Backlog currently replaces the main view. Future utility panels should preserve the selected day and board scroll position. |
| 13 | Board panning / calendar following | Prior recording establishes right-drag panning and selection based on the nearest dated column at the left edge, independently of hover. | Implemented with wheel, keyboard and empty-space drag support. Preserve this separation while panels and popovers are added. Current Sunsama inertia is unmeasured. |
| 14 | Drag preview / reflow / landing | Prior recording establishes a lifted full-size card, dim insertion slot, shifting neighbors, drop and cancellation. | These already exist. The clone's known 170/180 ms values below are its own values, not measured Sunsama constants. |
| 15 | Calendar timeboxing | The official [timeboxing guide](https://help.sunsama.com/docs/usage-guides/timeboxing/timeboxing-how-to-timebox/) documents dropping tasks at times, changing session duration and moving sessions. | Fixed events can move/resize; task blocks cannot. A visual preview must remain separate from the committed schedule. Task timeboxing belongs to a later scheduler feature phase. |
| 16 | Completion / deletion / undo | [Keyboard Shortcuts](https://help.sunsama.com/docs/usage-guides/keyboard-driven-actions/keyboard-shortcuts/) documents task completion and deletion actions. The live account was not used to test their transitions. | These actions work and deletion has Undo. Checkmark animation, card movement, progress changes and failure rollback need an explicit sequence; no specific Sunsama celebration or removal animation is claimed. |
| 17 | Focus and timer transitions | [Focus Mode](https://help.sunsama.com/docs/usage-guides/focus-mode/) documents a single-task view, task navigation, completion advancing selection, and optional entry when starting a timer. | Timer persistence is implemented, but Focus still renders the day's list. Future visual transitions must leave UTC timing and explicit recovery/resume behavior intact. |
| 18 | Guided rituals, loading and errors | Rituals are documented and visible as navigation entries; complete flows and failure animations were not exercised. Network-dependent loading cannot establish local save behavior. | Treat rituals as later features. Keep existing drafts, atomic writes and useful errors; loading/saving indicators must reflect real work. Do not copy automatic rollover into this app. |

## What the clone actually animates today

These values come from the clone's source, not Sunsama:

| Motion | Current implementation | Source |
| --- | --- | --- |
| Button/card surface changes | 120 ms transitions for background, border color and opacity when reduced motion is not requested; CSS default easing | `src/renderer/styles.css` |
| Neighboring drag rows | 170 ms vertical transform using `cubic-bezier(.2,.8,.2,1)` | `src/renderer/components/BoardDrag.tsx`, `MotionSlot` |
| Drag landing / return | 180 ms transform and opacity using the same curve; waits for the associated save to settle | `src/renderer/components/BoardDrag.tsx`, settling layout effect |
| Keyboard board panning | Browser smooth scrolling, or instant scrolling with reduced motion; no custom fixed duration | `src/renderer/components/PlanningBoard.tsx` |
| Pointer resizing | Direct tracking; no artificial lag behind the pointer | `src/renderer/components/CalendarDock.tsx` |
| Editor/filter/sidebar/view changes | No authored entrance/exit or width transition. Native controls can have platform behavior. | `Modal.tsx`, `App.tsx`, `styles.css` |

Consequently, adding a fade to every element would not fix interaction fidelity. Missing local popovers, contextual keyboard targeting, panel continuity and editor behavior are larger gaps than adding decorative motion.

## Recommended contract for the next UI work

The following is a proposal for Laptop Planner, not a claim about undocumented Sunsama behavior:

1. **Define the states first.** Every new surface specifies idle, hover/focus, open, editing, saving, error and closing where applicable. Specify which states are transient and which are persisted.
2. **Preserve the user's place.** Opening/closing a task or utility panel retains board scroll and the selected date. Returning focus to the triggering card must not scroll it into an unrelated position.
3. **Separate quick and detailed actions.** Task title opens details, duration opens a small time editor, the actions button opens a menu, completion toggles completion, and dragging never accidentally opens details afterward.
4. **Handle nested overlays deliberately.** A child popup closes before its parent. Outside-click, Escape, the close button and trigger toggling have explicit rules. Pending writes and failed drafts must not be silently discarded. Decide these rules rather than copying an apparent Escape inconsistency.
5. **Keep movement responsive.** Card drag images and resize handles follow input directly. Reflow and landing may ease into position. Repeated actions replace/cancel obsolete transitions instead of queuing them.
6. **Treat motion as interruptible.** Rapid open/close, switching the selected task, resizing the window, a failed save or navigating away must leave one coherent state. Do not let an old animation callback act on a newly selected task.
7. **Use restrained motion only where it clarifies a change.** Candidate surfaces are popup opacity/position, editor entry/exit, panel width and progress changes. Exact values are to be tuned after current recording evidence; this audit does not prescribe pretend Sunsama timings.
8. **Keep reduced motion complete.** Remove travel and fades where requested, while retaining immediate feedback, keyboard focus, insertion visibility and cancellation. Do not rely on an animation finishing to unlock an essential action.

## Phase 2 recommendation and acceptance cases

Keep Phase 2 focused on a quick-add composer, a task-detail editor whose presentation is verified before implementation, an estimate popover and a task action menu. Subtasks, manual time logs, manual timeboxing and rituals remain separate feature work. Neither a drawer nor a centered editor should be represented as the current Sunsama design without matching evidence.

For every implemented interaction, validate: pointer and keyboard entry; the correct target/date; keyboard focus inside and after closing; nested Escape/outside-click behavior; no post-drag click; rapid switching; selected-day/scroll retention; small windows; reduced motion; saving/error states; and restart persistence only where intended. Use disposable planner fixtures.

The remaining motion evidence should be a short current recording of task hover/open/close, quick add and cancel, duration editing, nested action/date/category menus, a panel toggle, completion/undo and a calendar gesture using disposable examples. A dedicated demo/sandbox is preferable to editing the user's real Sunsama records. This is a request for reference evidence, not authorization to create or change account data.

Exact values for the verified subset and their phase assignments are now in [motion-timings.md](motion-timings.md). Remaining curves/durations, spring characteristics, tooltip delays, auto-scroll speed curves, current editor geometry, draft-close policy, focus restoration and timer-entry preferences remain open verification items. Public documentation can establish actions but cannot settle those details by itself.
