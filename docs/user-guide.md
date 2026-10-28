# Laptop Planner

A personal, offline Mac planner. No accounts, cloud, syncing, external integrations, or runtime network calls. Original branding and a separate database; Sunsama is only a layout/behavior reference.

## Run

Requires Apple Silicon macOS, Node 24.22.1+, and npm.

```sh
npm ci
npm start
```

`npm start` builds with Vite/esbuild and launches Electron from local files. No localhost server or hot-reload connection is used. `npm run dev` is the same command. Close the app, edit, and run again to see changes. Dependency installation downloads packages; the running app blocks network access.

The app opens **Home**, a seven-day board with a docked calendar. Choose **Today** in the sidebar for the focused day list. A neutral charcoal interface follows the observed Sunsama layout, with original Laptop Planner branding. Board workload totals sit in each column's Add task row; the Today view keeps its full daily summary. It starts empty; no example tasks are inserted into your personal database.

- **Add task**: press **A** or use a column's **Add task** row on Home; other views also retain the toolbar button. Enter a title and an estimate such as `45m`, `2h`, or `1h 30m`. A bare number means minutes. Notes are optional.
- Click a task title, duration, or calendar block to edit it. Changes save immediately and replan the day.
- Use a checkbox to complete/reopen a task. Drag its handle or use the up/down arrows to change scheduling priority.
- Delete a task with its trash button; **Undo** restores it. Deletions are retained locally rather than permanently purged.
- Use the date controls to plan another single day. A task's editor can move it to another date. **Daily planner** returns to Today.
- **Won’t fit** shows excess work; the planner never silently moves it into tomorrow.
- **Fixed events**: use the right rail’s **+** button, the Calendars menu, or double-click an empty time slot. Enter a title, start/end dates and times, and optional notes. Click an event to edit/delete it. Drag its top grip to move it or bottom edge to resize it in 15-minute steps; focused handles also accept Up/Down arrow keys. Tasks reflow around saved changes. Overlapping fixed events appear side by side with a warning. Events can span midnight; use the editor to move them to another date.
- **Board / Home**: a horizontally scrolling seven-day board starts on the selected date. Backlog sits after the seven day columns, and the sidebar Backlog item also accepts task drops. Holding a dragged task near either board edge scrolls to other dates. Drag whole task cards or their grips between columns to assign a day or return work to backlog. Click a day’s heading to open its calendar. Use the date control to jump to another week; the Board dropdown switches to the focused day list.
- **Board interactions**: drag a card body, title, or grip to preview an insertion slot; neighboring cards animate into place. Drop to save or press Escape to cancel. Right-drag the board (or left-drag empty space) to pan. Horizontal scrolling works too. The calendar follows the day nearest the board’s left edge; **Today** resets the view.
- **Projects**: use the sidebar’s **+** button to create a project with a color, notes, and optional deadline. Open it to see its tasks or edit project details. New tasks created within a project start in backlog with that project assigned; the task editor can choose another project or day.
- **Backlog**: undated tasks stay off the calendar. Choose a day in the task editor, or drag them to a board day, when you want to schedule them.
- **Deadlines**: task/project dates appear as badges; past dates are marked overdue. Deadlines are reminders and do not override your task order or silently assign a day.
- **Menu bar timer (macOS)**: starting focus shows a clock and elapsed time in the system menu bar. Click it to pause/resume or open the planner. Paused sessions show **Ⅱ**; completing, deleting or moving the focused task away removes the item. It updates while the window is minimized or hidden. Quitting still pauses and saves the timer; reopening restores it paused. Closing the last planner window still quits the app.
- **Recurring tasks**: choose **Daily** or **Selected weekdays** in the task editor. The initial day must be selected in the weekday pattern. Today and the dates being viewed generate their own occurrences; revisiting a date or restarting does not duplicate them. Moving or deleting one occurrence does not recreate it on its original date. Edits apply to that occurrence. **Stop future repeats** removes untouched future occurrences while keeping today, history, completed/worked tasks, and occurrences you moved. Each occurrence has separate completion and actual time; new occurrences do not inherit an old deadline.
- **Focus timer**: press a task’s play button to start. One timer runs at a time; starting another pauses the previous task. The active task’s remaining work schedules first without reordering the list. The focus bar offers **Pause**, **Resume**, and **Complete task**, with actual time beside its estimate. Recorded time appears separately in the calendar and in **Actual today**. Overruns keep counting until you pause or complete.
- **Recovery**: sleep and quit pause the timer. Reopening offers explicit resume and excludes time while closed/asleep. A killed/interrupted process recovers only its last saved checkpoint; checkpoints normally save every second. A missed-sleep gap or backward clock change pauses the timer rather than counting uncertain time. A running timer can cross midnight while keeping yesterday’s task identity; today’s recurring occurrence stays independent. Work is never moved automatically.
- **View controls**: filter by title, notes, or project without changing your schedule. Toggle the calendar from the right rail or **Calendars** menu; its +/− controls change visual zoom. The circular **LP** avatar opens local Settings, and the rail’s bolt opens the command palette. Collapse the sidebar from its bottom button. Press **A** outside a form to add a task.
- **Calendar width**: drag the divider between the board and calendar. Focus the divider and use Left/Right to adjust by 24 pixels, Home for the minimum, or End for the available maximum. Escape cancels an active resize; double-click resets to the responsive default. Your preferred width is remembered on this Mac, with room reserved for the task list at smaller window sizes.
- **Settings** lets you change planning hours and time zone, and create or restore local backups. A time-zone change pauses focus. Local storage in the sidebar shows the database location, schema version, daily hours, and timezone.

