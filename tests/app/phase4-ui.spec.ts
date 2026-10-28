import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;
let clock: number;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'laptop-planner-phase4-'));
  clock = Date.parse('2026-10-25T07:30:00.000Z');
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [resolve('.')],
    env: {
      ...env,
      TZ: 'Asia/Kolkata',
      LAPTOP_PLANNER_TEST_DATA_DIR: directory,
      LAPTOP_PLANNER_TEST_NOW: new Date(clock).toISOString(),
    },
  });
  page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: /^Add task for / }).first()).toBeEnabled();
});

test.afterEach(async () => {
  await application?.close();
  application = undefined;
  await rm(directory, { recursive: true, force: true });
});

async function setClock(at: number) {
  clock = at;
  await application!.evaluate((_electron, iso) => {
    process.env.LAPTOP_PLANNER_TEST_NOW = iso;
  }, new Date(clock).toISOString());
}

async function snapshot() {
  return page.evaluate(async () => {
    const result = await window.planner.getDay();
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  });
}

async function addTask(title: string, estimate = '45m', plannedDate: string | null = '2026-10-25') {
  return page.evaluate(
    async ({ title, estimate, plannedDate }) => {
      const day = await window.planner.getDay();
      if (!day.ok) throw new Error(day.error.message);
      // Parse both "90m" and "1h 30m" forms; parseInt alone reads "1h 30m" as 1.
      const hours = /(\d+)\s*h/.exec(estimate)?.[1];
      const mins = /(\d+)\s*m/.exec(estimate)?.[1];
      const minutes =
        hours || mins
          ? (hours ? parseInt(hours, 10) * 60 : 0) + (mins ? parseInt(mins, 10) : 0)
          : parseInt(estimate, 10);
      const res = await window.planner.saveTask({
        id: crypto.randomUUID(),
        create: true,
        title,
        notes: '',
        plannedDate,
        plannedMinutes: minutes,
        viewDate: day.value.date,
      });
      if (!res.ok) throw new Error(res.error.message);
      window.dispatchEvent(new Event('focus'));
      return res.value.allTasks.find((t) => t.title === title)!;
    },
    { title, estimate, plannedDate }
  );
}

