import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'laptop-planner-phase45-fix-'));
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
      LAPTOP_PLANNER_TEST_NOW: new Date(Date.parse('2026-10-25T07:30:00.000Z')).toISOString(),
    },
  });
  page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
});

test.afterEach(async () => {
  await application?.close();
  application = undefined;
  await rm(directory, { recursive: true, force: true });
});

async function addTask(title: string, estimate = '45m', plannedDate: string | null = '2026-10-25') {
  return page.evaluate(
    async ({ title, estimate, plannedDate }) => {
      const day = await window.planner.getDay();
      if (!day.ok) throw new Error(day.error.message);
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

test('palette task commands follow the focused task after Focus navigation', async () => {
  await addTask('Alpha Task');
  await addTask('Beta Task');
  await expect(page.getByRole('button', { name: 'Alpha Task', exact: true })).toBeVisible();

  await page.getByRole('region', { name: 'Multi-day board', exact: true }).focus();
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Alpha Task');

  await page.getByRole('button', { name: 'Next focus task', exact: true }).click();
  await expect(focusScreen.getByTestId('focus-title')).toHaveText('Beta Task');

  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('option', { name: /Edit task: "Beta Task"/ })).toBeVisible();
  await expect(palette.getByRole('option', { name: /Edit task: "Alpha Task"/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('question mark opens keyboard help and Escape returns focus to the workspace', async () => {
  await addTask('Help Shortcut Task');
  await expect(page.getByRole('button', { name: 'Help Shortcut Task', exact: true })).toBeVisible();

  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  await board.focus();
  await page.keyboard.type('?');

  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(help).toBeVisible();

  await page.getByRole('button', { name: 'Close shortcuts dialog', exact: true }).click();
  await expect(help).toHaveCount(0);
  await expect(board).toBeFocused();
});

test('calendar command releases a docked utility panel', async () => {
  await addTask('Calendar Command Task');
  await page.getByRole('button', { name: 'Open backlog panel', exact: true }).click();
  await expect(page.getByTestId('backlog-panel')).toBeVisible();

  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  await expect(palette).toBeVisible();
  await palette.getByRole('option', { name: /Show calendar/ }).click();

  await expect(page.getByTestId('backlog-panel')).toHaveCount(0);
  await expect(page.locator('.calendar-dock .calendar-panel')).toBeVisible();
});

test('backlog panel focuses the top backlog task when opened', async () => {
  await addTask('Backlog First', '30m', null);
  await addTask('Backlog Second', '30m', null);
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open backlog panel', exact: true }).click();
  const panel = page.getByTestId('backlog-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.task-title').first()).toBeFocused();
  await expect(panel.locator('.task-title').first()).toHaveText('Backlog First');
});
