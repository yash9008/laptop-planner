import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'laptop-planner-phase2-'));
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
      LAPTOP_PLANNER_TEST_NOW: '2026-10-25T07:30:00.000Z',
    },
  });
  page = await application.firstWindow();
  await expect(page.getByRole('button', { name: /^Add task for / }).first()).toBeEnabled();
});

test.afterEach(async () => {
  await application?.close();
  application = undefined;
  await rm(directory, { recursive: true, force: true });
});

async function snapshot() {
  return page.evaluate(async () => {
    const result = await window.planner.getDay();
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  });
}

test('quick-add composer opens, handles date/project defaults, enforces validation, retains drafts on Escape, and discards explicitly', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Press 'A' to open quick-add composer
  await page.keyboard.press('a');
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(composer).toBeVisible();

  // Initial title input focused, estimate empty
  await expect(composer.getByLabel('Task title', { exact: true })).toBeFocused();
  await expect(composer.getByLabel('Estimated time', { exact: true })).toHaveValue('');

  // 2. Inline validation: Enter without estimate does not submit and shows error without losing title
  await composer.getByLabel('Task title', { exact: true }).fill('Draft task');
  await page.keyboard.press('Enter');
  await expect(composer.getByRole('alert')).toContainText('positive duration');
  await expect(composer.getByLabel('Task title', { exact: true })).toHaveValue('Draft task');

  // Verify no task was created
  let data = await snapshot();
  expect(data.tasks).toHaveLength(0);

  // 3. Close with Escape: retains draft in renderer memory
  await page.keyboard.press('Escape');
  await expect(composer).not.toBeVisible();
  data = await snapshot();
  expect(data.tasks).toHaveLength(0);

  // Reopen with 'A': restores draft
  await page.keyboard.press('a');
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel('Task title', { exact: true })).toHaveValue('Draft task');

  // 4. Outside click: clicking backdrop dismisses without creating a task
  await composer.getByLabel('Estimated time', { exact: true }).fill('30m');
  await page.mouse.click(50, 50); // Click outside composer
  await expect(composer).not.toBeVisible();
  data = await snapshot();
  expect(data.tasks).toHaveLength(0);

  // Reopen and check explicit Discard
  await page.keyboard.press('a');
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel('Task title', { exact: true })).toHaveValue('Draft task');
  await expect(composer.getByLabel('Estimated time', { exact: true })).toHaveValue('30m');

  await composer.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(composer).not.toBeVisible();

  // Reopen after discard: fresh empty draft
  await page.keyboard.press('a');
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel('Task title', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
});

test('creation handoff transfers uncommitted draft to full details and back without creating a record', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Open quick add
  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Transferred item');
  await composer.getByLabel('Estimated time', { exact: true }).fill('1h 15m');

  // Click Full details
  await composer.getByRole('button', { name: 'Open full details', exact: true }).click();

  // Now the centered editor is open with title "New task"
  const editor = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Task title', { exact: true })).toHaveValue('Transferred item');
  await expect(editor.getByLabel('Estimated time', { exact: true })).toHaveValue('1h 15m');

  // Add notes and deadline in full details
  await editor.getByLabel('Notes', { exact: true }).fill('Important meeting prep notes.');
  await editor.getByLabel('Task deadline', { exact: true }).fill('2026-10-30');

  // Verify no record created yet
  let data = await snapshot();
  expect(data.tasks).toHaveLength(0);

  // Close editor via Cancel button
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).not.toBeVisible();

  // Reopen with 'A': returns to quick add with the transferred title & estimate
  await page.keyboard.press('a');
  composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(composer.getByLabel('Task title', { exact: true })).toHaveValue('Transferred item');
  await expect(composer.getByLabel('Estimated time', { exact: true })).toHaveValue('1h 15m');

  // Re-open full details: notes and deadline were preserved
  await composer.getByRole('button', { name: 'Open full details', exact: true }).click();
  await expect(editor.getByLabel('Notes', { exact: true })).toHaveValue('Important meeting prep notes.');
  await expect(editor.getByLabel('Task deadline', { exact: true })).toHaveValue('2026-10-30');

  // Now save from full details
  await editor.getByRole('button', { name: 'Add to day', exact: true }).click();
  await expect(editor).not.toBeVisible();

  data = await snapshot();
  expect(data.tasks).toHaveLength(1);
  expect(data.tasks[0]!.title).toBe('Transferred item');
  expect(data.tasks[0]!.notes).toBe('Important meeting prep notes.');
  expect(data.tasks[0]!.deadline).toBe('2026-10-30');
  expect(data.tasks[0]!.plannedMinutes).toBe(75);
});

