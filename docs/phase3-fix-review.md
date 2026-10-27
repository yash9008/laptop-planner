# UI Phase 3 fix review — October 27, 2026

**Verdict: the original R1–R5 reproductions are resolved; Phase 3 still needs
three keyboard-focus fixes (R6–R8) before independent acceptance.**

## Revisions and checks

- Reviewed `ui-phase-3` at `f9fd68cf952594cda3563b563ca0fd171ddb9d20`.
- Its exact-commit, push-triggered [Planner checks run](https://github.com/yash9008/laptop-planner/actions/runs/40335015789)
  and **Full checks on Apple Silicon macOS** job passed: type-check/build,
  78 scheduler tests in each of Asia/Kolkata and America/Los_Angeles,
  63 database tests, and 89 Electron tests. The raw job log and final summary
  were inspected, rather than relying solely on the green run badge.
- Independent review branch: `codex/phase3-fix-review`, commit
  `ec08ceab6e1e8ab3d56096f320975cb3895a4baf`. Its only difference from the
  reviewed revision is three additional tests in
  `tests/app/phase3-fix-review.spec.ts`; no application changes or changes to
  existing tests were made.
- The [independent full push run](https://github.com/yash9008/laptop-planner/actions/runs/40450745690)
  failed: **89 Electron tests passed, 3 failed**. All three failures are the
  added probes below. Type-check/build, both scheduler runs, and all 63
  database tests passed. The full job was not cancelled, skipped, or replaced
  with the board-wheel diagnostic.
- GUI tests ran only on GitHub's standard public-repository macOS arm64
  runner, using disposable databases and controlled clocks. No local GUI
  suite, preview, packaged verification, or personal planner database was used.

The checkout is restored to `ui-phase-3`. This review adds documentation and
evidence only; it does not implement fixes or start Phase 4.

## Original findings

| Finding | Observed recheck result |
| --- | --- |
| R1 — Search focus when an edit removes a match | Pass: the no-match case focuses `Search all tasks`; the added remaining-match case also passes. |
| R2 — Backlog insertion and preview | Pass: the live placeholder count is 1 and order is `[Incoming backlog, Alpha destination, Beta destination]`. Panel drag cancellation and the simulated failure probes also pass. |
| R3 — Filtered completion totals | Pass: `1 of 2 done` survives the Completed filter. |
| R4 — Reduced-motion transitions | Pass: media-emulated computed transition durations are zero for rail, filter segments, and search results. This is a computed-style check, not elapsed animation measurement. |
| R5 — Closing panels | Pass: Search, Backlog, and Recovery close buttons restore their respective rail triggers. |

The first eight independent probes retain their original assertions. The
continuity probe adds an observable wait for the ArrowRight smooth scroll to
settle at 272px before taking its baseline; that addresses the earlier timing
race without relaxing the final position/date checks.

## Remaining findings

### R6 — [P2] Quick-add inherits the previous editor's surface

Location: `src/renderer/App.tsx:292–297`, with restoration at lines 165–195.

Reproduce: search for **Findable**, open **Findable task**, dismiss its editor,
leave Search open, click the toolbar **Add task**, then press Escape in the
empty composer. The composer closes, but focus goes to **Open Findable task**
inside Search instead of the toolbar button that opened this composer.
The hosted probe recorded `BUTTON`, label `Open Findable task`,
`inSearch: true`; the Add task focus assertion failed.

`openNew` captures a new trigger and clears the task ID but does not update
`originatingSurface`. The previous `'search'` value therefore wins before the
connected current trigger is considered. Capture the surface together with
the actual trigger on every open, including creation and standalone quick
actions. Cover entry-point changes while a utility panel remains open, rather
than only testing fresh application state.

### R7 — [P2] An empty Backlog panel has no working focus fallback

Location: `src/renderer/App.tsx:218–224`; Backlog header markup is in
`src/renderer/components/BacklogPanel.tsx`.

Reproduce: place **Only backlog task** in Backlog, open the utility panel,
open the task through its title, uncheck **Keep in backlog**, assign
`2026-10-25`, and save. The saved task correctly leaves Backlog, but keyboard
focus drops to `BODY`. The panel stays open and contains usable controls.
The probe verifies the committed date and empty list before checking focus.

The fallback queries `.panel-close-btn`, which this panel never renders.
Calling `.focus()` on the non-focusable `aside` then has no effect. Focus a
connected, visible control such as Add to backlog or Close backlog panel, or
make the deliberate container fallback programmatically focusable. Preserve
the empty panel's ownership after its originating row disappears.

### R8 — [P2] Editing through the Backlog menu loses the surface owner

Location: `src/renderer/App.tsx:330–338` and the menu Edit callback at
lines 1722–1724.

Reproduce R7, but open **More actions for Only backlog task → Edit task**.
After scheduling and saving, focus lands on **Only backlog task** on the
board, outside the still-open Backlog panel. The hosted probe recorded
`BUTTON`, text `Only backlog task`, `inBacklog: false`.

The callback calls `openEditor(task)` without an explicit element or surface.
Although `openEditor` captures the current trigger in
`originatingElement.current`, surface detection examines only the optional
`originatingEl` argument and defaults to `'board'`. Derive both values from
the same actual trigger, or pass the menu's original anchor and owner into
the editor. Fixing the empty-panel selector alone will not repair this path:
the Backlog-specific fallback is never entered.

These are focus-routing failures, not observed data-loss failures. Both
scheduling probes confirmed the intended task date was saved successfully.
They violate the Phase 3 requirement to capture each current trigger and
restore a visible fallback within its originating surface.

## Visual evidence and handoff

Five actual screenshots were extracted from the reviewed commit's successful
hosted run and inspected at 1440×900 and 860×680. Copies are under
`docs/evidence/phase3-fix-review/screenshots/`. Recovery now visibly shows the
paused session, its task title, `Elapsed: 00:00`, explicit Resume controls,
and storage tools in both sizes. This corrects the previous healthy-state
screenshot mismatch. These screenshots establish the displayed synthetic
state, not a measured interrupted-time or delayed-write scenario.

The handoff now includes the R1–R5 work and passing 89-test runs. The old
`docs/phase3-implementation-review.md` and its evidence remain unchanged as
historical records. New results, focus observations, hashes, and an immutable
copy of the three additional probes are saved beside this review's evidence.

## Reproduction and next verification

On a fix branch, copy
`docs/evidence/phase3-fix-review/reproduce.spec.ts` to
`tests/app/phase3-fix-review.spec.ts` while preserving its assertions. Repair
R6–R8 and add any needed entry-point coverage. Push the intended source
revision and wait for its complete **Planner checks → Full checks on Apple
Silicon macOS** job. All existing tests and these probes must pass. Keep GUI
execution hosted; do not launch the local app to reproduce these failures.

Exact remote commands used for this review included:

```sh
git push -u origin codex/phase3-fix-review
gh run watch 40450745690 --repo yash9008/laptop-planner --exit-status --interval 30
gh api repos/yash9008/laptop-planner/actions/runs/40450745690/logs
```

The hosted workflow executed `npm ci` followed by `npm run check`.
