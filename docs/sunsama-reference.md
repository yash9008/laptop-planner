# Sunsama reference measurements

The Home screen's visual language is taken from Sunsama 3.4.15 running on this
machine (Electron 44.4.5). The renderer is a remote web app, so the numbers
below were read from the live page through the Chrome DevTools Protocol at
952x640, 1280x800, 1440x900 and 1710x1072 viewports. The narrow pass reveals
the icon rail; the wider passes show the full sidebar.

Only layout, computed paint values and fixed control labels were read. No
Sunsama task, project, calendar or account content was read, changed or
imported, and no Sunsama branding is copied.

## Measured values

| Surface | Sunsama value |
| --- | --- |
| Page background | `#08090a` |
| App panel | `#131314`, 1px `#1e1e1e` border, 4px radius, 8px inset from the window edges, top offset 28px |
| Sidebar | 200px wide, own rows 176px wide |
| Brand block | 176x44 at 28px from the top, inside an 80px header, text 16px/600 |
| Nav row | 176x28, 4px radius, 4px 6px padding, 2px vertical margin, 14px/500, idle `#a0a0a0`, selected background `#282828` |
| Section label | 10px/600, `#787878` |
| Board toolbar | 44px tall over the board only, 10px horizontal padding; date and Filter left, Board dropdown right |
| Calendar toolbar | Separate 44px row over the 272px dock, Calendars left and a 20px circular avatar right |
| Toolbar pill | 24px tall, 4px radius, background `#212123`, 12px/600, `#a0a0a0` |
| Day column | Fixed 272px wide at every measured viewport, no gutter between columns |
| Day label | 64px tall, 16px 20px 0 padding, weekday 20px/600 `#e6e6e6`, date 14px/500 `#a0a0a0` 5px below |
| Progress track | 8px tall, 4px radius, track `#1f1f1e`, fill `#4dcd7d`, 20px column inset, 4px above / 18px below |
| Add-task row | 34px tall, 252px wide, 4px radius, background `#212123`, 6px 12px padding, 14px/500, 1px 2px 4px `rgba(0,0,0,.9)` shadow |
| Card | 252px wide, 12px padding, 4px radius, background `#212123`, 2px side margin, 8px bottom margin, 1px 2px 4px `rgba(0,0,0,.9)` shadow |
| Card title | 14px/500 `#e6e6e6` |
| Estimate pill | 10px/600, `#a0a0a0` on `#3c3c3c`, 4px radius, 2px 4px padding |
| Checkbox | 16px circle, green `#4dcd7d` when complete |
| Calendar dock | 272px wide, day label 80px tall below its own toolbar, 24px per half-hour event slot |
| Calendar header | 48px zoom gutter; 10px/600 weekday and 20px/500 day number with 12px padding |
| Sidebar rail | 60px wide below ~1024px; icon-only 48x48 tiles on a 52px pitch |
| Utility rail | 49px wide, 32px buttons with 8px margins and 10px radius |
| Calendar hour gutter | 48px, continuous 1px rule, hour label 10px `#7c7c7c` |
| Calendar block | light project-tinted fill with a diagonal hatch, 4px radius, 2px project-colored left border |
| Font | `Avenir, Arial, "Helvetica Neue", Helvetica, sans-serif`, body 14px/500 |

## What is applied

`src/renderer/styles.css` ends with two measured Home blocks. Together they
apply the shell, sidebar, board and calendar headers, columns, cards, rail and
responsive behavior. `HomeMenu.tsx` supplies the Board and Calendars dropdowns
with keyboard navigation, Escape/outside dismissal and focus restoration.

- **Shell and sidebar.** The panel uses the measured inset, border and radius.
  The full sidebar has an 80px brand header and 28px navigation rows. Below
  1024px it becomes a 60px rail with 48px icon-only tiles.
- **Board toolbar.** Date and Filter stay left; Board/Day is a dropdown at the
  right. The Home toolbar no longer spans the calendar. Global task creation
  remains available through `A`, every column's Add task row and the command
  palette; the palette trigger occupies the rail's bolt position.
- **Calendar toolbar and avatar.** Calendars opens local visibility/event
  actions. The circular `LP` avatar opens the existing local Settings dialog;
  it does not represent an account or cloud connection.
- **Utility rail.** Reference positions are retained with useful offline
  mappings: panel toggle, Calendar, Focus/target, Backlog/archive,
  Recovery/moon, Search, Commands/bolt and New fixed event/plus.
- **Board geometry.** Columns remain fixed at 272px, matching the live
  reference at all measured widths. Progress, add rows and cards use the
  measured insets and shadows. Completion remains accessible on the progress
  track and overflow is the only conditional column footer.
- **Calendar.** The header is the measured 80px even though the board heading
  is 64px; their content baselines intentionally differ by 16px. Blocks remain
  light project-tinted chips with dark text and a soft hatch.

Deliberate product departures:

- **Branding.** The sidebar keeps the Laptop Planner name and icon.
- **Unimplemented rituals.** Daily planning, Daily shutdown and Weekly review
  rows are omitted until real offline workflows exist; no dead controls are
  added.
- **Local equivalents.** The avatar, Calendars menu and rail actions use real
  local functionality rather than accounts, integrations or online services.
- **Data safety.** Draft preservation, explicit saves, predictable Escape
  handling, focus restoration and atomic writes remain Laptop Planner behavior.

Day totals stay in each column's add-task row. The board has no separate
summary strip; the Today view retains its full workload summary.

## Regenerating these numbers

Sunsama must be running with a debugging port:

```sh
osascript -e 'tell application "Sunsama" to quit'
open -a "/Applications/Sunsama.app" --args --remote-debugging-port=9222
```

The throwaway probe scripts lived in the session's temporary directory and are
not part of the repository. They override the viewport and print computed
styles for shell, navigation, kanban and calendar class prefixes without
returning user-content text.