test('centered task editor opens on task click, retains uncommitted draft on dismissal, and supports discard', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create a task
  await page.keyboard.press('a');
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Original title');
  await composer.getByLabel('Estimated time', { exact: true }).fill('45m');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();
  await expect(composer).not.toBeVisible();

  // Click task title to open centered editor
  await page.getByRole('button', { name: 'Original title', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  // Modify title and notes without saving
  await editor.getByLabel('Task title', { exact: true }).fill('Edited title draft');
  await editor.getByLabel('Notes', { exact: true }).fill('Uncommitted note.');

  // Press Escape to dismiss
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();

  // Storage remains unmodified
  let data = await snapshot();
  expect(data.tasks[0]!.title).toBe('Original title');

  // Reopen task: draft is restored
  await page.getByRole('button', { name: 'Original title', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Task title', { exact: true })).toHaveValue('Edited title draft');
  await expect(editor.getByLabel('Notes', { exact: true })).toHaveValue('Uncommitted note.');

  // Click "Discard changes"
  await editor.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(editor).not.toBeVisible();

  // Reopen task: values reverted to committed task
  await page.getByRole('button', { name: 'Original title', exact: true }).click();
  await expect(editor.getByLabel('Task title', { exact: true })).toHaveValue('Original title');
  await expect(editor.getByLabel('Notes', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
});

test('duration badge opens anchored estimate popover and saves preset atomically preserving other fields', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create task with notes
  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Sprint review');
  await composer.getByLabel('Estimated time', { exact: true }).fill('30m');
  await composer.getByRole('button', { name: 'Open full details', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New task', exact: true });
  await editor.getByLabel('Notes', { exact: true }).fill('Prepare slide deck.');
  await editor.getByRole('button', { name: 'Add to day', exact: true }).click();
  await expect(editor).not.toBeVisible();

  // Click duration badge on the card
  const badge = page.getByRole('button', { name: 'Edit duration for Sprint review', exact: true });
  await badge.click();

  const popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await expect(popover).toBeVisible();

  // Click preset "1.5 hr" (90 minutes)
  await popover.getByRole('button', { name: '1.5 hr', exact: true }).click();
  await expect(popover).not.toBeVisible();

  // Check that duration badge updated to 1h 30m
  await expect(badge).toContainText('1:30');

  // Verify atomic save: notes were preserved
  const data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(90);
  expect(data.tasks[0]!.notes).toBe('Prepare slide deck.');
});

test('child estimate popover inside editor updates draft only and child Escape dismisses innermost overlay', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create a task
  await page.keyboard.press('a');
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Demo task');
  await composer.getByLabel('Estimated time', { exact: true }).fill('45m');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();

  // Open editor
  await page.getByRole('button', { name: 'Demo task', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  // Open child estimate popover inside editor
  await editor.getByRole('button', { name: 'Choose estimate preset', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await expect(popover).toBeVisible();

  // Pressing Escape should close ONLY the popover, NOT the editor!
  await page.keyboard.press('Escape');
  await expect(popover).not.toBeVisible();
  await expect(editor).toBeVisible();

  // Open popover again and pick preset "2 hr"
  await editor.getByRole('button', { name: 'Choose estimate preset', exact: true }).click();
  await expect(popover).toBeVisible();
  await popover.getByRole('button', { name: '2 hr', exact: true }).click();
  await expect(popover).not.toBeVisible();

  // Popover updated the draft field in editor, but has NOT committed yet
  await expect(editor.getByLabel('Estimated time', { exact: true })).toHaveValue('2h');
  let data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(45); // Unchanged in storage!

  // Now click Cancel in editor
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).not.toBeVisible();

  // Storage remains 45m
  data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(45);
});

test('task menu supports keyboard navigation, edit task, move to backlog, and delete with undo', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create task
  await page.keyboard.press('a');
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Menu target');
  await composer.getByLabel('Estimated time', { exact: true }).fill('1h');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();

  // Click task menu button
  const menuTrigger = page.getByRole('button', { name: 'More actions for Menu target', exact: true });
  await menuTrigger.click();

  const menu = page.getByRole('menu', { name: 'Actions for Menu target', exact: true });
  await expect(menu).toBeVisible();

  // First item "Edit task" is focused
  await expect(menu.getByRole('menuitem', { name: 'Edit task', exact: true })).toBeFocused();

  // ArrowDown moves to "Move to backlog"
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Move to backlog', exact: true })).toBeFocused();

  // ArrowDown moves to "Delete"
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();

  // ArrowDown wraps back to "Edit task"
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Edit task', exact: true })).toBeFocused();

  // Press Escape: closes menu and restores focus to menu trigger
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(menuTrigger).toBeFocused();

  // Open menu again and select "Move to backlog"
  await menuTrigger.click();
  await menu.getByRole('menuitem', { name: 'Move to backlog', exact: true }).click();
  await expect(menu).not.toBeVisible();

  let data = await snapshot();
  expect(data.tasks).toHaveLength(0);
  expect(data.backlog).toHaveLength(1);
  expect(data.backlog[0]!.title).toBe('Menu target');

  // Go to Backlog view
  await page.getByRole('button', { name: 'Backlog', exact: true }).click();
  const backlogCard = page.getByTestId('task-card').filter({ hasText: 'Menu target' });
  await expect(backlogCard).toBeVisible();

  // Open menu on backlog task: "Move to backlog" should be disabled
  const backlogMenuTrigger = backlogCard.getByRole('button', { name: 'More actions for Menu target', exact: true });
  await backlogMenuTrigger.click();
  await expect(menu.getByRole('menuitem', { name: 'Move to backlog', exact: true })).toBeDisabled();

  // Select Delete
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(backlogCard).toHaveCount(0);

  // Undo notification appears and restores task
  const toast = page.getByRole('status').filter({ hasText: 'Deleted “Menu target”' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo', exact: true }).click();

  data = await snapshot();
  expect(data.backlog).toHaveLength(1);
  expect(data.backlog[0]!.title).toBe('Menu target');
});

test('motion styling conforms to verified receipts (50ms checkbox, 200ms opacity) and zero duration overlays', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create a task to inspect
  await page.keyboard.press('a');
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });

  // Verify quick add container has 0s transition / animation
  const composerStyles = await composer.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      transitionDuration: s.transitionDuration,
      animationName: s.animationName,
    };
  });
  expect(composerStyles.animationName).toBe('none');

  await composer.getByLabel('Task title', { exact: true }).fill('Motion test');
  await composer.getByLabel('Estimated time', { exact: true }).fill('45m');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();

  // Check card checkbox styles
  const checkbox = page.locator('.task-checkbox').first();
  const checkboxTransition = await checkbox.evaluate((el) => window.getComputedStyle(el).transition);
  // Checkbox transition includes 50ms (0.05s)
  expect(checkboxTransition).toMatch(/(50ms|0\.05s)/);

  // Check card transition includes 200ms (0.2s)
  const card = page.locator('.task-card').first();
  const cardTransition = await card.evaluate((el) => window.getComputedStyle(el).transition);
  expect(cardTransition).toMatch(/(200ms|0\.2s)/);

  // Open centered editor and inspect container
  await page.getByRole('button', { name: 'Motion test', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  const editorStyles = await editor.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      animationName: s.animationName,
      width: s.width,
    };
  });
  expect(editorStyles.animationName).toBe('none');
  // Measured width close to 670px
  expect(parseFloat(editorStyles.width)).toBeGreaterThanOrEqual(500);
});

test('R1 regression: pristine editor cache reconciles standalone estimate updates and preserves dirty fields', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Create a 30m task
  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Reconcile task');
  await composer.getByLabel('Estimated time', { exact: true }).fill('30m');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();
  await expect(composer).not.toBeVisible();

  // 2. Open in editor, verify 30m, close without editing (pristine draft)
  await page.getByRole('button', { name: 'Reconcile task', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor.getByLabel('Estimated time', { exact: true })).toHaveValue('30m');
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();

  // 3. Change duration to 1 hr via standalone duration badge
  await page.getByRole('button', { name: 'Edit duration for Reconcile task', exact: true }).click();
  let popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await popover.getByRole('button', { name: '1 hr', exact: true }).click();
  await expect(popover).not.toBeVisible();

  let data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(60);

  // 4. Reopen editor: must show reconciled 1h, NOT stale 30m
  await page.getByRole('button', { name: 'Reconcile task', exact: true }).click();
  await expect(editor.getByLabel('Estimated time', { exact: true })).toHaveValue('1h');

  // Save changes: must preserve 60m
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).not.toBeVisible();

  data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(60);

  // 5. Test dirty field retention: edit notes in editor, close without saving
  await page.getByRole('button', { name: 'Reconcile task', exact: true }).click();
  await editor.getByLabel('Notes', { exact: true }).fill('User retained notes.');
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();

  // Standalone estimate changes to 2 hr
  await page.getByRole('button', { name: 'Edit duration for Reconcile task', exact: true }).click();
  await popover.getByRole('button', { name: '2 hr', exact: true }).click();
  await expect(popover).not.toBeVisible();

  // Reopen editor: user notes are preserved AND estimate is 2h!
  await page.getByRole('button', { name: 'Reconcile task', exact: true }).click();
  await expect(editor.getByLabel('Notes', { exact: true })).toHaveValue('User retained notes.');
  await expect(editor.getByLabel('Estimated time', { exact: true })).toHaveValue('2h');

  // Save changes
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).not.toBeVisible();

  data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(120);
  expect(data.tasks[0]!.notes).toBe('User retained notes.');
});

