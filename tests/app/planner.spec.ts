import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;
async function launch() {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [resolve('.')], env: { ...env, TZ: 'Asia/Kolkata', LAPTOP_PLANNER_TEST_DATA_DIR: directory, LAPTOP_PLANNER_TEST_NOW: '2026-10-25T01:30:00.000Z' } });
  page = await application.firstWindow();
  await expect(page.getByRole('button', { name: /^Add task for / }).first()).toBeEnabled();
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();
}
test.beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'laptop-planner-ui-')); await launch(); });
test.afterEach(async () => { await application?.close(); application = undefined; await rm(directory, { recursive: true, force: true }); });

async function add(title: string, estimate: string, notes = '') {
  await page.keyboard.press('a');
  const form = page.getByRole('dialog', { name: 'New task', exact: true });
  await form.getByLabel('Task title', { exact: true }).fill(title);
  await form.getByLabel('Estimated time', { exact: true }).fill(estimate);
  if (notes) {
    await form.getByRole('button', { name: 'Open full details', exact: true }).click();
    await form.getByLabel('Notes', { exact: true }).fill(notes);
  }
  await form.getByRole('button', { name: 'Add to day', exact: true }).click();
  await expect(form).not.toBeVisible();
}
function pendingCards() { return page.locator('[data-testid="task-card"][data-completed="false"]'); }

test('the four-task example creates real cards, 270 minutes of calendar blocks, and the correct summary', async () => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await add('Typing', '45m');
  await add('Project bug review', '1h', 'Review the bugs before the presentation.');
  await add('The Odin Project', '2h');
  await add('Learn Aerospace', '45m');
  await expect(pendingCards()).toHaveCount(4);
  await expect(page.getByTestId('calendar-block')).toHaveCount(4);
  await expect(page.getByTestId('planned-total')).toHaveText('4h 30m');
  await expect(page.getByTestId('scheduled-total')).toHaveText('4h 30m');
  await expect(page.getByTestId('free-total')).toHaveText('10h 30m');
  await expect(page.getByTestId('unscheduled-total')).toHaveText('0m');
  const snapshot = await page.evaluate(() => window.planner.getDay());
  expect(snapshot.ok && snapshot.value.plan.summary.scheduledMinutes).toBe(270);
  const first = await page.getByTestId('calendar-block').first().boundingBox();
  expect(first!.height).toBeCloseTo(36, 0); // The rendered 45-minute height, not just a DOM placeholder.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/planner.png' });
});

test('editing a calendar block updates its task title, notes, estimate, and calendar', async () => {
  await add('Project', '1h');
  await page.getByTestId('calendar-block').click();
  const form = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await form.getByLabel('Task title', { exact: true }).fill('Review project bugs');
  await form.getByLabel('Estimated time', { exact: true }).fill('1h 30m');
  await form.getByLabel('Notes', { exact: true }).fill('Start with the scheduling bug.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Review project bugs', exact: true })).toBeVisible();
  await expect(page.getByTestId('planned-total')).toHaveText('1h 30m');
  await expect(page.getByTestId('calendar-block')).toHaveAccessibleName('Review project bugs, 7:00 AM to 8:30 AM');
  await expect(page.getByText('Start with the scheduling bug.', { exact: true })).toBeVisible();
});

test('completing and reopening a task updates cards, progress, and the flexible calendar', async () => {
  await add('Typing', '45m');
  await page.getByRole('checkbox', { name: 'Complete Typing', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Reopen Typing', exact: true })).toBeChecked();
  await expect(page.getByText('1 of 1 done', { exact: true })).toBeVisible();
  await expect(page.getByTestId('calendar-block')).toHaveCount(0);
  await expect(page.getByTestId('scheduled-total')).toHaveText('0m');
  await page.getByRole('checkbox', { name: 'Reopen Typing', exact: true }).click();
  await expect(page.getByTestId('calendar-block')).toHaveCount(1);
  await expect(page.getByTestId('scheduled-total')).toHaveText('45m');
});

test('deleting offers Undo and restores the same task and calendar block', async () => {
  await add('Typing', '45m');
  const original = await page.getByTestId('task-card').getAttribute('data-task-id');
  await page.getByRole('button', { name: 'Delete Typing', exact: true }).click();
  await expect(page.getByTestId('task-card')).toHaveCount(0);
  await expect(page.getByTestId('calendar-block')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('task-card')).toHaveAttribute('data-task-id', original!);
  await expect(page.getByTestId('calendar-block')).toHaveCount(1);
});

test('up/down ordering changes both card order and calendar priority', async () => {
  await add('Typing', '45m'); await add('Project', '1h');
  await page.getByRole('button', { name: 'Move Project up', exact: true }).click();
  await expect(pendingCards().first().getByRole('button', { name: 'Project', exact: true })).toBeVisible();
  await expect(page.getByTestId('calendar-block').first()).toHaveAccessibleName('Project, 7:00 AM to 8:00 AM');
  await page.getByRole('button', { name: 'Move Project down', exact: true }).click();
  await expect(pendingCards().first().getByRole('button', { name: 'Typing', exact: true })).toBeVisible();
});

test('dragging the task handle reorders cards and their scheduled blocks', async () => {
  await add('Typing', '45m'); await add('Project', '1h');
  await page.getByRole('button', { name: 'Drag Project to reorder', exact: true }).dragTo(pendingCards().first());
  await expect(pendingCards().first().getByRole('button', { name: 'Project', exact: true })).toBeVisible();
  await expect(page.getByTestId('calendar-block').first()).toHaveAccessibleName('Project, 7:00 AM to 8:00 AM');
});

test('overflow appears on the card and daily summary rather than spilling into tomorrow', async () => {
  await add('Long project', '16h');
  await expect(page.getByTestId('scheduled-total')).toHaveText('15h');
  await expect(page.getByTestId('unscheduled-total')).toHaveText('1h');
  await expect(page.getByText('1h won’t fit in this day', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tomorrow', exact: true })).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(0);
});

test('date navigation and moving a task keep each day separate and persist after app restart', async () => {
  await add('Project review', '1h');
  await page.getByRole('button', { name: 'Project review', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Day', { exact: true }).fill('2026-10-26');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('task-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByTestId('calendar-block')).toHaveAccessibleName('Project review, 6:00 AM to 7:00 AM');
  await application!.close(); application = undefined; await launch();
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Project review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Daily planner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(0);
});

test('invalid estimates keep the draft open and untrusted IPC fields cannot write data', async () => {
  await page.keyboard.press('a');
  await page.getByLabel('Task title', { exact: true }).fill('Keep my draft');
  await page.getByLabel('Estimated time', { exact: true }).fill('not a duration');
  await page.getByRole('button', { name: 'Add to day', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('positive duration');
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Keep my draft');
  const result = await page.evaluate(() => window.planner.saveTask({ title: 'Invalid', notes: '', plannedDate: '2026-10-25', plannedMinutes: -5, viewDate: '2026-10-25' }));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  const snapshot = await page.evaluate(() => window.planner.getDay());
  expect(snapshot.ok && snapshot.value.tasks.length).toBe(0);
});

test('task text renders literally without creating HTML or executing scripts', async () => {
  const title = '<img src=x onerror=alert(1)>';
  await add(title, '45m', '<script>window.bad = true</script>');
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  expect(await page.locator('.task-card img, .task-card script').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).bad)).toBeUndefined();
});