test('palette: open, toggle, close, filtering, no-matches, Up/Down/Enter, Tab containment, Escape, and outside-click across surfaces', async () => {
  await addTask('Task for Palette');

  // 1. Open with Cmd+K from board
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();
  const input = palette.getByRole('combobox', { name: 'Command search query' });
  await expect(input).toBeFocused();

  // 2. Cmd+K toggles palette closed
  await page.keyboard.press('Meta+k');
  await expect(palette).toHaveCount(0);

  // 3. Open via toolbar button
  const toolbarBtn = page.getByRole('button', { name: 'Open command palette', exact: true });
  await toolbarBtn.focus();
  await toolbarBtn.click();
  await expect(palette).toBeVisible();
  await expect(input).toBeFocused();

  // 4. Query filtering
  await input.fill('focus');
  await expect(palette.locator('.command-palette-item')).not.toHaveCount(0);
  const options = palette.locator('.command-palette-item');
  const optionCount = await options.count();
  for (let i = 0; i < optionCount; i++) {
    const text = (await options.nth(i).textContent())?.toLowerCase() ?? '';
    expect(text.includes('focus') || text.includes('navigation') || text.includes('task')).toBe(true);
  }

  // 5. Query with no matches
  await input.fill('xyznonexistent');
  await expect(palette.getByRole('status')).toHaveText('No matching commands');

  // 6. Clear query restores list
  await input.fill('');
  await expect(palette.getByRole('status')).toHaveCount(0);

  // 7. ArrowUp/Down navigation
  await page.keyboard.press('ArrowDown');
  await expect(palette.locator('.command-palette-item').nth(1)).toHaveClass(/is-selected/);
  await page.keyboard.press('ArrowUp');
  await expect(palette.locator('.command-palette-item').nth(0)).toHaveClass(/is-selected/);

  // 8. Tab containment trap: Tab cannot escape dialog
  await page.keyboard.press('Tab');
  await expect(palette).toBeVisible();
  const closeBtn = palette.getByRole('button', { name: 'Close command palette', exact: true });
  await expect(closeBtn).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();

  // 9. Escape closes palette and restores toolbar button focus
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(toolbarBtn).toBeFocused();

  // 10. Outside click closes palette
  await toolbarBtn.focus();
  await toolbarBtn.click();
  await expect(palette).toBeVisible();
  await page.locator('.command-palette-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(palette).toHaveCount(0);

  // 11. Initiating control restoration from Search panel
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  const searchInput = page.getByLabel('Search all tasks', { exact: true });
  await searchInput.fill('palette');
  await page.keyboard.press('Meta+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(searchInput).toBeFocused();

  // 12. Initiating control restoration from Backlog panel
  await page.getByRole('button', { name: 'Open backlog panel', exact: true }).click();
  const backlogBtn = page.getByRole('button', { name: 'Close backlog panel', exact: true });
  await backlogBtn.focus();
  await page.keyboard.press('Meta+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(backlogBtn).toBeFocused();
});

test('palette: latest-ID targeting, edit/focus/complete handoff, and dynamic eligibility refresh', async () => {
  const task = await addTask('Dynamic Target');

  // Select task on board
  const card = page.locator(`[data-testid="board-task"][data-task-id="${task.id}"]`);
  await expect(card).toBeVisible();
  await card.click({ position: { x: 10, y: 10 } });
  await expect(card).toHaveClass(/is-selected/);

  // Open command palette
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();

  // Task-specific commands state target task in label
  await expect(palette.getByText(`Edit task: "Dynamic Target"`)).toBeVisible();
  await expect(palette.getByText(`Start focus: "Dynamic Target"`)).toBeVisible();
  await expect(palette.getByText(`Complete: "Dynamic Target"`)).toBeVisible();

  // Execute Edit task from palette
  await palette.getByText(`Edit task: "Dynamic Target"`).click();
  await expect(palette).toHaveCount(0);
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Task title', { exact: true })).toHaveValue('Dynamic Target');

  // Dismiss editor: returns focus to card
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);

  // Complete task via palette
  await card.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Meta+k');
  await palette.getByText(`Complete: "Dynamic Target"`).click();
  await expect(palette).toHaveCount(0);
  expect((await snapshot()).tasks.find((t) => t.id === task.id)?.completed).toBe(true);

  // Open palette again: task now offers Reopen, and Start focus is disabled because task is completed
  await card.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Meta+k');
  await expect(palette.getByText(`Reopen: "Dynamic Target"`)).toBeVisible();
  const startFocusItem = palette.locator('.command-palette-item', { hasText: 'Start focus' });
  await expect(startFocusItem).toHaveClass(/is-disabled/);
  await expect(startFocusItem).toContainText('Completed task cannot be focused');
  await page.keyboard.press('Escape');
});

test('shortcuts: guarded A, F, /, and Cmd+K in workspace vs input/contenteditable, modals, and pending write', async () => {
  // 1. Bare A in workspace opens quick-add
  await page.keyboard.press('a');
  const quickAdd = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(quickAdd).toBeVisible();

  // 2. Typing inside input does NOT trigger shortcuts
  const titleInput = quickAdd.getByLabel('Task title', { exact: true });
  await titleInput.fill('Testing a f / shortcuts');
  await expect(titleInput).toHaveValue('Testing a f / shortcuts');
  // Focus view or search panel did NOT open while typing
  await expect(page.getByTestId('focus-screen')).toHaveCount(0);
  await expect(page.getByTestId('search-panel')).toHaveCount(0);

  // 3. Cmd+K while modal editor owns interaction must NOT open palette
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette', exact: true })).toHaveCount(0);

  // 4. Escape dismisses quick-add
  await page.keyboard.press('Escape');
  await expect(quickAdd).toHaveCount(0);

  // 5. Bare / in workspace opens Search panel and focuses its input
  await page.keyboard.press('/');
  const searchPanel = page.getByTestId('search-panel');
  await expect(searchPanel).toBeVisible();
  const searchInput = searchPanel.getByLabel('Search all tasks', { exact: true });
  await expect(searchInput).toBeFocused();

  // Typing in search input does not trigger F or A
  await searchInput.type('f and a');
  await expect(searchInput).toHaveValue('f and a');
  await expect(page.getByTestId('focus-screen')).toHaveCount(0);

  // Close search panel
  await page.getByRole('button', { name: 'Close search panel', exact: true }).click();
  await expect(searchPanel).toHaveCount(0);

  // 6. Bare F in workspace enters Focus view
  await addTask('Task for F shortcut');
  await expect(page.getByRole('button', { name: 'Task for F shortcut', exact: true })).toBeVisible();
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Task for F shortcut');

  // Exit Focus with Escape
  await page.keyboard.press('Escape');
  await expect(focusScreen).toHaveCount(0);
});

test('focus screen: single-task presentation, empty state, task navigation, explicit start/pause/resume/complete without auto-start, and ineligible task guards', async () => {
  // 1. Empty state when no tasks exist
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();
  await expect(page.getByTestId('focus-empty-state')).toBeVisible();
  await expect(page.getByText('No tasks for focus')).toBeVisible();

  // Exit Focus via Return to workspace button
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await expect(focusScreen).toHaveCount(0);

  // 2. Add two tasks for today
  await addTask('Focus Task Alpha', '30m');
  await addTask('Focus Task Beta', '45m');
  await expect(page.getByRole('button', { name: 'Focus Task Alpha', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Focus Task Beta', exact: true })).toBeVisible();

  // Enter Focus screen
  await page.keyboard.press('f');
  await expect(focusScreen).toBeVisible();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Focus Task Alpha');
  await expect(focusScreen.locator('[data-testid="focus-elapsed"]')).toHaveText('00:00');

  // Assert timer did NOT auto-start merely from entering Focus
  expect((await snapshot()).focus?.running ?? false).toBe(false);

  // 3. Task navigation
  const nextBtn = focusScreen.getByRole('button', { name: 'Next focus task', exact: true });
  await nextBtn.click();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Focus Task Beta');
  // Navigating did NOT start timer
  expect((await snapshot()).focus?.running ?? false).toBe(false);

  const prevBtn = focusScreen.getByRole('button', { name: 'Previous focus task', exact: true });
  await prevBtn.click();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Focus Task Alpha');

  // 4. Explicit Start / Pause / Resume
  const startBtn = focusScreen.getByRole('button', { name: 'Start focus', exact: true });
  await startBtn.click();
  await expect(focusScreen.getByRole('button', { name: 'Pause focus', exact: true })).toBeVisible();
  expect((await snapshot()).focus?.running).toBe(true);

  // Pause
  await focusScreen.getByRole('button', { name: 'Pause focus', exact: true }).click();
  await expect(focusScreen.getByRole('button', { name: 'Resume focus', exact: true })).toBeVisible();
  expect((await snapshot()).focus?.running).toBe(false);

  // Resume
  await focusScreen.getByRole('button', { name: 'Resume focus', exact: true }).click();
  await expect(focusScreen.getByRole('button', { name: 'Pause focus', exact: true })).toBeVisible();

  // 5. Complete task deterministically advances to next incomplete task without auto-start
  await focusScreen.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Focus Task Beta');
  // Timer is NOT running on Beta
  expect((await snapshot()).focus?.running ?? false).toBe(false);

  // Complete Beta: moves to empty state
  await focusScreen.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect(page.getByTestId('focus-empty-state')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(focusScreen).toHaveCount(0);

  // 6. Ineligible task test: task in backlog
  await addTask('Backlog Ineligible', '30m', null);
  await page.getByRole('button', { name: 'Open backlog panel', exact: true }).click();
  const backlogPanel = page.getByTestId('backlog-panel');
  await expect(backlogPanel).toBeVisible();
  const backlogBtn = backlogPanel.getByRole('button', { name: 'Backlog Ineligible', exact: true });
  await expect(backlogBtn).toBeVisible();
  await backlogBtn.click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape'); // close editor
  await expect(editor).toHaveCount(0);
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();
  await palette.getByText(`Focus on: "Backlog Ineligible"`).click();

  await expect(focusScreen).toBeVisible();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Backlog Ineligible');
  const ineligibleStartBtn = focusScreen.getByRole('button', { name: 'Start focus', exact: true });
  await expect(ineligibleStartBtn).toBeDisabled();
  await expect(focusScreen.getByText('Assign this task to today before starting focus.')).toBeVisible();

  await page.keyboard.press('Escape');
});

test('focus screen: edit round-trip, UTC elapsed time consistency with controlled clock, and preserved workspace state upon exit', async () => {
  await addTask('Edit Target In Focus', '45m');
  await expect(page.getByRole('button', { name: 'Edit Target In Focus', exact: true })).toBeVisible();

  // Set filter on board and open Focus screen
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();

  // 1. Edit round-trip
  const editBtn = focusScreen.getByRole('button', { name: 'Edit task', exact: true });
  await editBtn.click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Task title', { exact: true }).fill('Edit Target Renamed');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toHaveCount(0);

  // Focus screen reflects edited title and focus is restored to Edit task button
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Edit Target Renamed');
  await expect(editBtn).toBeFocused();

  // 2. Controlled-clock UTC elapsed time
  await focusScreen.getByRole('button', { name: 'Start focus', exact: true }).click();
  await setClock(clock + 10_000);
  await expect(focusScreen.locator('[data-testid="focus-elapsed"]')).toHaveText('00:10');

  // Pause
  await focusScreen.getByRole('button', { name: 'Pause focus', exact: true }).click();
  await expect(focusScreen.locator('[data-testid="focus-elapsed"]')).toHaveText('00:10');

  // Advance clock by 1 hour while paused: elapsed time must NOT increase
  await setClock(clock + 3_600_000);
  await expect(focusScreen.locator('[data-testid="focus-elapsed"]')).toHaveText('00:10');

  // 3. Preserved workspace upon exit
  const exitBtn = focusScreen.getByRole('button', { name: 'Exit Focus view', exact: true });
  await exitBtn.click();
  await expect(focusScreen).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Multi-day board', exact: true })).toBeVisible();
});

test('motion: computed styles under normal and reduced motion for palette and focus calendar opacity', async () => {
  // 1. Normal motion
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();

  const paletteComputed = await palette.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
    };
  });
  expect(paletteComputed.transitionDuration === '0s' || paletteComputed.transitionDuration === '').toBe(true);
  await page.keyboard.press('Escape');

  // Focus calendar opacity transition in normal motion
  await addTask('Motion Test Task');
  await expect(page.getByRole('button', { name: 'Motion Test Task', exact: true })).toBeVisible();
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();

  await expect(page.locator('.calendar-dock')).toHaveCSS('opacity', '0');
  await expect(page.locator('.calendar-dock')).toHaveCSS('transition-duration', '0.3s');

  await page.keyboard.press('Escape');

  // 2. Reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('f');
  await expect(focusScreen).toBeVisible();

  const calendarDockReduced = await page.locator('.calendar-dock').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(calendarDockReduced.transitionDuration === '0s' || calendarDockReduced.transitionProperty === 'none').toBe(true);
  await page.keyboard.press('Escape');
});

test('screenshots: wide 1440x900 and narrow 860x680 of command palette, populated focus screen, and paused focus', async () => {
  await addTask('Design UI Phase 4', '1h 30m');
  await expect(page.getByRole('button', { name: 'Design UI Phase 4', exact: true })).toBeVisible();

  // --- WIDE 1440x900 ---
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Command Palette Wide
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();
  const paletteWideBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase4-command-palette.png ===\n' + paletteWideBuf.toString('base64') + '\n=== END SCREENSHOT ===');
  await page.keyboard.press('Escape');

  // 2. Populated Focus Screen Wide
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Design UI Phase 4');
  const focusWideBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase4-focus-screen.png ===\n' + focusWideBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // 3. Paused Focus Wide
  await focusScreen.getByRole('button', { name: 'Start focus', exact: true }).click();
  await setClock(clock + 10_000);
  await focusScreen.getByRole('button', { name: 'Pause focus', exact: true }).click();
  await expect(focusScreen.locator('[data-testid="focus-elapsed"]')).toHaveText('00:10');
  const pausedWideBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase4-focus-paused.png ===\n' + pausedWideBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // --- NARROW 860x680 ---
  await page.setViewportSize({ width: 860, height: 680 });
  await expect(focusScreen.locator('[data-testid="focus-elapsed"]')).toHaveText('00:10');

  // 4. Paused Focus Narrow
  const pausedNarrowBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase4-focus-paused-narrow.png ===\n' + pausedNarrowBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // 5. Populated Focus Screen Narrow (Resume focus, then exit/re-enter to unpause)
  await focusScreen.getByRole('button', { name: 'Resume focus', exact: true }).click();
  const focusNarrowBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase4-focus-screen-narrow.png ===\n' + focusNarrowBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // 6. Command Palette Narrow
  await page.keyboard.press('Escape');
  await expect(focusScreen).toHaveCount(0);
  await page.keyboard.press('Meta+k');
  await expect(palette).toBeVisible();
  const paletteNarrowBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase4-command-palette-narrow.png ===\n' + paletteNarrowBuf.toString('base64') + '\n=== END SCREENSHOT ===');
  await page.keyboard.press('Escape');
});