test('R2 regression: failed delete retains uncommitted draft while successful delete clears it', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create a task
  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Original title');
  await composer.getByLabel('Estimated time', { exact: true }).fill('30m');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();

  // Open editor, edit title to 'Uncommitted title', press Escape
  await page.getByRole('button', { name: 'Original title', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await editor.getByLabel('Task title', { exact: true }).fill('Uncommitted title');
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();

  // Inject delete failure into ipcMain
  await application!.evaluate(({ ipcMain }) => {
    const orig = (ipcMain as any)._invokeHandlers.get('planner:delete-task');
    (globalThis as any).__origDelete = orig;
    ipcMain.removeHandler('planner:delete-task');
    ipcMain.handle('planner:delete-task', () => ({
      ok: false,
      error: { code: 'STORAGE_ERROR', message: 'Injected review delete failure' },
    }));
  });

  // Attempt delete from card action menu
  await page.getByRole('button', { name: 'More actions for Original title', exact: true }).click();
  let menu = page.getByRole('menu', { name: 'Actions for Original title', exact: true });
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();

  // Verify error banner appears
  await expect(page.locator('.error-banner')).toContainText('Injected review delete failure');

  // Task still exists, reopen editor: uncommitted title draft MUST still be retained
  await page.getByRole('button', { name: 'Original title', exact: true }).click();
  await expect(editor.getByLabel('Task title', { exact: true })).toHaveValue('Uncommitted title');
  await page.keyboard.press('Escape');

  // Restore delete handler
  await application!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('planner:delete-task');
    ipcMain.handle('planner:delete-task', (globalThis as any).__origDelete);
  });

  // Successful delete clears draft
  await page.getByRole('button', { name: 'More actions for Original title', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Original title', exact: true })).toHaveCount(0);

  // Undo delete
  const toast = page.getByRole('status').filter({ hasText: 'Deleted “Original title”' });
  await toast.getByRole('button', { name: 'Undo', exact: true }).click();

  // Reopen restored task: draft was cleared on successful delete, so baseline 'Original title' is shown
  await page.getByRole('button', { name: 'Original title', exact: true }).click();
  await expect(editor.getByLabel('Task title', { exact: true })).toHaveValue('Original title');
  await page.keyboard.press('Escape');
});

test('R3 regression: modal focus containment prevents Tab and Shift+Tab from escaping to background', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Quick add modal containment
  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(composer.getByLabel('Task title', { exact: true })).toBeFocused();

  // Background is marked inert
  const isShellInertQuick = await page.evaluate(() => document.querySelector('.planner-shell')?.hasAttribute('inert'));
  expect(isShellInertQuick).toBe(true);

  // Press Shift+Tab from first element: must wrap to submit button inside dialog
  await page.keyboard.press('Shift+Tab');
  const activeInsideQuick = await page.evaluate(() => ({
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
    activeTag: document.activeElement?.tagName,
  }));
  expect(activeInsideQuick.insideDialog).toBe(true);

  // Press Tab from last element: wraps back to first element inside dialog
  await page.keyboard.press('Tab');
  const activeFirstQuick = await page.evaluate(() => ({
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
    activeLabel: document.activeElement?.getAttribute('aria-label'),
  }));
  expect(activeFirstQuick.insideDialog).toBe(true);
  expect(activeFirstQuick.activeLabel).toBe('Task title');

  await page.keyboard.press('Escape');
  await expect(composer).not.toBeVisible();

  // 2. Task editor modal containment
  await page.evaluate(async () => {
    await window.planner.saveTask({
      title: 'Modal test task',
      notes: '',
      plannedMinutes: 30,
      plannedDate: '2026-10-25',
      viewDate: '2026-10-25',
    });
  });
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();
  await page.getByRole('button', { name: 'Modal test task', exact: true }).click();

  let editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  const isShellInertEditor = await page.evaluate(() => document.querySelector('.planner-shell')?.hasAttribute('inert'));
  expect(isShellInertEditor).toBe(true);

  // Focus save button (last focusable element) and press Tab: wraps to first element inside dialog
  await editor.getByRole('button', { name: 'Save changes', exact: true }).focus();
  await page.keyboard.press('Tab');
  const activeAfterTab = await page.evaluate(() => ({
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
    activeLabel: document.activeElement?.getAttribute('aria-label'),
  }));
  expect(activeAfterTab.insideDialog).toBe(true);

  // Press Shift+Tab from first element: wraps back to Save changes
  await page.keyboard.press('Shift+Tab');
  const activeAfterShiftTab = await page.evaluate(() => ({
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
    activeTag: document.activeElement?.tagName,
  }));
  expect(activeAfterShiftTab.insideDialog).toBe(true);

  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();
});

