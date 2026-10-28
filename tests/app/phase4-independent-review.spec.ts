import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let app: ElectronApplication;
let page: Page;
let directory: string;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'planner-phase4-independent-'));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('.')], env: { ...env, TZ: 'Asia/Kolkata', LAPTOP_PLANNER_TEST_DATA_DIR: directory, LAPTOP_PLANNER_TEST_NOW: '2026-10-25T07:30:00.000Z' } });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: /^Add task for / }).first()).toBeEnabled();
});

test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) {
    console.log('PHASE4_REVIEW_FOCUS', await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
      text: document.activeElement?.textContent?.slice(0, 100),
      inFocus: Boolean(document.activeElement?.closest('[data-testid="focus-screen"]')),
      inSearch: Boolean(document.activeElement?.closest('[data-testid="search-panel"]')),
      inDock: Boolean(document.activeElement?.closest('.calendar-dock')),
    })).catch(() => null));
  }
  await app?.close();
  await rm(directory, { recursive: true, force: true });
});

async function add(title: string) {
  const task = await page.evaluate(async title => {
    const result = await window.planner.saveTask({ id: crypto.randomUUID(), create: true, title, notes: '', plannedDate: '2026-10-25', plannedMinutes: 30, viewDate: '2026-10-25' });
    if (!result.ok) throw new Error(result.error.message);
    window.dispatchEvent(new Event('focus'));
    return result.value.allTasks.find(task => task.title === title)!;
  }, title);
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  return task;
}

async function palette(query: string) {
  await page.getByRole('button', { name: 'Open command palette', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await dialog.getByRole('combobox').fill(query);
  return dialog;
}

test('independent phase4: Focus exit preserves a panned board and selected calendar date', async () => {
  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  await board.evaluate(el => { el.scrollLeft = 544; });
  await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBeGreaterThan(300);
  const selected = page.locator('.board-selected');
  await expect(selected).not.toHaveAttribute('data-date', '2026-10-25');
  const before = { scroll: await board.evaluate(el => el.scrollLeft), date: await selected.getAttribute('data-date') };
  await page.getByRole('button', { name: 'Open focus view', exact: true }).click();
  await expect(page.getByTestId('focus-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Exit Focus view', exact: true }).click();
  await expect(board).toBeVisible();
  const after = { scroll: await board.evaluate(el => el.scrollLeft), date: await selected.getAttribute('data-date') };
  console.log('PHASE4_BOARD_ROUND_TRIP', { before, after });
  expect(after).toEqual(before);
});

test('independent phase4: bare F uses the latest explicitly selected task', async () => {
  await add('Alpha default');
  const beta = await add('Beta selected');
  await page.getByRole('button', { name: 'Beta selected', exact: true }).focus();
  await expect(page.locator(`[data-testid="board-task"][data-task-id="${beta.id}"]`)).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'Open command palette', exact: true }).focus();
  await page.keyboard.press('f');
  await expect(page.getByTestId('focus-title')).toHaveText('Beta selected');
});

test('independent phase4: palette navigation transfers keyboard focus into Focus', async () => {
  await add('Focus destination');
  const dialog = await palette('Navigate to Focus');
  await dialog.getByRole('option', { name: /Navigate to Focus/ }).click();
  const screen = page.getByTestId('focus-screen');
  await expect(screen).toBeVisible();
  await expect.poll(() => screen.evaluate(el => el.contains(document.activeElement))).toBe(true);
});

test('independent phase4: invisible Focus dock is excluded from sequential keyboard navigation', async () => {
  await add('Visible focus task');
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  await page.getByLabel('Search all tasks', { exact: true }).fill('Visible');
  await page.getByRole('button', { name: 'Open focus view', exact: true }).click();
  await expect(page.getByTestId('focus-screen')).toBeVisible();
  await expect(page.locator('.calendar-dock')).toHaveCSS('opacity', '0');
  await page.getByTestId('focus-screen').getByRole('button', { name: 'Edit task', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.calendar-dock')))).toBe(false);
});

test('independent phase4: help dismissal restores the palette initiating control', async () => {
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  const dialog = await palette('Show keyboard shortcuts');
  await dialog.getByRole('option', { name: /Show keyboard shortcuts/ }).click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(help.getByRole('button', { name: 'Close shortcuts dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('independent phase4: Enter on the palette close control does not execute Add task', async () => {
  const dialog = await palette('Add task');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close command palette', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open command palette', exact: true })).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
});

test('independent phase4: repeated Cmd K does not dismiss the palette', async () => {
  const dialog = await palette('');
  await dialog.getByRole('combobox').evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, repeat: true, bubbles: true, cancelable: true })));
  await expect(dialog).toBeVisible();
});

test('independent phase4: palette to Search task editor preserves Search focus ownership', async () => {
  await add('Search target');
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  const search = page.getByTestId('search-panel');
  await search.getByLabel('Search all tasks').fill('Search target');
  await search.getByRole('button', { name: 'Open Search target', exact: true }).focus();
  await page.keyboard.press('Meta+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await dialog.getByRole('option', { name: 'Task Edit task: "Search target"', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Task title', { exact: true })).toBeFocused();
  await editor.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => search.evaluate(el => el.contains(document.activeElement))).toBe(true);
});

test('related phase4: palette navigation transfers keyboard focus to Board', async () => {
  const dialog = await palette('Navigate to Board');
  await dialog.getByRole('option', { name: /Navigate to Board/ }).click();
  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  await expect(board).toBeVisible();
  await expect.poll(() => board.evaluate(el => el.contains(document.activeElement) || el === document.activeElement)).toBe(true);
});

test('related phase4: Enter on Clear query button does not execute selected command', async () => {
  const dialog = await palette('Add task');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Clear command query', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('combobox')).toHaveValue('');
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
});

test('related phase4: Focus exit via Escape preserves panned board scroll and selected date', async () => {
  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  await board.evaluate(el => { el.scrollLeft = 544; });
  await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBeGreaterThan(300);
  const selected = page.locator('.board-selected');
  const before = { scroll: await board.evaluate(el => el.scrollLeft), date: await selected.getAttribute('data-date') };
  await page.keyboard.press('f');
  await expect(page.getByTestId('focus-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(board).toBeVisible();
  const after = { scroll: await board.evaluate(el => el.scrollLeft), date: await selected.getAttribute('data-date') };
  expect(after).toEqual(before);
});

test('related phase4: palette to Backlog task editor preserves Backlog focus ownership', async () => {
  await page.evaluate(async () => {
    const res = await window.planner.saveTask({
      id: crypto.randomUUID(),
      create: true,
      title: 'Backlog target',
      notes: '',
      plannedDate: null,
      plannedMinutes: 30,
      viewDate: '2026-10-25',
    });
    if (!res.ok) throw new Error(res.error.message);
    window.dispatchEvent(new Event('focus'));
  });
  await page.getByRole('button', { name: 'Open backlog panel', exact: true }).click();
  const backlog = page.getByTestId('backlog-panel');
  await expect(backlog).toBeVisible();
  const taskBtn = backlog.getByRole('button', { name: 'Backlog target', exact: true });
  await taskBtn.focus();
  await page.keyboard.press('Meta+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await dialog.getByRole('option', { name: 'Task Edit task: "Backlog target"', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Task title', { exact: true })).toBeFocused();
  await editor.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => backlog.evaluate(el => el.contains(document.activeElement))).toBe(true);
});
