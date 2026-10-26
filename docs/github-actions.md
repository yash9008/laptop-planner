# Background tests with GitHub Actions

## Current setup

`.github/workflows/check.yml` is prepared for a public GitHub repository. It
has not yet been run on GitHub. A successful first hosted run is required
before treating the full Electron suite as verified in this environment.

The workflow uses the standard Apple Silicon `macos-26` runner, Node.js
24.22.1, `npm ci`, and `npm run check`. This runs the existing type check,
build, scheduler tests in both time zones, database tests in Electron's
native runtime, and every real Electron UI test. No tests are skipped or
rewritten to hide windows. The test windows open on GitHub's desktop.

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

Ask coding agents to use this hosted workflow for GUI tests and report the
commit and run URL. They should not run local GUI suites or launch previews
while you are using the desktop unless you request it. This routing is a
development workflow preference, not an app runtime feature. The application
stays offline, and its existing tests use disposable databases and controlled
clocks. Never upload your personal planner database or backups.