test('R4 regression: pending save ignores Escape and backdrop clicks until completed', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Delay save-task IPC response
  await application!.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('planner:save-task');
    (globalThis as any).__origSaveTask = original;
    ipcMain.removeHandler('planner:save-task');
    ipcMain.handle('planner:save-task', async (event, input) => {
      await new Promise((r) => {
        (globalThis as any).__phase2SaveRelease = r;
      });
      return original(event, input);
    });
  });

  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await composer.getByLabel('Task title', { exact: true }).fill('Pending task');
  await composer.getByLabel('Estimated time', { exact: true }).fill('30m');
  await composer.getByRole('button', { name: 'Add to day', exact: true }).click();

  // Save is in flight
  await expect(composer.getByRole('button', { name: 'Saving…', exact: true })).toBeVisible();

  // Press Escape while saving: dialog MUST remain open!
  await page.keyboard.press('Escape');
  await expect(composer).toBeVisible();

  // Click backdrop while saving: dialog MUST remain open!
  await page.mouse.click(20, 20);
  await expect(composer).toBeVisible();

  // Release save
  await application!.evaluate(() => (globalThis as any).__phase2SaveRelease());
  await expect(composer).not.toBeVisible();

  // Restore handler
  await application!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('planner:save-task');
    ipcMain.handle('planner:save-task', (globalThis as any).__origSaveTask);
  });

  await expect(page.getByRole('button', { name: 'Pending task', exact: true })).toBeVisible();
});

