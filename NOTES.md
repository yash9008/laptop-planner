# Implementation notes and inferred decisions

These notes describe the current code and tests. Reasons marked as implications are inferred from implementation rather than a separate product specification. Proposed future work belongs in [PLAN.md](PLAN.md).

## Process boundaries and offline operation

The renderer is a presentation client. Electron main owns SQLite, native dialogs, lifecycle handling and the menu bar; preload exposes a frozen, typed application bridge. Main validates both IPC payloads and the renderer sender/frame. Node integration is disabled in the renderer, context isolation and sandboxing are enabled, and generic SQL/filesystem access is not exposed.

The app loads bundled local files instead of a localhost server. Its session rejects non-renderer assets, permissions and external windows/navigation, and enables offline network emulation. Build/install tooling can download dependencies; that does not imply runtime networking is permitted.

Evidence: `src/main/index.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`, `tests/app/foundation.spec.ts`.

## SQLite choice and migration contract

`better-sqlite3` runs in main. Its Node-API darwin-arm64 prebuild is verified under Electron during installation, and database tests use Electron's runtime. Packaging skips rebuilding, excludes other platform prebuilds and unpacks `.node` files from ASAR. This avoids relying on a system-Node native binary; packaged smoke tests verify the resulting app can actually read/write SQLite.

The database enables foreign keys, WAL journaling, FULL synchronous writes and a busy timeout. Schema version 4 contains settings, tasks/calendar blocks, projects/events, recurrence identity and focus sessions/state. Migrations are ordered, checksummed and transactional; newer or mismatched ledgers are refused rather than reset.

Implication: changing previously applied migration text is incompatible with existing databases. Future schema changes also need corresponding backup-structure validation changes.

Evidence: `src/main/storage/database.ts`, `src/main/storage/migrations.ts`, `scripts/verify-native.mjs`, `scripts/test-database.mjs`, `package.json`.

## Scheduling is a pure calculation

`scheduleDay` receives an explicit local clock/date and produces fresh plans without Electron, storage or UI imports. A standalone browser build checks this boundary. The repository adapts persisted data into scheduler inputs and persists flexible blocks in transactions with the associated mutation.

- Active focus work gets first claim on free time without changing the user's task-list order.
- Flexible work fills gaps and splits around fixed events. Overlapping fixed events consume their union for capacity, while conflicts remain visible.
- Today starts no earlier than the current clock/opening time; future days start at opening time. Past days do not receive newly invented future blocks.
- Overflow remains unscheduled on its assigned date. A deadline does not automatically assign a day or override task order. Backlog has no assigned date.
- Completed planned history and recorded actual focus time are distinct. Checking a task complete does not manufacture actual work time.

The 270-minute example and the 13:00–14:00 / 16:00–17:00 split are checked both in scheduler tests and packaged-app verification.

Evidence: `src/scheduler/`, `src/main/storage/planner-repository.ts`, `tests/scheduler.test.ts`, `docs/scheduler.md`, `scripts/verify-packaged.mjs`.

## Real elapsed time and civil calendar time are different

Focus duration comes from UTC millisecond timestamps. Civil date/minute projections are used to place work on the calendar; they are not the elapsed-time authority. Daily actual totals split UTC intervals at local midnight, allowing DST days with a different real duration.

There is one running focus session. Starting a different task pauses the previous one. Checkpoints normally run every second. A backward clock change or checkpoint gap over 15 seconds closes at the last confirmed checkpoint instead of inventing uncertain time. Sleep and quit pause; restart requires explicit resume. A killed process recovers only persisted checkpoints.

A running session may cross midnight while retaining yesterday's task ID. A new recurring occurrence for today remains a separate task. Completing/deleting the focused task or moving it to another date clears focus while retaining recorded history.

The menu bar reads the same persisted focus state using a small query; it is not a second independent timer. Minimized/hidden-window operation is supported. Closing the last window still quits the app, saves and pauses focus. Pomodoro cycles are not implemented.

Evidence: `src/main/storage/focus-store.ts`, `src/main/focus-menu-bar.ts`, main lifecycle handlers, `tests/app/phase5.spec.ts`, `tests/app/menu-bar.spec.ts`.

## Recurrence identity survives moving and deleting occurrences

Templates materialize dated task instances for today and requested view ranges. A unique `(recurrence_id, occurrence_date)` index reserves the original occurrence identity. Moving an occurrence changes its planned date, not that original identity; soft deletion also retains the record, preventing regeneration as a duplicate.

