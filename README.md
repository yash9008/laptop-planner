# Laptop Planner

An offline personal planner for Apple Silicon Macs. Tasks, a seven-day board, projects/backlog, fixed events, recurring tasks, deadlines and a focus timer with a macOS menu bar display. No accounts, cloud, sync or runtime network calls. Original branding; Sunsama was used only as a visual/behavior reference.

## Use the app

Open `release/Laptop-Planner-0.1.0-arm64.dmg` and drag **Laptop Planner** to Applications. The packaged app includes its runtime; Node and a terminal are not needed to use it. The unpacked app is also at `release/mac-arm64/Laptop Planner.app`.

Start a focus session to show elapsed time in the menu bar; click it to pause/resume. Closing the last window or quitting saves and pauses focus. Restarting and waking from sleep require explicit resume.

**Settings** changes daily planning hours and time zone. Defaults are 6 AM–10 PM. A time-zone change pauses focus and preserves task/event dates and real elapsed durations. End time 00:00 means the end of the day.

**Create backup** writes a complete local SQLite file, including settings, tasks, projects, events, recurrence identities, deleted records and focus history. **Restore backup** validates a separate copy, asks for confirmation and keeps a safety copy of the previous planner. Restored timers remain paused. Restore is also available when the live database cannot open. Back up before deleting or moving the app's data folder.

Data lives at `~/Library/Application Support/Laptop Planner/planner.sqlite`. Safety copies are in its `Backups` folder. Save failures keep form entries and previous saved data; fix the storage issue and retry. Retrying a creation cannot duplicate an already committed save.

See [user guide](docs/user-guide.md), [UI behavior](docs/ui-reference.md), and [verification and limitations](docs/acceptance.md).

## Develop and verify

Requires Apple Silicon macOS and Node 24.22.1+.

```sh
npm ci
npm start
npm run check
npm run package:mac
npm run verify:package
```

`npm start` builds and opens Electron from local files, with no localhost server. `check` type-checks and runs scheduler, SQLite and real Electron interaction tests. `package:mac` builds the arm64 app and DMG without publishing. Dependency installation and packaging-tool acquisition can require Internet access; the app itself blocks networking. `verify:package` launches the packaged app under a disposable home and tests offline operation, the 4h30m and split-block examples, SQLite writes, backup/restore and restart persistence. Test fixtures never use personal planner or Sunsama data.

The scheduler remains a pure TypeScript module in `src/scheduler`. SQLite uses **better-sqlite3 13** in the main process, with its Apple Silicon Node-API binary unpacked from ASAR. The renderer is sandboxed and receives only typed operations through an isolated preload.

All six phases are implemented. The app is locally ad-hoc signed; Developer ID signing and Apple notarization are not configured. Physical sleep/wake, hardware power loss and another Mac have not been tested; native power events and process-kill recovery are covered by tests.