test('R5 regression: standalone estimate failure displays inline error and retains requested value for retry', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Seed task
  await page.evaluate(async () => {
    await window.planner.saveTask({
      title: 'Estimate error task',
      notes: 'Retained note',
      plannedMinutes: 30,
      plannedDate: '2026-10-25',
      viewDate: '2026-10-25',
    });
  });
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();

  // Inject failure
  await application!.evaluate(({ ipcMain }) => {
    const orig = (ipcMain as any)._invokeHandlers.get('planner:save-task');
    (globalThis as any).__origSave = orig;
    ipcMain.removeHandler('planner:save-task');
    ipcMain.handle('planner:save-task', () => ({
      ok: false,
      error: { code: 'STORAGE_ERROR', message: 'Injected review estimate failure' },
    }));
  });

  // Open standalone popover and choose 1.5 hr (90m)
  await page.getByRole('button', { name: 'Edit duration for Estimate error task', exact: true }).click();
  let popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await popover.getByRole('button', { name: '1.5 hr', exact: true }).click();

  // Inline alert MUST appear inside popover
  await expect(popover.getByRole('alert')).toContainText('Injected review estimate failure');
  // Retained custom input MUST be 1h 30m (attempted value)
  await expect(popover.getByLabel('Custom duration', { exact: true })).toHaveValue('1h 30m');

  // Restore handler
  await application!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('planner:save-task');
    ipcMain.handle('planner:save-task', (globalThis as any).__origSave);
  });

  // Click Apply custom duration: succeeds
  await popover.getByRole('button', { name: 'Apply custom duration', exact: true }).click();
  await expect(popover).not.toBeVisible();

  let data = await snapshot();
  expect(data.tasks[0]!.plannedMinutes).toBe(90);
  expect(data.tasks[0]!.notes).toBe('Retained note');
});

