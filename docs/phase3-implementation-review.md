# UI Phase 3 independent review — October 26, 2026

**Verdict: needs fixes before Phase 3 acceptance.** Five observable issues
remain. The implementation delivers the principal filters/search/panel UI and
passes Gemini's existing suite, but that suite does not establish all of the
specified acceptance behaviors.

## Revisions and execution

- Reviewed implementation: `ui-phase-3`, commit
  `29b0d08ff79e465f9d76040f0d0927ec150798ee`.
- Gemini's stated tested commit `691722b` has identical application and test
  source; the subsequent commit adds the handoff and screenshots only.
- Independently checked the [complete run for the reviewed commit](https://github.com/yash9008/laptop-planner/actions/runs/40311821520):
  type-check/build, 78 scheduler tests in each of Asia/Kolkata and
  America/Los_Angeles, 63 database tests, and all 77 existing Electron tests
  passed. The full raw job log was inspected, including its final test count.
- Independent probes: branch `codex/phase3-review`, commit
  `c40e1906ca4e747d4e221fc5b497fcc1765e488c`. This adds eight tests to the
  reviewed source without changing the application or existing tests.
- [Independent hosted full run](https://github.com/yash9008/laptop-planner/actions/runs/40320259859):
  type-check/build and scheduler/database suites passed; Electron reported
  **80 passed, 5 failed**. All 77 existing tests passed again. Of the eight
  independent probes, three passed and five reproduced the findings below.
- All GUI execution took place on GitHub's standard macOS arm64 runner with
  disposable databases and a controlled clock. The reviewer ran only
  `npm run typecheck` locally; no local app window or personal database was used.

The original `ui-phase-3` checkout was restored after the hosted probes.
Application fixes have not been applied by this review. Review documentation
and an immutable copy of the tested probes are saved separately.

## Findings

### R1 — [P2] Search loses its originating surface when an edit removes a match

Location: `src/renderer/App.tsx:148`, especially the global fallback selectors
at lines 154–167 and the Search editor integration at line 1377.

Reproduction: create **Needle source** on the visible day, search for
**Needle**, open that result, rename it **Different title**, and save. The
query remains intact and the result correctly disappears, but keyboard focus
moves to the renamed task's **board** button. The probe recorded
`{tag: 'BUTTON', text: 'Different title', inSearch: false}`.

Once the original result button is disconnected, `restoreOriginatingFocus`
searches the whole document for the task ID and prefers `.task-title`. This
selects another presentation of the record instead of a visible fallback in
Search. With no matching board card, the generic toolbar fallback has the
same ownership problem. Track the originating surface as well as task ID and
restore to the remaining result or a suitable Search control when a result
leaves the query. Cover rename, project/note edits that remove a match,
deletion, and movement without rebasing the board.

### R2 — [P2] Backlog-panel drops ignore the insertion point and lack its preview

Location: `src/renderer/components/BoardDrag.tsx:94`, particularly line 104;
the new source is in `BacklogPanel.tsx:112`.

Reproduction: create dated **Alpha destination**, **Beta destination**, and
**Incoming backlog** in backlog. Drag Incoming from the utility panel to the
top of Alpha. The native drop succeeds, but the resulting dated order is
`[Alpha destination, Beta destination, Incoming backlog]`, rather than
`[Incoming backlog, Alpha destination, Beta destination]`. The live insertion
placeholder count is zero during that drag.

The external-source drop path always sends `beforeTaskId: null`; unlike the
existing board drag, it never derives the hovered neighbor or publishes a
target placeholder. This changes scheduling priority from the user's chosen
position. Reuse the established insertion/preview contract for panel sources,
including filtered hidden neighbors, cancellation and failed-write recovery.
Do not turn a between-card drop into an unconditional append.

### R3 — [P2] Status filtering changes the completion total

Location: `src/renderer/App.tsx:1264`.

Reproduction: on the day view, create two tasks and complete one. The summary
starts at **1 of 2 done**. Apply **Completed** in the new filter chooser: it
changes to **1 of 1 done**, while the progress bar still represents one of two
tasks. The probe observed the incorrect count directly.

The label uses `completed` and `filteredTasks`, while the bar uses
`visibleTasks`. Calculate both from the same underlying view-scoped records.
The count expression predates this phase's new chooser; this is an inherited
acceptance gap exposed by the new status filtering, not a newly introduced
database or scheduler regression. Phase 3 explicitly requires completion
summaries to remain based on underlying data.

### R4 — [P2] New transitions remain enabled with reduced motion

Locations: `src/renderer/styles.css:860`, `:1036`, and `:1231`.

With Playwright's media preference set to `prefers-reduced-motion: reduce`,
the new controls still resolve to:

| Selector | Computed transition durations |
| --- | --- |
| `.rail-button` | `0.2s, 0.2s, 0.2s` |
| `.filter-segment` | `0.15s, 0.15s` |
| `.search-result-item` | `0.15s, 0.15s` |

These new declarations sit outside the existing `no-preference` media gate
and have no reduced-motion override. Gate them or disable them under reduced
motion. Add an actual media-emulation check; the current test named for
reduced motion never changes that preference. These are observed computed
styles, not a claim that animation elapsed spans were measured.

### R5 — [P2] Closing Search drops keyboard focus on BODY

Location: `src/renderer/App.tsx:1387` and the Search close control.

Reproduction: open Search, verify its input receives focus, then activate
**Close search panel**. The panel is removed and the probe records
`document.activeElement.tagName === 'BODY'`; the surviving Search rail trigger
is inactive. Keyboard navigation loses its location and starts over in the
page instead of returning to the opener.

The close callback only clears panel state. Restore focus to the correct
connected opener after the panel unmounts. Backlog and Recovery use the same
callback pattern and should be checked as well; this review directly
reproduced the Search case only.

## Passing independent cases

The following additional acceptance paths were exercised successfully:

1. A Search edit with an injected failed write preserves its draft and query,
   leaves committed notes unchanged, and saves correctly on retry, restoring
   focus to the still-matching result.
2. When the initial renderer `getDay` call fails and there is no day snapshot,
   Recovery still opens, displays the read error, and opens existing storage
   tools.
3. With the calendar initially hidden and the board panned to the next day,
   Search/Recovery switching preserves the query, mounted board DOM node,
   scroll position and selected date; closing the panel keeps the calendar
   hidden.

## Coverage and handoff corrections

The handoff's claimed coverage is broader than the implementation tests:

- The test named **save/fail/retry** only changes notes and performs one
  successful save. It never injects a failure or retries. The review exercised
  the missing failure-and-retry path successfully, and R1 covers a different
  missing-result path it does not exercise.
- The panel continuity test does not pan the board or start with the calendar
  hidden, and it records a width without comparing it after switching. The
  independent review verifies the hidden-calendar/panned-board case, but not
  every width-restoration combination.
- The drag test checks one same-day filtered reorder and presence of one
  hidden task. It does not test backlog-panel insertion, failed drops,
  cross-day drops, cancellation or the relative order of multiple hidden tasks.
- The recovery test does not inject read failures or advance the clock to
  prove unchanged elapsed time while switching panels. The independent review
  adds the no-snapshot error path, not an exhaustive elapsed-time audit.
- The reduced-motion/delayed-write test does not emulate reduced motion,
  delay a write, or measure transition timing. R4 is missed as a result.
- The state table describes an `activeSearchResultId` state that is absent
  from the source. Record the actual ownership model or implement the required
  stable-result continuity rather than documenting an imaginary state.
- The supplied Recovery and laptop screenshots show **Everything is healthy**,
  not the paused session and **45m elapsed** claimed in the handoff. Await the
  intended state before capturing and label the observed evidence accurately.
- The scheduler time zones in the handoff table should be Asia/Kolkata and
  America/Los_Angeles, matching the actual command and logs, not UTC.

These are limitations of the evidence, not evidence of hidden additional
runtime failures. The passing cases and the five reproduced issues above are
kept separate from unexercised combinations.

## Reproduction and next acceptance gate

The exact tested file is preserved at
`docs/evidence/phase3-independent-review/reproduce.spec.ts`; structured results
and SHA-256 provenance are in the same directory. The hosted review branch
has it installed as `tests/app/phase3-independent-review.spec.ts` so the full
workflow discovers it. On a fix branch, copy the preserved file into that
test location, retain its assertions, fix R1–R5, and add the missing behavioral
coverage appropriate to the fixes. Do not overwrite this review's evidence.

Commit and push the intended revision, then wait for its full hosted
`npm run check` result. Correct the handoff's claims and provide real visual
evidence. Phase 3 remains pending independent re-review; Phase 4 is not
authorized by this review.
