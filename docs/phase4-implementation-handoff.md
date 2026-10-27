# UI Phase 4 Implementation Handoff — Keyboard Navigation and Focused Work

This document records the state, shortcut ownership, implementation details, and verification evidence for **UI Phase 4**.

## State and Ownership Architecture

| Surface / State | Owning Entity | Focus Origin / Restoration Target | Escape / Dismissal Precedence |
| --- | --- | --- | --- |
| **Command Palette** (`commandPaletteOpen`) | Renderer state (`App.tsx`) | Captured invoking control (toolbar button, task card, panel element) | Level 3: Closes palette and restores captured invoking control. |
| **Keyboard Shortcuts Help** (`keyboardHelpOpen`) | Renderer state (`App.tsx`) | Command palette trigger or invoking control | Level 3: Closes help dialog and returns focus to palette trigger or previous control. |
| **Task Selection** (`selectedTaskId`) | Ephemeral renderer state | Set by clicking/selecting a card or title; reconciled upon task deletion | Not a modal; does not intercept Escape. |
| **Single-Task Focus Screen** (`view === 'focus'`) | View state (`App.tsx` + `FocusScreen`) | Retains `previousView`, board scroll, date, panel, search and calendar width | Level 6: When no modal, popup, or palette is active, Escape exits Focus to `previousView`. |
| **Task Editor / Composer** (`activeEditorMode`) | Modal layer (`TaskEditor`, `QuickAddComposer`) | Captured task origin or creation trigger | Level 2: Closes editor/composer, preserving drafts by context/ID. |
| **Popovers / Menus** (`activeEstimatePopover`, `activeTaskMenu`, `filterOpen`) | Child overlay layer | Originating card element (badge, dots, filter button) | Level 1 (innermost): Closes only the child overlay without closing underlying view or editor. |
| **Utility Panels** (`activeUtilityPanel`) | Side panel rail (`search`, `backlog`, `recovery`) | Rail toggle button | Level 5: Can be closed via Escape or panel close button; restores rail trigger. |

## Shortcut Ownership Table

| Shortcut | Context / Guard Conditions | Action | Behavior Notes |
| --- | --- | --- | --- |
| **Cmd+K** (`⌘K` / `Ctrl+K`) | Ignored during input typing, IME composition, active modal/editor, popover, drag, or pending write. If palette already open, toggles (closes) it. | Toggle Command Palette | Traps Tab/Shift+Tab inside palette. Up/Down navigates results. Enter executes. |
| **A** | Bare key. Ignored in inputs, textareas, selects, contenteditable, IME, modals, popovers, drag, or busy state. | Quick-add task | Opens `QuickAddComposer` for the current view/date context. |
| **F** | Bare key. Ignored in inputs, textareas, selects, contenteditable, IME, modals, popovers, drag, or busy state. | Enter Focus screen | Opens single-task Focus screen for active focus task, selected task, or first incomplete today task. |
| **/** | Bare key. Ignored in inputs, textareas, selects, contenteditable, IME, modals, popovers, drag, or busy state. | Open Search panel | Opens Search side panel and focuses the query input. |
| **Escape** | Follows strict innermost precedence. | Innermost dismissal | 1. Child popover/menu → 2. Modal/editor → 3. Palette/Help → 4. Focus screen exit. |
| **ArrowUp / ArrowDown** | When Command Palette is open. | Move selection in palette | Cycles through enabled command list items. Skips disabled headers or items if desired. |
| **Enter** | When Command Palette is open. | Execute selected command | Executes the active command, closes palette, transfers focus to target surface. |
| **Tab / Shift+Tab** | When Command Palette is open. | Focus containment trap | Keeps focus cycling inside dialog between input and action list. |

## Key Implementation Highlights

1. **Accessible Command Palette (`CommandPalette.tsx`)**:
   - Accessible dialog role and name (`role="dialog"`, `aria-label="Command palette"`, `aria-modal="true"`).
   - Combobox query input with initial focus.
   - Deterministic categories: Task-specific commands, Navigation, Actions, Panels, and Settings.
   - Labelled target tasks in commands (e.g. `Edit task: "Title"`, `Pause focus: "Title"`).
   - Disabled command explanations (e.g. `Completed task cannot be focused`, `Assign this task to today to focus`).
   - Enter skips execution of disabled items.
   - Up/Down navigation, Escape dismissal, backdrop click dismissal, Tab focus containment trap, and Cmd+K toggle.
   - Viewport bounded with internal scrolling for wide (1440x900) and narrow (860x680) displays.

2. **Keyboard Actions & Task Context (`App.tsx`, `KeyboardHelpDialog.tsx`)**:
   - Ephemeral `selectedTaskId` set via intentional card selection or keyboard focus, reconciled against committed tasks.
   - Consolidated keyboard event handler with strict input/contenteditable/IME/modal guards for bare keys (`A`, `F`, `/`).
   - `KeyboardHelpDialog` reachable from Command Palette displaying shortcut reference.

3. **Single-Task Focus Screen (`FocusScreen.tsx`)**:
   - One task presented at a time with context tags (date, project, deadline, recurrence), title, notes, planned duration, and authoritative elapsed time (`data-testid="focus-elapsed"`).
   - Deterministic selection: active/paused timer task → selected task → today's first incomplete task → empty state.
   - Explicit controls: Start/Resume/Pause focus, Complete/Reopen, Edit task, Exit Focus.
   - Navigation between eligible tasks without auto-starting or mutating any timer.
   - Full preservation of workspace state (view, board date/scroll, filters, Search query, and calendar preferences) on entry/exit.
   - Clean empty state when no tasks are scheduled/incomplete.

4. **Motion & Reduced Motion (`styles.css`)**:
   - Zero-duration transition for overlays under normal and reduced motion.
   - Focus calendar opacity transition (300ms ease-in) under normal motion; suppressed to `none` under `prefers-reduced-motion: reduce`.