test('R6 regression: nested estimate popover within editor is correctly placed below trigger within viewport', async () => {
  // Test wide layout (1440×900)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    await window.planner.saveTask({
      title: 'Placement task',
      notes: '',
      plannedMinutes: 30,
      plannedDate: '2026-10-25',
      viewDate: '2026-10-25',
    });
  });
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();
  await page.getByRole('button', { name: 'Placement task', exact: true }).click();

  let editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  let trigger = editor.getByRole('button', { name: 'Choose estimate preset', exact: true });
  await trigger.click();

  let popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await expect(popover).toBeVisible();

  let anchorBox = (await trigger.boundingBox())!;
  let panelBox = (await popover.boundingBox())!;
  let editorBox = (await editor.boundingBox())!;

  // Must be positioned below anchor
  expect(panelBox.y).toBeGreaterThanOrEqual(anchorBox.y + anchorBox.height);
  // Must NOT be shifted sideways (offsetX ≈ 0)
  expect(Math.abs(panelBox.x - anchorBox.x)).toBeLessThanOrEqual(5);
  // Must be contained within editor bounds and viewport
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(1440);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(900);

  // Close popover via Escape: editor stays open
  await page.keyboard.press('Escape');
  await expect(popover).not.toBeVisible();
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');

  // Test laptop layout (860×680)
  await page.setViewportSize({ width: 860, height: 680 });
  await page.getByRole('button', { name: 'Placement task', exact: true }).click();
  await trigger.click();
  await expect(popover).toBeVisible();

  anchorBox = (await trigger.boundingBox())!;
  panelBox = (await popover.boundingBox())!;
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(860);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(680);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

test('R7 regression: panning board updates date default for keyboard and toolbar quick-add', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Focus board and pan 1 day to Oct 26
  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  await board.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Go to date', { exact: true })).toHaveValue('2026-10-26');

  // Press 'A': composer must default to Oct 26
  await page.keyboard.press('a');
  let composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel('Day', { exact: true })).toHaveValue('2026-10-26');
  await page.keyboard.press('Escape');
  await expect(composer).not.toBeVisible();

  // Keyboard creation must also default to Oct 26
  await page.keyboard.press('a');
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel('Day', { exact: true })).toHaveValue('2026-10-26');
  await page.keyboard.press('Escape');
});

