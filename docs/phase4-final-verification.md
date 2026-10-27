# UI Phase 4 final fixes and verification — October 27, 2026

**Phase 4 is ready to proceed to UI Phase 5.** Known R1–R11 regression paths
pass in the complete hosted suite. This is source/development validation;
full reference motion acceptance remains Phase 5 work.

## Source and execution

- Branch: `ui-phase-4`.
- Fix/application/test commit: `d0f55c3ac6e558475d71522ddbbe5fe2c1691cfb`.
- Push-triggered [Planner checks run](https://github.com/yash9008/laptop-planner/actions/runs/40500807107).
- Job: **Full checks on Apple Silicon macOS**, ID `122177714729`.
- Conclusion: **success**. Type-check/build passed; scheduler **78/78** in
  each of Asia/Kolkata and America/Los_Angeles; database **63/63**; Electron
  **122/122**. The exact head SHA, completed full-job result, individual
  regression results, and raw-log final summary were checked. The optional
  wheel diagnostic was skipped; the full check suite ran.
- Local commands: `npm run typecheck`, `npm run build`, and `git diff --check`;
  all succeeded.
- Hosted commands: `npm ci`, `npm run check`. Followed with
  `gh run watch 40500807107 --repo yash9008/laptop-planner --exit-status
  --interval 30`.

All GUI execution uses the hosted standard Apple Silicon macOS runner,
temporary databases and controlled clocks. No local app/preview window,
personal planner database, Sunsama account access, packaging or installation
was used. Historical reviews and evidence remain unchanged.

## Remaining review fixes

| Finding | Change | Verification |
| --- | --- | --- |
| R9 — Today/Backlog palette navigation focuses BODY | Target the enabled Add task control in the destination view, after the palette is removed. The enclosing non-focusable main is no longer a selector candidate. | Both unchanged review probes run in the full suite. |
| R10 — Focus entry prefers an old opener | Capture each direct entry's actual trigger and pass a snapshot of the existing task/element/surface origin for palette entry. Preserve that entry snapshot through later editing. Exit restores through the shared surface-aware helper after rendering. | Unchanged stale-opener probe, repeated sidebar entry/exit, and Search-origin editing that removes the invoking result. |
| R11 — Focus loses vertical board scrolling | Retain the actual PlanningBoard subtree using the prior workspace view. Ignore nearest-column measurements while that board is concealed; resume measurement when visible. Remove the partial horizontal-only restoration workaround. | Unchanged vertical-scroll probe, original horizontal/date probes, and a three-cycle DOM-identity/date/scroll assertion. |

The five probes from review commit `08ac98b` were imported unchanged from
`docs/evidence/phase4-fix-review/reproduce.spec.ts`. Their final case checks
Search-query and persisted paused-timer continuity. Two further interaction
tests assert actual board-node retention and Search entry ownership across a
Focus editor save that removes the original result.

Existing Phase 2/3 regressions, the eight original Phase 4 probes and Gemini's
four related regression cases are retained. No dependency, schema, main,
preload, scheduler, timer-persistence or network restriction changed.

## Native-menu sleep/resume investigation

The previous independent full run observed the existing sleep/restart test
remain at paused 00:06 after an explicit Resume, instead of reaching 00:10.
The retained failure log did not include native error messages or persisted
focus state, so it does not establish a production root cause.

The test now verifies the native Pause timer action and committed running
state, and checks the captured native error list, before advancing its
artificial clock. It retains the original sleep, elapsed, clean-restart and
closed-time exclusion assertions. Failure-only diagnostics capture the menu
title/state/action, native errors, and persisted focus state.

A new test repeats five sleep/wake/explicit-native-resume cycles with one-hour
paused gaps and two-second running intervals. It asserts each transition,
zero native errors, and exactly 10,000 ms of persisted elapsed time. No
production timer semantics, lifecycle handlers, clock authority or recovery
rules were changed, and no blanket retries or sleeps were added. The earlier
failure is not retrospectively reclassified as a pass or assigned an
unproven root cause.

In the final full run, the existing sleep/restart test and all five repeated
sleep/resume cycles passed with the committed-state checks. The injected
native-pause failure/retry test also passed. No native errors or elapsed-time
discrepancy were reported. This establishes the exercised paths, rather than
proving an unknown historical failure's root cause.

## Readiness and remaining limits

All seven `phase4-fix-review` cases and the twelve original/related
`phase4-independent-review` cases pass. Vertical task-list scrolling was
recorded as `{before: 300, after: 300}`. The three-cycle check retained the
same board DOM node, horizontal offset 544 and selected date. Search entry
ownership survived editing away its invoking result, with focus returned to
the preserved query input.

Six controlled screenshots were retrieved from this run. The wide palette,
wide populated Focus, narrow palette and narrow paused Focus images were
inspected; visible content fits the tested bounds and the paused image shows
00:10 with an explicit Resume control. Screenshots, hashes, run metadata and
raw-log summaries are in `docs/evidence/phase4-final-verification/`. Static
captures do not establish motion spans; interaction assertions establish
the keyboard/scroll behavior described above.

Full reference motion parity is still UI Phase 5 work. In particular,
loaded CSS declarations do not establish actual
Focus/panel triggers or measured animation spans. The packaged app and DMG
have not been rebuilt or verified for these fixes.

The requested next-phase implementation prompt is
`docs/phase5-gemini-implementation-prompt.md`. Writing that prompt does not
implement UI Phase 5.

The subsequent documentation-only commit publishes these receipts, the live
PLAN status and the prompt. Its application/test source remains the exact
tested `d0f55c3` revision above; the documentation update is not represented
as a separate successful runtime check.
