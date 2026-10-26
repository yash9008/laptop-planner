# Background tests with GitHub Actions

## Current setup

The public repository is
[yash9008/laptop-planner](https://github.com/yash9008/laptop-planner), with
`.github/workflows/check.yml` enabled on push, pull request, and manual dispatch.
The [first hosted run](https://github.com/yash9008/laptop-planner/actions/runs/40301944117)
passed type-check/build, 78 scheduler tests in each of two time zones, 63
database tests, and 67 of 68 Electron tests. Its board wheel test failed.
The [focused diagnostic after test setup adjustments](https://github.com/yash9008/laptop-planner/actions/runs/40303786511)
passed all five repetitions on commit `9d7278a3a010057e4b299eda9de0ac2475d5d995`.
The [full check for the same revision](https://github.com/yash9008/laptop-planner/actions/runs/40303785779)
passed on October 26, 2026: type-check/build, 78 scheduler tests in each of
Asia/Kolkata and America/Los_Angeles, 63 database tests, and all 68 Electron
tests. The full job took 4 minutes 51 seconds, including runner setup and
dependency installation. It used the standard `macos-26` runner and uploaded
zero artifacts. Later documentation-only verification updates do not change
the tested application or test source revision identified above.

The workflow uses the standard Apple Silicon `macos-26` runner, Node.js
24.22.1, `npm ci`, and `npm run check`. This runs the existing type check,
build, scheduler tests in both time zones, database tests in Electron's
native runtime, and every real Electron UI test. The default full check does
not skip tests or rewrite them to hide windows. The test windows open on
GitHub's desktop. A manual `board-wheel-diagnostic` option repeats one test
five times to investigate wheel delivery; it does not replace the full check.

## No paid runner usage

GitHub documents standard hosted runners as free for public repositories:
https://docs.github.com/en/actions/reference/runners/github-hosted-runners

The job is restricted to public repositories and skips if the repository
becomes private. It uses no larger runners, custom images, artifact uploads,
or dependency cache. It has a 30-minute timeout and cancels superseded runs
on the same ref. These choices avoid introducing paid Actions features;
they do not modify account-wide billing settings or other workflows.

## Initial publication

1. Initialize Git in the project directory and review the files to publish.
   Exclude personal data, credentials, generated outputs, and dependencies.
   The existing `.gitignore` excludes SQLite files and generated outputs.
2. Create a public repository on the intended GitHub account, then push the
   reviewed source and workflow. This requires authenticated GitHub access.
3. Open the repository's **Actions** tab and select **Planner checks**.
4. Inspect the first run. If it fails, fix the reported dependency or test
   compatibility issue and push another commit. Do not weaken native-window
   assertions to obtain a pass.

## Daily use after the first successful run

Push the source revision to test, then wait for that revision's **Planner
checks** result. Open a run to inspect installation and test logs; failed
screenshots are not retained because artifact uploads are disabled. A
skipped, cancelled, or timed-out run is not a successful test result.

GitHub CLI is installed on this Mac and authenticated as `yash9008`. From the
repository directory:

```sh
git push origin HEAD
gh run list --repo yash9008/laptop-planner --workflow check.yml --event push --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId,status,conclusion,url,headSha
```

If the push-triggered run has not appeared yet, wait briefly and list again.
Use the returned run ID with `gh run watch RUN_ID --repo
yash9008/laptop-planner --exit-status`, then use `gh run view RUN_ID --repo
yash9008/laptop-planner --log-failed` if it fails. Confirm the local working
tree is clean before testing: an uncommitted change has not been uploaded and
is not covered by a remote run. Re-running a historical commit does not test
new local edits.

The board fixture aligns the native Electron content size with its 1440x900
page viewport. Its wheel gesture targets the board center instead of its
former bottom-edge coordinate; that coordinate produced no scrolling in the
hosted diagnostics. All original scrolling, day-selection, drag, and keyboard
assertions remain. The application implementation was not changed for CI.

Ask coding agents to use this hosted workflow for GUI tests and report the
commit and run URL. They should not run local GUI suites or launch previews
while you are using the desktop unless you request it. This routing is a
development workflow preference, not an app runtime feature. The application
stays offline, and its existing tests use disposable databases and controlled
clocks. Never upload your personal planner database or backups.
