# Acceptance and release verification

Final source checks: **78 scheduler tests per time zone (two zones), 63 database tests, 48 Electron interaction tests**.

## Coverage

| Area | Evidence |
| --- | --- |
| Pure scheduler and no runtime dependencies | Standalone Node/browser build; scheduler suite in Asia/Kolkata and America/New_York, including 500 generated days per zone |
| Four tasks totaling 4h30m | Scheduler fixture and packaged arm64 app: 270 planned minutes |
| 1–2 PM / 4–5 PM split around 2–4 PM | Scheduler, real Electron fixed-event test, and packaged arm64 app: [780,840], [960,1020] |
| Priority, task splitting, capacity, unscheduled minutes, immutable inputs | Scheduler and SQLite tests; renderer task-order/overflow checks |
| CRUD, completed history, events, projects, backlog, deadlines | Database and real Electron tests, including restart and task/event drag/resize |
| Recorded drag animation and board/calendar following | Real native-drag Electron tests for insertion, ordering, cancellation, failed drop, edge scrolling, right/left panning, wheel/keyboard and nearest-left-column selection |
| Recurrences and midnight correctness | Unique occurrence identity, deleted/moved occurrence behavior, weekday selection and restart/midnight tests |
| Focus, actual/planned time, overrun and recovery | UTC duration/DST tests, native suspend/resume events, clean quit/restart and actual SIGKILL recovery |
| macOS menu bar timer | Native Tray/Menu tests for background updates, pause/resume, task switch/edit/delete, sleep, restart, midnight and failed pause |
| Settings | Validated daily hours/time zones, atomic reflow and rollback, persisted UI settings, time-zone pause, no recurrence-range growth |
| Backup/restore | Online SQLite backup includes WAL; old schemas migrate on a copy; schema/checksum/integrity/foreign-key validation; corrupt/foreign/newer/altered files refused; safety copies; paused restored timers; unreadable live database recovery |
| Save failures | SQLite-trigger fault injection preserves drafts and committed data; retry succeeds; quiet refresh does not hide errors; creation IDs prevent duplicates after lost acknowledgement |
| Isolation and offline operation | Sandboxed renderer, no Node/raw IPC, trusted sender checks, blocked new windows/navigation, denied permissions, renderer and native network rejection |
| Apple Silicon distribution | Ad-hoc signed arm64 app and DMG; packaged smoke tests use native SQLite and an isolated home; restart, backup/restore and offline checks |

## Reproduce

```sh
npm run check
npm run package:mac
npm run verify:package
```

`release/verification/` contains JSON reports and screenshots from packaged-app checks. The final release also has a DMG-mounted app check, signature verification and SHA-256 checksums.

## Limits and unfinished work

No requested Phase 6 feature is intentionally deferred. These checks have not been performed: physical hardware sleep/wake or power loss, another Mac, and an Internet-downloaded/quarantined copy. Sleep/wake is tested through Electron's native power event handlers; abrupt process termination is tested with SIGKILL. Network blocking is tested in the application, without disconnecting the user's Mac.

The app is locally ad-hoc signed. The DMG is unsigned and its checksum is verified. Apple Developer ID signing and notarization require a developer identity and were not configured. No account, cloud service, telemetry or updater was added.

Backup replacement uses an atomically renamed, validated SQLite file and retains a safety copy. A safety copy of an unreadable database preserves its raw database/WAL/SHM files for recovery or inspection; it does not repair corruption in those original files. User-selected backup destinations may be managed by other software; Laptop Planner itself does not sync them.
