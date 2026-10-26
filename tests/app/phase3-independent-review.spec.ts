import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let app: ElectronApplication;
let page: Page;
let directory: string;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'planner-phase3-independent-review-'));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({args: [resolve('.')], env: {...env, TZ: 'Asia/Kolkata', LAPTOP_PLANNER_TEST_DATA_DIR: directory, LAPTOP_PLANNER_TEST_NOW: '2026-10-25T07:30:00.000Z'}});
  page = await app.firstWindow();
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.setViewportSize({width: 1440, height: 900});
  await expect(page.getByRole('button', {name: 'Add task', exact: true})).toBeEnabled();
});

test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) {
    console.log('INDEPENDENT_REVIEW_FOCUS', await page.evaluate(() => {
      const el = document.activeElement;
      return {tag: el?.tagName, label: el?.getAttribute('aria-label'), text: el?.textContent?.slice(0, 100), inSearch: Boolean(el?.closest('[data-testid="search-panel"]')), inBacklog: Boolean(el?.closest('[data-testid="backlog-panel"]'))};
    }).catch(() => null));
  }
  await app?.close();
  await rm(directory, {recursive: true, force: true});
});

async function add(title: string, plannedDate: string | null = '2026-10-25') {
  return page.evaluate(async ({title, plannedDate}) => {
    const result = await window.planner.saveTask({id: crypto.randomUUID(), create: true, title, notes: '', plannedDate, plannedMinutes: 30, viewDate: '2026-10-25'});
    if (!result.ok) throw new Error(result.error.message);
    return result.value.allTasks.find(task => task.title === title)!;
  }, {title, plannedDate});
}

async function snapshot() {
  return page.evaluate(async () => {
    const result = await window.planner.getDay('2026-10-25');
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  });
}

test('independent: a renamed search result that leaves the query restores focus inside Search', async () => {
  await add('Needle source');
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  const panel = page.getByTestId('search-panel');
  await panel.getByLabel('Search all tasks').fill('Needle');
  await panel.getByRole('button', {name: 'Open Needle source', exact: true}).click();
  const editor = page.getByRole('dialog', {name: 'Edit task', exact: true});
  await editor.getByLabel('Task title', {exact: true}).fill('Different title');
  await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  await expect(editor).toHaveCount(0);
  await expect(panel.getByTestId('search-result-item')).toHaveCount(0);
  await expect(panel.getByLabel('Search all tasks')).toHaveValue('Needle');
  console.log('SEARCH_RENAME_FOCUS', await page.evaluate(() => ({tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.slice(0, 80)})));
  await expect.poll(() => panel.evaluate(host => host.contains(document.activeElement))).toBe(true);
});

test('independent: backlog panel native drop honors the hovered insertion point', async () => {
  await add('Alpha destination');
  await add('Beta destination');
  const incoming = await add('Incoming backlog', null);
  await page.getByRole('button', {name: 'Open backlog panel', exact: true}).click();
  const source = page.getByTestId('backlog-panel').getByRole('button', {name: 'Incoming backlog', exact: true});
  const target = page.locator('[data-testid="board-day"][data-date="2026-10-25"]').getByRole('button', {name: 'Alpha destination', exact: true});
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, {steps: 4});
  await page.mouse.move(to.x + to.width / 2, to.y + 2, {steps: 12});
  await page.mouse.move(to.x + to.width / 2 + 1, to.y + 2);
  console.log('BACKLOG_INSERTION_PREVIEW_COUNT', await page.getByTestId('board-drop-placeholder').count());
  await page.mouse.up();
  await expect.poll(async () => (await snapshot()).allTasks.find(task => task.id === incoming.id)?.plannedDate).toBe('2026-10-25');
  const order = (await snapshot()).tasks.map(task => task.title);
  console.log('BACKLOG_DROP_ORDER', order);
  expect(order).toEqual(['Incoming backlog', 'Alpha destination', 'Beta destination']);
});

test('independent: status filtering keeps the underlying completion summary', async () => {
  const completed = await add('Completed task');
  await add('Incomplete task');
  await page.evaluate(async id => {
    const result = await window.planner.setTaskCompleted({id, completed: true, viewDate: '2026-10-25'});
    if (!result.ok) throw new Error(result.error.message);
  }, completed.id);
  await page.getByRole('button', {name: 'Today view', exact: true}).click();
  await expect(page.locator('.completion-count')).toHaveText('1 of 2 done');
  await page.getByRole('button', {name: 'Filter tasks', exact: true}).click();
  await page.getByRole('dialog', {name: 'Filter tasks', exact: true}).getByRole('button', {name: 'Completed', exact: true}).click();
  await page.keyboard.press('Escape');
  console.log('FILTER_COMPLETION_SUMMARY', await page.locator('.completion-count').innerText());
  await expect(page.locator('.completion-count')).toHaveText('1 of 2 done');
});

