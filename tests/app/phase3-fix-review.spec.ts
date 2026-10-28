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
  await expect(page.getByRole('button', {name: /^Add task for /}).first()).toBeEnabled();
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

test('re-review: quick-add returns focus to its own trigger after editing a search result', async () => {
  await add('Findable task');
  await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
  const panel = page.getByTestId('search-panel');
  await panel.getByLabel('Search all tasks').fill('Findable');
  await panel.getByRole('button', {name: 'Open Findable task', exact: true}).click();
  const editor = page.getByRole('dialog', {name: 'Edit task', exact: true});
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(panel.getByRole('button', {name: 'Open Findable task', exact: true})).toBeFocused();

  const addButton = page.getByRole('button', {name: /^Add task for /}).first();
  await addButton.click();
  const composer = page.getByRole('dialog', {name: 'New task', exact: true});
  await expect(composer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(composer).toHaveCount(0);
  await expect(addButton).toBeFocused();
});

for (const viaMenu of [false, true]) {
  test(`re-review: scheduling the last Backlog task preserves panel focus (${viaMenu ? 'menu' : 'title'})`, async () => {
    const task = await add('Only backlog task', null);
    await page.getByRole('button', {name: 'Open backlog panel', exact: true}).click();
    const panel = page.getByTestId('backlog-panel');
    if (viaMenu) {
      await panel.getByRole('button', {name: 'More actions for Only backlog task', exact: true}).click();
      await page.getByRole('menuitem', {name: 'Edit task', exact: true}).click();
    } else {
      await panel.getByRole('button', {name: 'Only backlog task', exact: true}).click();
    }
    const editor = page.getByRole('dialog', {name: 'Edit task', exact: true});
    await editor.getByLabel('Keep in backlog', {exact: true}).uncheck();
    await editor.getByLabel('Day', {exact: true}).fill('2026-10-25');
    await editor.getByRole('button', {name: 'Save changes', exact: true}).click();
    await expect(editor).toHaveCount(0);
    await expect(panel.getByTestId('backlog-panel-item')).toHaveCount(0);
    expect((await snapshot()).allTasks.find(t => t.id === task.id)?.plannedDate).toBe('2026-10-25');
    await expect.poll(() => panel.evaluate(host => host.contains(document.activeElement))).toBe(true);
  });
}

for (const action of ['estimate', 'menu'] as const) {
  test(`regression: board ${action} restores its trigger after Search editing`, async () => {
    await add('Shared task');
    await page.getByRole('button', {name: 'Open search panel', exact: true}).click();
    const panel = page.getByTestId('search-panel');
    await panel.getByLabel('Search all tasks').fill('Shared');
    await panel.getByRole('button', {name: 'Open Shared task', exact: true}).click();
    await expect(page.getByRole('dialog', {name: 'Edit task', exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', {name: 'Open Shared task', exact: true})).toBeFocused();

    const column = page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
    const trigger = column.getByRole('button', {name: action === 'estimate'
      ? 'Edit duration for Shared task' : 'More actions for Shared task', exact: true});
    await trigger.click();
    const popup = action === 'estimate'
      ? page.getByRole('dialog', {name: 'Planned time presets', exact: true})
      : page.getByRole('menu', {name: 'Actions for Shared task', exact: true});
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(panel.getByLabel('Search all tasks')).toHaveValue('Shared');
  });
}

test('regression: Backlog quick-add and menu editing each retain their own trigger', async () => {
  await add('Backlog task', null);
  await page.getByRole('button', {name: 'Open backlog panel', exact: true}).click();
  const panel = page.getByTestId('backlog-panel');
  const menuTrigger = panel.getByRole('button', {name: 'More actions for Backlog task', exact: true});
  await menuTrigger.click();
  await page.getByRole('menuitem', {name: 'Edit task', exact: true}).click();
  const editor = page.getByRole('dialog', {name: 'Edit task', exact: true});
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(menuTrigger).toBeFocused();

  const addButton = panel.getByRole('button', {name: 'Add task to backlog', exact: true});
  await addButton.click();
  const composer = page.getByRole('dialog', {name: 'New task', exact: true});
  await expect(composer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(composer).toHaveCount(0);
  await expect(addButton).toBeFocused();
});

