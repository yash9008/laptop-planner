import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let app: ElectronApplication;
let page: Page;
let directory: string;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'planner-phase4-fix-review-'));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('.')], env: { ...env, TZ: 'Asia/Kolkata', LAPTOP_PLANNER_TEST_DATA_DIR: directory, LAPTOP_PLANNER_TEST_NOW: '2026-10-25T07:30:00.000Z' } });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
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

test('fix review: Navigate to Today transfers focus to a usable destination', async () => {
  await add('Today destination');
  const dialog = await palette('Navigate to Today');
  await dialog.getByRole('option', { name: /Navigate to Today/ }).click();
  const main = page.locator('main.view-day');
  await expect(main).toBeVisible();
  await expect(main.getByRole('button', { name: 'Today destination', exact: true })).toBeVisible();
  await expect.poll(() => main.evaluate(el => el.contains(document.activeElement))).toBe(true);
});

test('fix review: Navigate to Backlog transfers focus to a usable destination', async () => {
  const dialog = await palette('Navigate to Backlog');
  await dialog.getByRole('option', { name: /Navigate to Backlog/ }).click();
  const main = page.locator('main.view-backlog');
  await expect(main).toBeVisible();
  await expect(main.getByRole('button', { name: 'Add task to selected view', exact: true })).toBeVisible();
  await expect.poll(() => main.evaluate(el => el.contains(document.activeElement))).toBe(true);
});

test('fix review: direct Focus entry restores its actual trigger after an unrelated palette invocation', async () => {
  const dialog = await palette('');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open command palette', exact: true })).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Open focus view', exact: true });
  await trigger.click();
  const screen = page.getByTestId('focus-screen');
  await expect(screen).toBeVisible();
  await screen.getByRole('button', { name: 'Exit Focus view', exact: true }).click();
  await expect(screen).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('fix review: Focus round trip preserves vertical task-list scroll in a board column', async () => {
  await page.evaluate(async () => {
    for (let index = 0; index < 20; index++) {
      const result = await window.planner.saveTask({
        id: crypto.randomUUID(), create: true, title: `Scroll task ${index}`,
        notes: '', plannedDate: '2026-10-25', plannedMinutes: 5, viewDate: '2026-10-25',
      });
      if (!result.ok) throw new Error(result.error.message);
    }
    window.dispatchEvent(new Event('focus'));
  });
  const column = page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  await expect(column.getByTestId('board-task')).toHaveCount(20);
  const list = column.locator('.board-task-list');
  await expect.poll(() => list.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(300);
  await list.evaluate(el => { el.scrollTop = 300; });
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(300);
  const before = await list.evaluate(el => el.scrollTop);
  await page.getByRole('button', { name: 'Open focus view', exact: true }).click();
  const screen = page.getByTestId('focus-screen');
  await expect(screen).toBeVisible();
  await screen.getByRole('button', { name: 'Exit Focus view', exact: true }).click();
  await expect(list).toBeVisible();
  const after = await list.evaluate(el => el.scrollTop);
  console.log('PHASE4_VERTICAL_SCROLL', { before, after });
  expect(after).toBe(before);
});

test('fix review: Search state and persisted paused timer survive a Focus round trip', async () => {
  const task = await add('Paused continuity task');
  await page.evaluate(async id => {
    const started = await window.planner.startFocus({ id, viewDate: '2026-10-25' });
    if (!started.ok) throw new Error(started.error.message);
    const paused = await window.planner.pauseFocus({ id, viewDate: '2026-10-25' });
    if (!paused.ok) throw new Error(paused.error.message);
    window.dispatchEvent(new Event('focus'));
  }, task.id);
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  const search = page.getByTestId('search-panel');
  await search.getByLabel('Search all tasks').fill('Paused continuity');
  await page.getByRole('button', { name: 'Open focus view', exact: true }).click();
  const screen = page.getByTestId('focus-screen');
  await expect(screen.getByRole('button', { name: 'Resume focus', exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Exit Focus view', exact: true }).click();
  await expect(search).toBeVisible();
  await expect(search.getByLabel('Search all tasks')).toHaveValue('Paused continuity');
  const state = await page.evaluate(async () => {
    const result = await window.planner.getDay('2026-10-25');
    if (!result.ok) throw new Error(result.error.message);
    return result.value.focus;
  });
  expect(state?.taskId).toBe(task.id);
  expect(state?.running).toBe(false);
});

test('Focus retains the actual board DOM through repeated entry and exit', async () => {
  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  const original = await board.elementHandle();
  if (!original) throw new Error('Board did not mount');
  await board.evaluate(el => { el.scrollLeft = 544; });
  await expect(page.locator('.board-selected')).toHaveAttribute('data-date', '2026-10-27');
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Focus view', exact: true }).click();
    await expect(page.getByTestId('focus-screen')).toBeVisible();
    expect(await original.evaluate(el => el.isConnected)).toBe(true);
    await page.getByRole('button', { name: 'Exit Focus view', exact: true }).click();
    await expect(board).toBeVisible();
    expect(await board.evaluate((el, before) => el === before, original)).toBe(true);
    await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBe(544);
    await expect(page.locator('.board-selected')).toHaveAttribute('data-date', '2026-10-27');
    await expect(page.getByRole('button', { name: 'Focus view', exact: true })).toBeFocused();
  }
});

test('Focus preserves its Search entry owner through editing away the invoking result', async () => {
  await add('Entry needle');
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  const search = page.getByTestId('search-panel');
  await search.getByLabel('Search all tasks').fill('Entry needle');
  await search.getByRole('button', { name: 'Open Entry needle', exact: true }).focus();
  await page.keyboard.press('Meta+k');
  await page.getByRole('dialog', { name: 'Command palette', exact: true })
    .getByRole('option', { name: 'Task Focus on: "Entry needle"', exact: true }).click();
  const screen = page.getByTestId('focus-screen');
  await screen.getByRole('button', { name: 'Edit task', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await editor.getByLabel('Task title', { exact: true }).fill('Renamed outside query');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(screen.getByRole('button', { name: 'Edit task', exact: true })).toBeFocused();
  await screen.getByRole('button', { name: 'Exit Focus view', exact: true }).click();
  await expect(search.getByTestId('search-result-item')).toHaveCount(0);
  await expect(search.getByLabel('Search all tasks')).toHaveValue('Entry needle');
  await expect(search.getByLabel('Search all tasks')).toBeFocused();
});

