# Working on Laptop Planner

## Product and stack

Laptop Planner is an offline personal planner for Apple Silicon macOS. The existing codebase implements all six planned phases. Sunsama is a layout/behavior reference only; this app has its own branding and database.

Versions below come from `package.json`; use that file and the lockfile as the authority when they change.

| Component | Current stack |
| --- | --- |
| Development runtime | Node.js >=24.22.1, npm |
| Desktop shell | Electron 45.0.0 |
| Renderer | React / React DOM 19.3.1, TypeScript 7.0.2 |
| Build | Vite 8.3.5 for the renderer; esbuild 0.28.2 for main/preload |
| Storage | better-sqlite3 13.0.3, main process only; schema version 4 |
| Tests | Node test runner for scheduler/database; Playwright 1.64.1 for real Electron |
| Packaging | electron-builder 26.18.0; arm64 `.app` and DMG |

## Run, test and package

Run commands from the repository root. The workspace path contains spaces; quote it in shell commands.

```sh
npm ci
npm start
```

`npm ci` installs dependencies, installs Electron, and verifies SQLite in Electron's actual runtime. Dependency installation and packaging-tool acquisition may need Internet access. The running app must remain offline.

`npm start` builds and launches from local files. `npm run dev` does the same; there is no localhost development server or hot reload. Close and relaunch after edits.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript check without emitting files |
| `npm run build` | Rebuild `out/` and copy the menu bar icon |
| `npm run demo:scheduler` | In-memory 4h30m and split-block examples |
| `npm run test:scheduler` | Check the pure-module boundary and run scheduler tests in two time zones |
| `npm run test:db` | Bundle database tests and run them under Electron's native runtime |
| `npm run test:app` | Run Electron interaction tests; build first |
| `npm run check` | Type-check, build, scheduler tests, database tests and app tests |
| `npm run package:mac` | Build the arm64 app and DMG without publishing |
| `npm run verify:package` | Exercise the packaged app under a disposable home |

For a focused UI check, build first, then use e.g. `npm run test:app -- phase6.spec.ts`. UI tests use one worker. Avoid concurrent builds or UI suites that replace the same `out/` or `test-results/` directories.

### Background testing preference

The user wants to keep using their browser without local test windows or focus
interruptions. Run GUI tests and automated previews on GitHub's hosted macOS
runner by default. Do not launch local Electron UI suites, previews, or packaged
verification unless the user explicitly requests local execution. Type checks,
builds, scheduler tests, and database tests may still run locally without GUI
windows. This preference changes where validation runs, not which checks are
required.

The public repository uses `.github/workflows/check.yml` for the complete
`npm run check` command. Push the intended source revision, wait for that exact
commit's push-triggered **Planner checks** run and its **Full checks on Apple
Silicon macOS** job, inspect failures, and report the run URL and commit.
The optional manual board-wheel diagnostic does not replace the full suite.
Do not describe skipped, cancelled, timed-out, or pending checks as
passing. If hosted execution is unavailable, report the blocker instead of
silently falling back to local GUI tests. See [docs/github-actions.md](docs/github-actions.md).

Packaging outputs:

- `release/mac-arm64/Laptop Planner.app`
- `release/Laptop-Planner-<version>-arm64.dmg`
- `release/verification/` for packaged verification reports/screenshots

The packager reuses `node_modules/electron/dist`, retains the darwin-arm64 SQLite prebuild, unpacks native `.node` files from ASAR, and skips native rebuilding. The app is ad-hoc signed with hardened runtime. Developer ID signing and notarization are not configured; the DMG is unsigned. Do not represent local verification as notarization or verification on other Macs.

## Folder structure