Occurrence edits are local to that instance. Stopping future repeats removes untouched future occurrences but retains worked, completed, moved and historical instances. Settings reflow avoids extending the recurrence range repeatedly as a side effect.

Evidence: `src/main/storage/recurrence-store.ts`, schema 4, recurrence/database tests and `tests/app/phase5.spec.ts`.

## Board dragging and calendar following are separate behaviors

The browser's native drag carries the lifted card. The original source DOM node stays mounted, collapsed, until drag completion; the preview uses a separate insertion slot and animated neighboring rows. This prevents native dragging from being canceled when a card visually changes columns. Reduced-motion preferences disable the list/landing animation.

A drop uses one repository operation/SQLite transaction for date, insertion order, focus changes and schedule reflow. Invalid/canceled drops do not write; failed saves restore the saved list. Completed and incomplete task groups retain their separate ordering.

Horizontal panning changes the selected calendar date according to the dated column whose left edge is nearest the viewport's left edge. Hover alone does not select a date. The board's seven-day anchor is distinct from the calendar selection, so scrolling or saving does not repeatedly reset the board range/position. Calendar totals and task/event creation defaults follow that selection.

Evidence: `src/renderer/components/BoardDrag.tsx`, `PlanningBoard.tsx`, `App.tsx`, `tests/app/board-interactions.spec.ts`, board-move database tests.

## Settings, save failures and creation retries

Daily start/end and time zone are persisted settings, initially 06:00–22:00. End minute 1440 represents the end-of-day midnight; the editor accepts end time 00:00 for that value. End must follow start within one day. A time-zone change pauses focus, preserves task/event civil dates and retains UTC elapsed duration.

Repository writes validate in main and commit related data atomically. Failed saves keep form entries and prior saved state. Quiet refresh does not erase an existing warning. New task/event/project forms reuse a creation ID, so retrying a committed save after a lost response cannot create another entity or duplicate a recurring template.

Evidence: `StorageDialog.tsx`, task/event/project editors, shared contracts, `planner-repository.ts`, `tests/app/phase6.spec.ts`, creation-retry database test.

## Backups are coherent snapshots, not copies of only the live main file

Online SQLite backup includes committed WAL data. Export builds a temporary file, closes any copied running timer at its saved checkpoint, flushes it and publishes by rename; exporting does not pause the live timer. Exported files have restricted permissions.

Restore reads and validates an isolated copy, including migration history, supported schema structure, SQLite integrity, foreign keys and settings/scheduling compatibility. It refuses unsupported database objects. Older supported schemas migrate on the copy, leaving the selected source unchanged. Native dialogs require confirmation before replacing the planner.

For a readable live database, restore pauses focus, makes a safety backup, checkpoints/closes live SQLite and atomically replaces the main file, retaining a rollback link during the swap. Recovery from an unreadable live database preserves its raw database/WAL/SHM files first. Raw preservation does not repair corruption in those original files. Restored timers stay paused.

The maintenance guard serializes backup/restore, blocks concurrent mutations and prevents closing/quitting mid-operation. Normal heartbeat checkpoints/read refreshes continue while native dialogs are open. Safety copies are kept under the planner's `Backups` directory; the UI reports the resulting path.

Evidence: `src/main/storage/backup.ts`, backup IPC handlers, `tests/database.test.ts`, `tests/app/phase6.spec.ts`.

## Tests and release evidence have explicit limits

The recorded release check is 78 scheduler tests per runner time zone, 63 database tests and 48 Electron tests. Those are prior results, not a fresh run for this documentation change. The scheduler runner currently uses **Asia/Kolkata and America/Los_Angeles**. Older verification prose mentions New York; use the runner as the authority for these two configurations.

Tests use temporary databases and controlled clocks. Packaged tests ignore development overrides, launch with a disposable home, assert the database path before writing fixtures, and verify arm64 execution, offline renderer/main behavior, SQLite, the scheduling examples, backup/restore and restart. Reports are in `release/verification/`; the DMG-mounted app was also checked during the release work.

Native power-event tests and SIGKILL recovery are not physical hardware sleep or power-loss tests. Another Mac and a quarantined/downloaded installation have not been verified. The app is ad-hoc signed; the DMG is unsigned with a verified checksum. Developer ID signing and Apple notarization are not configured. These limits should remain visible when describing the release.

Evidence: `scripts/test-scheduler.mjs`, `scripts/test-database.mjs`, `tests/app/`, `scripts/verify-packaged.mjs`, `docs/acceptance.md`, `release/verification/`.
