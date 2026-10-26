import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let testDirectory: string;

async function launch(directory: string): Promise<ElectronApplication> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [resolve('.')], env: { ...env, TZ: 'Asia/Kolkata', LAPTOP_PLANNER_TEST_DATA_DIR: directory, LAPTOP_PLANNER_TEST_NOW: '2026-10-25T01:30:00.000Z' } });
  return application;
}

test.beforeEach(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), 'laptop-planner-app-'));
});
test.afterEach(async () => {
  await application?.close();
  application = undefined;
  await rm(testDirectory, { recursive: true, force: true });
});

test('opens the offline daily planner and retains real storage status in the sidebar', async () => {
  const app = await launch(testDirectory);
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What deserves your time?' })).toBeVisible();
  await page.screenshot({ path: 'test-results/planner-empty.png' });
  await page.getByRole('button', { name: 'Local storage', exact: true }).click();
  const storage = page.getByRole('dialog', { name: 'Local storage', exact: true });
  await expect(page.getByTestId('database-path')).toHaveText(join(testDirectory, 'planner.sqlite'));
  await expect(page.getByTestId('database-version')).toContainText('Schema 4 · SQLite 3.');
  await storage.getByText('Storage details',{exact:true}).click();
  await expect(page.getByText('6:00 AM – 10:00 PM', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(storage.getByRole('status')).toHaveText('CONNECTED');
  expect(errors).toEqual([]);
});

test('keeps Node and raw IPC out of the renderer and enables isolation and sandboxing', async () => {
  const app = await launch(testDirectory);
  const page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
  const surface = await page.evaluate(() => ({
    bridgeKeys: Object.keys(window.planner),
    nodeRequire: typeof (window as unknown as Record<string, unknown>).require,
    nodeProcess: typeof (window as unknown as Record<string, unknown>).process,
    electron: typeof (window as unknown as Record<string, unknown>).electron,
  }));
  expect(surface).toEqual({ bridgeKeys: ['getFoundationStatus', 'saveSettings', 'createBackup', 'restoreBackup', 'getDay', 'saveTask', 'setTaskCompleted', 'deleteTask', 'restoreTask', 'reorderTasks', 'moveTask', 'saveEvent', 'deleteEvent', 'saveProject', 'startFocus', 'pauseFocus', 'onPlannerChanged'], nodeRequire: 'undefined', nodeProcess: 'undefined', electron: 'undefined' });
  // Observe the running renderer's OS sandbox rather than merely reading config.
  const rendererSandboxes = await app.evaluate(({ app }) => app.getAppMetrics()
    .filter((metric) => metric.type === 'Tab').map((metric) => metric.sandboxed));
  expect(rendererSandboxes.length).toBeGreaterThan(0);
  expect(rendererSandboxes.every(Boolean)).toBe(true);
});

test('blocks renderer fetches, native-session network requests, and new windows', async () => {
  const app = await launch(testDirectory);
  const page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
  const networkUrls: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) networkUrls.push(request.url()); });
  const result = await page.evaluate(async () => {
    let fetchBlocked = false;
    try { await fetch('https://planner-network-test.invalid/blocked'); } catch { fetchBlocked = true; }
    const popup = window.open('https://planner-network-test.invalid/popup');
    return { fetchBlocked, popupBlocked: popup === null };
  });
  expect(result).toEqual({ fetchBlocked: true, popupBlocked: true });
  expect(networkUrls).toEqual([]);
  const nativeRequestBlocked = await app.evaluate(async ({ net }) => {
    try { await net.fetch('https://planner-network-test.invalid/blocked'); return false; }
    catch { return true; }
  });
  expect(nativeRequestBlocked).toBe(true);
  expect(app.windows()).toHaveLength(1);
});

test('reopens the same database after an actual app restart', async () => {
  let app = await launch(testDirectory);
  let page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
  const first = await page.evaluate(() => window.planner.getFoundationStatus());
  await app.close();
  application = undefined;
  app = await launch(testDirectory);
  page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
  const second = await page.evaluate(() => window.planner.getFoundationStatus());
  expect(second).toEqual(first);
});

test('shows a readable storage error instead of resetting data or crashing', async () => {
  // An existing non-SQLite file makes initialization fail deterministically.
  const path = join(testDirectory, 'planner.sqlite');
  await writeFile(path, 'keep this original file');
  const app = await launch(testDirectory);
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Storage needs attention' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your existing data has not been reset.');
  await page.getByRole('button', { name: 'Refresh day' }).click();
  await expect(page.getByRole('heading', { name: 'Storage needs attention' })).toBeVisible();
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(path, 'utf8')).toBe('keep this original file');
});
