# Scheduling engine contract

`scheduleDay(input)` is exported from `src/scheduler/index.ts`. Its readonly types are in `src/scheduler/types.ts`. It has no runtime imports outside that folder and works in both Node and a browser. The test command verifies the dependency boundary with a standalone browser build.

## Inputs

- `date`: selected local date, `YYYY-MM-DD`.
- `clock`: explicit current local date and minute of day; there is no implicit system clock.
- `hours`: saved daily `startMinute` and `endMinute` (default settings are 360–1320).
- `tasks`: task instances in priority order, including each referenced history task. Each has an ID, title, planned date (or `null` for backlog), positive whole-minute estimate, and completion state.
- `events`: fixed dated start/end intervals. Multi-day events are clipped for display and capacity on the selected date.
- `timeEntries`: closed actual-work intervals. `activeTimer` optionally supplies one running task and its unchanged start time.
- `completedBlocks`: optional historical calendar snapshots for completed tasks. The caller supplies completed portions only, ending no later than the current clock. These are retained unchanged on their original date.

Minutes run from 0 inclusive to 1440 exclusive in date/time inputs; midnight is minute 0 of the next date. A day's output interval may end at 1440. Clock and recorded times support fractional minutes, so elapsed seconds are not rounded away. These are local civil-time coordinates: date/clock conversion belongs in the application adapter, not this pure module.

## Behavior

Remaining work is the estimate minus recorded and active elapsed time, floored at zero; completed tasks have no remaining work. Overlapping recording/checkpoint intervals count once for a task's actual time. The active task schedules first, as explicitly requested, followed by the original list order. Summary rows retain task-list order.

Tasks fill the earliest free gaps, splitting around fixed events. Today starts at the later of now and the day's opening time; future days start at opening time. Past days preserve supplied history and report unfinished work without creating new blocks in the past. Work that does not fit remains unscheduled on that date. Nothing is automatically moved into tomorrow.

Every call returns fresh flexible blocks. Do not feed previous flexible blocks back as history: replanning must be able to move them. Preserve closed time entries and completed snapshots separately. Block IDs are deterministic for an unchanged task/date/interval. Starting or advancing a timer never mutates the supplied timer or history.

`summary` includes estimated workload, remaining work, unique fixed-event time, actual recorded time, available future capacity, scheduled minutes, free minutes, and unscheduled minutes. Overlapping events remain visible and produce pairwise conflict intervals; their occupied capacity counts once. Invalid or inconsistent inputs throw before returning a plan; inputs are never modified.

## Phase boundaries

Phase 2 does not change the UI, database schema, or preload API. Tests use independently dated recurring-task instances and serialized timer snapshots to verify the scheduler's boundary behavior. Recurrence generation, real timer persistence, sleep/quit recovery, timestamp conversion, and midnight app lifecycle behavior are implemented and tested in Phase 5. Task/event CRUD, storage adapters, and rendering are implemented in Phases 3–4.

Phase 3 now calls the engine from the main-process task repository. An `Intl` adapter converts the current clock into the saved timezone, including local midnight. Task changes and their new flexible blocks are persisted atomically; day reads recompute from the supplied clock without writing history. On completion, elapsed portions of the last persisted planned blocks become completed snapshots. They are planned history, not actual-work records. The renderer only displays the returned plan. Fixed events and real time-entry/timer inputs are connected in their later phases.


Phase 5 connects recurring instances, saved UTC focus sessions, and one running timer. The application adapter supplies optional `task.actualMinutes` totals derived from elapsed UTC time so remaining estimates stay correct across clock/DST changes; civil intervals describe calendar placement. The engine still has no clock, SQLite, Electron, or UI dependencies. Recurrence templates materialize today and requested date ranges with unique `(template, original date)` identities. Local date conversion, power events, checkpoints, and restart recovery remain in the main-process adapter.

Focus checkpoints normally save every second. Sleep/quit close the active session; startup closes an interrupted session at its last checkpoint and requires explicit resume. A checkpoint gap over 15 seconds, or a backward wall-clock change, pauses at the last confirmed checkpoint. Midnight splits actual daily totals without changing a task's planned date or associating yesterday's session with today's recurring occurrence.
