# Sunsama reference measurements

The Home screen's visual language was taken from Sunsama 3.4.15 running on this
machine (Electron 44.4.5), not from a screenshot. Sunsama's renderer is a remote
web app, so nothing useful ships in `app.asar`; the numbers below were read from
the live page through the Chrome DevTools Protocol at 952x640, 1280x800 and
1710x1072 viewports. The 952px pass is what reveals the 60px icon rail; the
wider passes show the 200px sidebar.

Only layout and paint values were read. No Sunsama task, project, calendar or
account data was read, changed or imported, and no Sunsama branding is copied.

## Measured values

| Surface | Sunsama value |
| --- | --- |
| Page background | `#08090a` |
| App panel | `#131314`, 1px `#1e1e1e` border, 4px radius, 8px inset from the window edges, top offset 28px |
| Sidebar | 200px wide, own rows 176px wide |
| Brand block | 176x44 at 28px from the top, 4px radius, text 16px/600 |
| Nav row | 176x28, 4px radius, 4px 6px padding, 2px vertical margin, 14px/500, idle `#a0a0a0`, selected background `#282828` |
| Section label | 10px/600, `#787878` |
| Toolbar row | 44px tall, 10px horizontal padding |
| Toolbar pill | 24px tall, 4px radius, background `#212123`, border 1px `#323232`, 12px/600, `#a0a0a0` |
| Day column | 272px wide, no gutter between columns |
| Day label | 64px tall, 16px 20px 0 padding, weekday 20px/600 `#e6e6e6`, date 14px/500 `#a0a0a0` 5px below |
| Progress track | 8px tall, 4px radius, track `#1f1f1e`, fill `#4dcd7d`, inset 12px, 4px above / 18px below |
| Add-task row | 34px tall, 4px radius, background `#212123`, 6px 12px padding, 14px/500 |
| Card | 252px wide, 12px padding, 4px radius, background `#212123`, 2px side margin, 8px bottom margin, 1px 2px 4px `rgba(0,0,0,.9)` shadow |
| Card title | 14px/500 `#e6e6e6` |
| Estimate pill | 10px/600, `#a0a0a0` on `#3c3c3c`, 4px radius, 2px 4px padding |
| Checkbox | 16px circle, green `#4dcd7d` when complete |
| Calendar dock | 272px wide, day label 80px tall below the toolbar with a 20px/600 weekday, 24px per half-hour event slot |
| Sidebar rail | 60px wide below ~1024px; 24px icon over a 10px label, 45x59 selected tile `#1c1c1d` |
| Calendar hour gutter | 45px, continuous 1px rule, hour label 10px `#7c7c7c` |
| Calendar block | light project-tinted fill with a diagonal hatch, 4px radius, 2px project-colored left border |
| Font | `Avenir, Arial, "Helvetica Neue", Helvetica, sans-serif`, body 14px/500 |

## What was applied

`src/renderer/styles.css` ends with two blocks: "Visual language:
Sunsama-measured home screen" for the shell, sidebar, toolbar, columns and
cards, and "Home screen pass C" for the icon rail, full-width toolbar, compact
calendar header and colored cards.

Pass C applies the measured home-screen silhouette:

- **Sidebar rail.** Below 1024px the 200px sidebar becomes a 60px icon rail:
  icon over a 10px label, a 45x59 selected tile, a short section divider and
  project hashes. The measured breakpoint is between 1000 and 1050px, so 1024
  is the midpoint.
- **One toolbar row.** The toolbar spans the whole panel instead of stopping at
  the calendar, and the 1px divider under it is gone. `Board | Day`, the command
  palette icon and `Add task` stay at the right; the save state moved to the
  sidebar footer.
- **Compact calendar header.** The old `Calendar` title plus a second dates row
  are replaced by one `WED / 28` header, with the zoom stack in a 45px gutter.
  It is 64px tall so the hour grid starts level with the board's first row.
  Sunsama measures 80px here; the 16px is given up deliberately so the two
  halves of the home screen share a baseline.
- **Quiet columns.** The `7h 30m free / 0 of 2 done` footers and the
  "Drop a task here" placeholder are gone. Completion is exposed on the
  progress track (`role="progressbar"`, `aria-valuetext="N of M done"`);
  overflow remains as the only footer, and only when a day does not fit.
- **Color.** Project tags use the whole project color rather than just the `#`,
  cards keep their 1px top highlight, and calendar blocks are light
  project-tinted chips with the diagonal hatch and a project-colored left edge,
  as Sunsama's are. Card note previews are hidden on the board; notes remain in
  the editor.

The calendar dock's default width is 272px, matching the measured dock (it was
`clamp(260px, 24vw, 340px)`, which made the calendar about 70px too wide at
1440). The existing drag handle still overrides it.

Two deliberate departures:

- **Branding.** The sidebar keeps the Laptop Planner name and icon.
- **Feature rows.** Sunsama's Daily/Weekly ritual rows and its "Invite someone"
  entry have no counterpart here, so they are omitted rather than shown as dead
  controls.

Three smaller departures: the board keeps fixed 272px columns instead of
widening them to fill the panel, so the column pitch and the existing
`scrollBy({left: 272})` step stay in agreement; there is no `Calendars` pill or
account avatar in the toolbar; and the right rail keeps this app's panels rather
than Sunsama's target/briefcase/moon entries.

Day totals moved from the strip above the board into each column's add-task row,
matching Sunsama. The board's own summary strip is gone; the Today view keeps
the full workload summary because that view has room for it.

The column width is 272px, which also matches the board's existing
`scrollBy({left: 272})` keyboard step, so column pitch and scroll step agree.

## Regenerating these numbers

Sunsama must be running with a debugging port:

```sh
osascript -e 'tell application "Sunsama" to quit'
open -a "/Applications/Sunsama.app" --args --remote-debugging-port=9222
```

The throwaway probe scripts (`sunsama-dom.mjs`, `sunsama-detail.mjs`,
`sunsama-nav.mjs`, `sunsama-cal.mjs`) lived in the session's temporary
directory and are not part of the repository. Each opened the page target,
overrode the viewport to 1710x1072, and printed computed styles for elements
selected by class prefix (`kanban-`, `navigation-`, `calendar-view-`).

Sunsama's window is a remote web app; relaunching with a debugging port briefly
closes and reopens it, which is safe and changes nothing in the account.