test('independent: reduced motion disables the new rail, filter, and search transitions', async () => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await add('Motion result');
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  await page.getByLabel('Search all tasks').fill('Motion');
  await expect(page.getByTestId('search-result-item')).toHaveCount(1);
  await page.getByRole('button', {name: 'Filter tasks', exact: true}).click();
  const styles = await page.evaluate(() => ['.rail-button', '.filter-segment', '.search-result-item'].map(selector => {
    const el = document.querySelector(selector)!;
    const style = getComputedStyle(el);
    return {selector, duration: style.transitionDuration, property: style.transitionProperty};
  }));
  console.log('REDUCED_MOTION_TRANSITIONS', styles);
  expect(styles.every(item => item.duration.split(',').every(value => parseFloat(value) === 0))).toBe(true);
});

test('independent: closing Search returns keyboard focus to its rail trigger', async () => {
  const rail = page.getByRole('button', {name: 'Open search panel', exact: true});
  await rail.click();
  await expect(page.getByLabel('Search all tasks')).toBeFocused();
  await page.getByRole('button', {name: 'Close search panel', exact: true}).click();
  await expect(page.getByTestId('search-panel')).toHaveCount(0);
  await expect(rail).toBeFocused();
});

test('independent: a failed search edit retains the draft and can be retried', async () => {
  await add('Retry source');
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  const panel = page.getByTestId('search-panel');
  await panel.getByLabel('Search all tasks').fill('Retry');
  await panel.getByRole('button', {name: 'Open Retry source', exact: true}).click();
  const editor = page.getByRole('dialog', {name: 'Edit task', exact: true});
  await editor.getByLabel('Notes', {exact: true}).fill('Kept after a failed write');
  await app.evaluate(({ipcMain}) => {
    const handlers = (ipcMain as unknown as {_invokeHandlers: Map<string, Function>})._invokeHandlers;
    const original = handlers.get('planner:save-task')!;
    let fail = true;
    ipcMain.removeHandler('planner:save-task');
    ipcMain.handle('planner:save-task', async (event, input) => {
      if (fail) { fail = false; return {ok: false, error: {code: 'SAVE_FAILED', message: 'Independent review simulated disk failure'}}; }
      return original(event, input);
    });
  });
  await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  await expect(editor.getByRole('alert')).toContainText('simulated disk failure');
  await expect(editor.getByLabel('Notes', {exact: true})).toHaveValue('Kept after a failed write');
  expect((await snapshot()).tasks[0]!.notes).toBe('');
  await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  await expect(editor).toHaveCount(0);
  await expect(panel.getByLabel('Search all tasks')).toHaveValue('Retry');
  await expect(panel.getByRole('button', {name: 'Open Retry source', exact: true})).toBeFocused();
  expect((await snapshot()).tasks[0]!.notes).toBe('Kept after a failed write');
});