Planning hours default to 6 AM–10 PM and can be changed in Settings. Today schedules from now; future dates start at 6 AM. The view refreshes on focus, at local date changes, and every minute; running focus time refreshes each second. Completed historical blocks are retained separately from flexible future blocks; checking a task off does not fabricate actual timer time.

## Try the scheduler (Phase 2)

```sh
npm run demo:scheduler
npm run test:scheduler
```

The demo prints your four tasks totaling **270 minutes (4h30m)**, then a two-hour task split into **1–2 PM / 4–5 PM** around a fixed 2–4 PM event. It uses in-memory examples and does not change the database. Scheduler tests also cover event reflow, overflow, ordering, active-task priority, completed history, midnight, and immutable inputs. They run under two system timezones and include 500 generated-day scenarios per run.

## Verify

```sh
npm run check
```

This type-checks, builds, runs standalone scheduler tests, and verifies migrations, task persistence, atomic task/schedule updates, input parsing, and the local clock in Electron's runtime, Phase 3 data upgrades, events, projects, backlog, and deadlines, recurrence identity, and focus persistence/recovery. It then launches the real app for task workflows, calendar rendering, drag/drop, restart, isolation, network blocking, and storage errors. Focus tests exercise native sleep/resume handlers, a real process kill, clean quit/restart, midnight, elapsed-time precision, and daylight-saving date boundaries. Tests use controlled clocks/power events; this Mac was not physically put to sleep or its system clock changed. Tests use in-memory fixtures or temporary databases, never your personal planner or Sunsama data. Screenshots are saved in `test-results/`, including the daily planner, fixed-event split, board, project view, focus timer, and redesigned wide/laptop layouts. See [UI reference notes](docs/ui-reference.md).

Individual checks: `npm run typecheck`, `npm run build`, `npm run test:scheduler`, `npm run test:db`, `npm run test:app` (build first for the last command).

## Storage and architecture

- Real data: `~/Library/Application Support/Laptop Planner/planner.sqlite` (SQLite WAL sidecars may also exist while open).
- SQLite: **better-sqlite3 13**, in Electron's main process only. It ships an Apple Silicon Node-API prebuild, so source compilation and ABI-specific rebuilding are unnecessary. `postinstall` installs Electron and verifies that the actual Electron runtime can open SQLite. Packaging is configured to use the supplied binary without rebuilding, and to unpack native `.node` files from the application archive.
- Renderer: React + TypeScript, built with Vite. It has no Node access. A sandboxed, isolated preload exposes only typed application operations, never raw SQL or raw IPC.
- Migrations: ordered, checksummed, transactional, and applied once. A newer or mismatched schema is refused without resetting data.
- Schema 4 adds recurrence templates, unique dated occurrences, focus sessions/checkpoints, and current focus state. Schema 3 added fixed events, projects, optional task deadlines, and nullable task dates for backlog. It preserves existing task IDs, notes, completion/deletion state, historical calendar blocks, and settings from Schema 2. Task mutations and their affected schedules commit in one transaction. IPC validates inputs in the main process; the renderer receives structured success/error results.
- The scheduling engine is a pure TypeScript module in `src/scheduler`, independent of Electron, SQLite, and React. It takes an explicit local date/clock and returns a fresh plan with task blocks, conflict indicators, preserved history, and unscheduled minutes. See [scheduler contract](docs/scheduler.md).