```text
src/
  scheduler/               Pure scheduling engine, time helpers and types
  shared/                  Typed IPC contracts and shared input/format helpers
  main/
    index.ts               App lifecycle, trusted IPC, offline session, native dialogs
    local-clock.ts         Saved-time-zone adapter
    focus-menu-bar.ts      Native macOS Tray/Menu presentation
    assets/                Menu bar template icon
    storage/
      database.ts          SQLite setup and saved settings
      migrations.ts        Ordered, checksummed schema migrations
      planner-repository.ts Task/event/project/settings operations and schedule persistence
      focus-store.ts       UTC sessions, checkpoints and recovery
      recurrence-store.ts  Templates and dated occurrence identity
      backup.ts            Validated local backup and restore
  preload/                 Isolated, typed application bridge
  renderer/                React app, components and styles
scripts/                   Build, native verification, test runners and packaged smoke test
tests/
  scheduler.test.ts        Pure scheduling acceptance and generated cases
  database.test.ts         SQLite/migration/lifecycle/backup tests
  app/                     Real Electron UI and native-menu tests
build-assets/              Original application icon sources and ICNS
docs/                      User guide, scheduler contract, UI references, acceptance notes
out/                       Generated runtime bundles
.test-build/               Generated Node/Electron test bundles
test-results/              Generated test screenshots and failure reports
release/                   Generated app, DMG and release evidence
```

## Rules

1. Keep the app local: no accounts, cloud, sync, telemetry, updater, external integrations, or runtime network calls. Preserve the existing network, navigation, permission and new-window restrictions.
2. Keep `src/scheduler` pure TypeScript, importing only within that directory. Supply clocks/dates explicitly; do not add Electron, React, SQLite, Node, filesystem or implicit wall-clock dependencies there.
3. Keep SQLite and native filesystem operations in the main process. Keep renderer sandboxing, context isolation and Node isolation enabled. Expose only typed application operations through preload; never expose generic SQL, IPC, shell, filesystem or evaluation access. Validate inputs and trusted senders in main.
4. Preserve personal data. Never use the user's planner or Sunsama data as test fixtures. Use temporary databases and controlled clocks. Do not reset, seed, delete or silently replace a personal database to fix an error. Use native file pickers and the explicit restore confirmation for user backups.
5. Preserve atomic saves and recovery: task/order/date/focus/schedule changes must commit together. Keep drafts and useful errors after failed writes. Creation retries must not duplicate committed records. Restore must validate a copy and retain a safety copy before replacing live data.
6. Add new numbered migrations for schema changes; do not rewrite applied migration SQL or its ledger. Refuse newer/mismatched schemas without resetting data. Keep backup validation compatible with any intentional schema changes.
7. Preserve scheduling contracts: active focus work goes first without changing list order; tasks split around fixed events; overflow stays unscheduled on its assigned date; backlog stays unscheduled. Retain completed/actual history. Keep the 270-minute example and 1–2 PM / 4–5 PM split passing.
8. Preserve UTC elapsed time as the focus authority, civil dates as calendar coordinates, and separate recurring occurrence identity. Never invent sleeping/closed/interrupted time, auto-resume a recovered timer, or move work into tomorrow automatically.
9. Sunsama may inform authorized visual/behavior inspection; do not copy branding or read/change/import its user data. Preserve the implemented whole-card drag, insertion preview, cancellation, atomic drop and nearest-left-column calendar following when changing the board.
10. Edit source rather than generated bundles/releases. Run checks appropriate to the change. For feature phases, run the app, fix errors, report exact run commands and visible results, and wait for the user's continuation before starting another phase unless they authorize otherwise. Explain proposed departures from the agreed plan first.
11. Documentation-only requests do not authorize code, dependency, database or package changes. Backlog entries are ideas, not permission to implement them.

## Data and testing notes

Personal storage: `~/Library/Application Support/Laptop Planner/planner.sqlite`; SQLite WAL/SHM sidecars may exist while open. Local backups default to the sibling `Backups` folder.

Development-only test overrides are `LAPTOP_PLANNER_TEST_DATA_DIR` and `LAPTOP_PLANNER_TEST_NOW`. Packaged builds ignore them. The packaged verification script uses its own disposable home and asserts the resulting database path before writing fixtures. Do not add a production test bypass.

Run SQLite tests via the provided Electron runner rather than assuming the system Node ABI. For native fault-injection tests, allow in-flight main-process transactions to finish before changing schema through a separate connection; the tests use `setImmediate` for this. Avoid arbitrary sleeps as a substitute for observable completion.

See [PLAN.md](PLAN.md) for status/backlog, [NOTES.md](NOTES.md) for decisions, and [README.md](README.md) for the user-facing quick start.