test('independent: Recovery and storage remain reachable with no day snapshot', async () => {
  await app.evaluate(({ipcMain}) => {
    ipcMain.removeHandler('planner:get-day');
    ipcMain.handle('planner:get-day', () => ({ok: false, error: {code: 'STORAGE_UNAVAILABLE', message: 'Independent review simulated read failure'}}));
  });
  await page.reload();
  await expect(page.locator('.error-banner')).toContainText('simulated read failure');
  await page.getByRole('button', {name: 'Open recovery panel', exact: true}).click();
  const panel = page.getByTestId('recovery-panel');
  await expect(panel.getByRole('alert')).toContainText('simulated read failure');
  await panel.getByRole('button', {name: 'Open storage tools', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Local storage', exact: true})).toBeVisible();
});

test('independent: panel switching preserves a hidden calendar and panned board', async () => {
  await add('Continuity source');
  await page.getByRole('button', {name: 'Hide calendar', exact: true}).click();
  const board = page.getByRole('region', {name: 'Multi-day board', exact: true});
  await board.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Go to date', {exact: true})).toHaveValue('2026-10-26');
  await expect.poll(async () => board.evaluate(host => host.scrollLeft)).toBeCloseTo(272, 0);
  const before = await board.evaluate(host => {host.dataset.independentReviewIdentity = 'same-node'; return host.scrollLeft;});
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  await page.getByLabel('Search all tasks').fill('Continuity');
  await page.getByRole('button', {name: 'Open recovery panel', exact: true}).click();
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  await expect(page.getByLabel('Search all tasks')).toHaveValue('Continuity');
  await page.getByRole('button', {name: 'Close search panel', exact: true}).click();
  await expect(page.locator('.calendar-panel')).toHaveCount(0);
  expect(await board.getAttribute('data-independent-review-identity')).toBe('same-node');
  expect(await board.evaluate(host => host.scrollLeft)).toBeCloseTo(before, 0);
  await expect(page.getByLabel('Go to date', {exact: true})).toHaveValue('2026-10-26');
});

test('independent: closing Backlog and Recovery panels restores focus to their respective rail triggers', async () => {
  const backlogRail = page.getByRole('button', {name: 'Open backlog panel', exact: true});
  await backlogRail.click();
  await expect(page.getByTestId('backlog-panel')).toBeVisible();
  await page.getByRole('button', {name: 'Close backlog panel', exact: true}).click();
  await expect(page.getByTestId('backlog-panel')).toHaveCount(0);
  await expect(backlogRail).toBeFocused();

  const recoveryRail = page.getByRole('button', {name: 'Open recovery panel', exact: true});
  await recoveryRail.click();
  await expect(page.getByTestId('recovery-panel')).toBeVisible();
  await page.getByRole('button', {name: 'Close recovery panel', exact: true}).click();
  await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
  await expect(recoveryRail).toBeFocused();
});

test('independent: search focus falls back to remaining search result when an edit removes a match', async () => {
  await add('Findable One');
  await add('Findable Two');
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  const panel = page.getByTestId('search-panel');
  await panel.getByLabel('Search all tasks').fill('Findable');
  await expect(panel.getByTestId('search-result-item')).toHaveCount(2);

  await panel.getByRole('button', {name: 'Open Findable One', exact: true}).click();
  const editor = page.getByRole('dialog', {name: 'Edit task', exact: true});
  await editor.getByLabel('Task title', {exact: true}).fill('NoMatch Title');
  await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
  await expect(editor).toHaveCount(0);

  // Result count is now 1 (only Findable Two remains)
  await expect(panel.getByTestId('search-result-item')).toHaveCount(1);
  const remainingResultBtn = panel.getByRole('button', {name: 'Open Findable Two', exact: true});
  await expect(remainingResultBtn).toBeVisible();
  await expect(remainingResultBtn).toBeFocused();
});

test('independent: backlog panel drag cancellation via Escape restores original state without moving', async () => {
  await add('Existing board task');
  const incoming = await add('Incoming backlog cancel', null);
  await page.getByRole('button', {name: 'Open backlog panel', exact: true}).click();
  const source = page.getByTestId('backlog-panel').getByRole('button', {name: 'Incoming backlog cancel', exact: true});
  const target = page.locator('[data-testid="board-day"][data-date="2026-10-25"]').getByRole('button', {name: 'Existing board task', exact: true});

  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, {steps: 4});
  await page.mouse.move(to.x + to.width / 2, to.y + 2, {steps: 12});
  await expect(page.getByTestId('board-drop-placeholder')).toBeVisible();

  // Press Escape to cancel drag
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);

  // Verify task was not moved
  const snap = await snapshot();
  const task = snap.allTasks.find((t) => t.id === incoming.id);
  expect(task?.plannedDate).toBeNull();
});

test('independent: panel-source insertion rolls back gracefully on simulated move failure', async () => {
  await add('Existing task target');
  const incoming = await add('Failing backlog task', null);
  await page.getByRole('button', {name: 'Open backlog panel', exact: true}).click();
  const source = page.getByTestId('backlog-panel').getByRole('button', {name: 'Failing backlog task', exact: true});
  const target = page.locator('[data-testid="board-day"][data-date="2026-10-25"]').getByRole('button', {name: 'Existing task target', exact: true});

  await app.evaluate(({ipcMain}) => {
    ipcMain.removeHandler('planner:move-task');
    ipcMain.handle('planner:move-task', async () => {
      return {ok: false, error: {code: 'MOVE_FAILED', message: 'Simulated disk write failure'}};
    });
  });

  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, {steps: 4});
  await page.mouse.move(to.x + to.width / 2, to.y + 2, {steps: 12});
  await page.mouse.up();

  // Placeholder is removed and task remains in backlog
  await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);
  const snap = await snapshot();
  const task = snap.allTasks.find((t) => t.id === incoming.id);
  expect(task?.plannedDate).toBeNull();
});