test('R8 regression: parent modal dismissal restores focus to originating trigger after inert removal', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Quick add dismissal restores focus to Add task button
  const addTaskButton = page.getByRole('button', { name: /^Add task for / }).first();
  await addTaskButton.click();
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(composer).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(composer).toHaveCount(0);

  // Trigger is focused and shell is no longer inert
  expect(await addTaskButton.evaluate((el) => el === document.activeElement)).toBe(true);
  const shellInertQuick = await page.evaluate(() => document.querySelector('.planner-shell')?.hasAttribute('inert'));
  expect(shellInertQuick).toBe(false);

  // 2. Task editor dismissal restores focus to card trigger
  await page.evaluate(async () => {
    await window.planner.saveTask({
      title: 'Focus restore task',
      notes: '',
      plannedMinutes: 30,
      plannedDate: '2026-10-25',
      viewDate: '2026-10-25',
    });
  });
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();
  const taskCardButton = page.getByRole('button', { name: 'Focus restore task', exact: true });
  await taskCardButton.click();

  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);

  // Card trigger is focused and shell is no longer inert
  expect(await taskCardButton.evaluate((el) => el === document.activeElement)).toBe(true);
  const shellInertEditor = await page.evaluate(() => document.querySelector('.planner-shell')?.hasAttribute('inert'));
  expect(shellInertEditor).toBe(false);
});

test('R8 regression: child estimate popover receives keyboard focus and dismissal restores parent trigger focus', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(async () => {
    await window.planner.saveTask({
      title: 'Child focus task',
      notes: '',
      plannedMinutes: 30,
      plannedDate: '2026-10-25',
      viewDate: '2026-10-25',
    });
  });
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();
  await page.getByRole('button', { name: 'Child focus task', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  const estimateTrigger = editor.getByRole('button', { name: 'Choose estimate preset', exact: true });
  await estimateTrigger.click();

  const popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await expect(popover).toBeVisible();

  // Child custom duration input receives initial focus once visible
  const customInput = popover.getByLabel('Custom duration', { exact: true });
  await expect(customInput).toBeFocused();

  // Dismiss child via Escape
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(editor).toBeVisible();

  // Focus is restored to the parent estimate trigger button
  expect(await estimateTrigger.evaluate((el) => el === document.activeElement)).toBe(true);

  // Open child again and select preset
  await estimateTrigger.click();
  await expect(popover).toBeVisible();
  await popover.getByRole('button', { name: '45 min', exact: true }).click();
  await expect(popover).toHaveCount(0);

  // Preset selection also restores focus to the parent trigger button
  expect(await estimateTrigger.evaluate((el) => el === document.activeElement)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
});

test('R8 regression: changing creation entry points restores the most recent trigger', async () => {
  const composer = page.getByRole('dialog', { name: 'New task', exact: true });
  const backlog = page.getByRole('button', { name: /Add to backlog/ });
  const column = page.getByRole('button', { name: 'Add task for 2026-10-25', exact: true });
  for (const trigger of [backlog, column]) {
    await trigger.click();
    await expect(composer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(composer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('R8 regression: exact sequence (open task editor -> open estimate popover -> Escape -> press A) leaves task editor open', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(async () => {
    await window.planner.saveTask({
      title: 'Sequence test task',
      notes: '',
      plannedMinutes: 30,
      plannedDate: '2026-10-25',
      viewDate: '2026-10-25',
    });
  });
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();

  // 1. Open task editor
  await page.getByRole('button', { name: 'Sequence test task', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  // 2. Open estimate popover
  const estimateTrigger = editor.getByRole('button', { name: 'Choose estimate preset', exact: true });
  await estimateTrigger.click();
  const popover = page.getByRole('dialog', { name: 'Planned time presets', exact: true });
  await expect(popover).toBeVisible();

  // 3. Press Escape (closes estimate child popover only)
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(editor).toBeVisible();

  // 4. Press 'A'
  await page.keyboard.press('a');

  // Assert: Task editor MUST remain open and no quick-add composer opened
  await expect(editor).toBeVisible();
  expect(await page.locator('.quick-add-container').count()).toBe(0);

  // Close editor cleanly
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
});


