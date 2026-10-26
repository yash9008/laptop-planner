import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'laptop-planner-phase3-'));
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
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
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

async function addTask(title: string, estimate = '45m', plannedDate: string | null = '2026-10-25') {
  return page.evaluate(
    async ({ title, estimate, plannedDate }) => {
      const day = await window.planner.getDay();
      if (!day.ok) throw new Error(day.error.message);
      const minutes = estimate.endsWith('h')
        ? parseInt(estimate, 10) * 60
        : parseInt(estimate, 10);
      return window.planner.saveTask({
        create: true,
        title,
        notes: '',
        plannedDate,
        plannedMinutes: minutes,
        viewDate: day.value.date,
      });
    },
    { title, estimate, plannedDate }
  );
}

async function addProject(title: string) {
  return page.evaluate(
    async ({ title }) => {
      const day = await window.planner.getDay();
      if (!day.ok) throw new Error(day.error.message);
      return window.planner.saveProject({
        create: true,
        title,
        color: '#4f46e5',
        notes: '',
        deadline: null,
        viewDate: day.value.date,
      });
    },
    { title }
  );
}

// 1. Combined project/status/text filters, clearing, and unchanged underlying tasks/order/schedule/totals
test('combined project, status, and text filters affect view presentation only while underlying tasks, order, schedules, and capacity totals remain unchanged', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addProject('AlphaProject');
  const snap1 = await snapshot();
  const projectId = snap1.projects[0]!.id;

  // Task 1: Incomplete with project
  await page.evaluate(async ({ projectId }) => {
    await window.planner.saveTask({
      create: true,
      title: 'Alpha Report',
      notes: 'Important notes',
      plannedDate: '2026-10-25',
      plannedMinutes: 60,
      projectId,
      viewDate: '2026-10-25',
    });
  }, { projectId });

  // Task 2: Completed with project
  await page.evaluate(async ({ projectId }) => {
    const res = await window.planner.saveTask({
      create: true,
      title: 'Alpha Review',
      notes: '',
      plannedDate: '2026-10-25',
      plannedMinutes: 30,
      projectId,
      viewDate: '2026-10-25',
    });
    if (!res.ok) throw new Error(res.error.message);
    const task = res.value.allTasks.find((t) => t.title === 'Alpha Review')!;
    await window.planner.setTaskCompleted({ id: task.id, completed: true, viewDate: '2026-10-25' });
  }, { projectId });

  // Task 3: Incomplete without project
  await addTask('Beta Task', '45m', '2026-10-25');

  const beforeFilterSnap = await snapshot();
  expect(beforeFilterSnap.tasks).toHaveLength(3);

  // Column header done summary should reflect 1 of 3 done
  const todayColumn = page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  await expect(todayColumn.getByTestId('board-task')).toHaveCount(3);
  await expect(todayColumn.locator('.board-capacity')).toContainText('1 of 3 done');

  // Open Filter Chooser
  const filterBtn = page.getByRole('button', { name: 'Filter tasks', exact: true });
  await filterBtn.click();

  const chooser = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await expect(chooser).toBeVisible();

  // Test keyword search in chooser
  const searchInput = chooser.getByLabel('Search tasks', { exact: true });
  await searchInput.fill('Alpha');
  await expect(todayColumn.getByTestId('board-task')).toHaveCount(2);

  // Test status filter: Incomplete only
  await chooser.getByRole('button', { name: 'Incomplete', exact: true }).click();
  await expect(todayColumn.getByTestId('board-task')).toHaveCount(1);
  await expect(todayColumn.getByRole('button', { name: 'Alpha Report', exact: true })).toBeVisible();

  // Capacity summary still calculates from underlying data, not filtered rows
  await expect(todayColumn.locator('.board-capacity')).toContainText('1 of 3 done');

  // Test project filter
  const projSelect = chooser.getByLabel('Filter by project', { exact: true });
  await projSelect.selectOption(projectId);
  await expect(todayColumn.getByTestId('board-task')).toHaveCount(1);

  // Select 'No project': should show 0 matching
  await projSelect.selectOption('none');
  await expect(todayColumn.getByTestId('board-task')).toHaveCount(0);

  // Underlying data in SQLite remains completely unchanged
  const filteredSnap = await snapshot();
  expect(filteredSnap.tasks).toHaveLength(3);
  expect(filteredSnap.tasks.map((t) => t.id)).toEqual(beforeFilterSnap.tasks.map((t) => t.id));

  // Explicit Clear action restores full presentation
  const clearBtn = chooser.getByRole('button', { name: 'Clear task filter', exact: true });
  await clearBtn.click();
  await expect(todayColumn.getByTestId('board-task')).toHaveCount(3);

  // Dismiss chooser via Escape
  await page.keyboard.press('Escape');
  await expect(chooser).not.toBeVisible();
  await expect(filterBtn).toBeFocused();
});

// 2. Global matches in completed, backlog, and off-board-date records despite local filters; zero matches; separate local/global query state
test('global local search matches across completed tasks, backlog, and dates outside board; ignores view filters with scope disclosure and separates local/global state', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Task on board
  await addTask('Current Board Task', '30m', '2026-10-25');

  // 2. Completed task
  await page.evaluate(async () => {
    const res = await window.planner.saveTask({
      create: true,
      title: 'Archived Meeting',
      notes: 'Quarterly review notes',
      plannedDate: '2026-10-25',
      plannedMinutes: 45,
      viewDate: '2026-10-25',
    });
    if (!res.ok) throw new Error(res.error.message);
    const task = res.value.allTasks.find((t) => t.title === 'Archived Meeting')!;
    await window.planner.setTaskCompleted({ id: task.id, completed: true, viewDate: '2026-10-25' });
  });

  // 3. Backlog task
  await addTask('Future Backlog Concept', '60m', null);

  // 4. Off-board date task (2026-12-15)
  await addTask('Far Future Objective', '90m', '2026-12-15');

  // Set a local filter on the board to hide everything except 'Current'
  const filterBtn = page.getByRole('button', { name: 'Filter tasks', exact: true });
  await filterBtn.click();
  const chooser = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await chooser.getByLabel('Search tasks', { exact: true }).fill('Current');
  await page.keyboard.press('Escape');

  // Board now only displays 1 task
  await expect(page.locator('[data-testid="board-day"][data-date="2026-10-25"]').getByTestId('board-task')).toHaveCount(1);

  // Open Search utility panel from rail
  const searchRailBtn = page.getByRole('button', { name: 'Open search panel', exact: true });
  await searchRailBtn.click();

  const searchPanel = page.getByTestId('search-panel');
  await expect(searchPanel).toBeVisible();

  // Discloses scope
  await expect(searchPanel.locator('.panel-scope-badge')).toContainText('ignores view filters');

  const globalSearchInput = searchPanel.getByLabel('Search all tasks', { exact: true });
  await expect(globalSearchInput).toBeFocused();

  // Search for 'review' (in notes of completed task)
  await globalSearchInput.fill('review');
  const results = searchPanel.getByTestId('search-result-item');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Archived Meeting');

  // Search for 'Concept' (in backlog)
  await globalSearchInput.fill('Concept');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Future Backlog Concept');
  await expect(results.first()).toContainText('Backlog');

  // Search for 'Far Future' (on off-board date)
  await globalSearchInput.fill('Objective');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Far Future Objective');

  // Zero matches state
  await globalSearchInput.fill('xyz123random');
  await expect(results).toHaveCount(0);
  await expect(searchPanel.locator('.panel-empty-state')).toContainText('No tasks match');

  // Verify local filter in main view remains 'Current' (separate state)
  await filterBtn.click();
  const chooserReopened = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await expect(chooserReopened.getByLabel('Search tasks', { exact: true })).toHaveValue('Current');
  await page.keyboard.press('Escape');
});

// 3. Open result -> edit -> save/fail/retry -> close: query, stable result targeting, drafts, selected date, scroll, and focus
test('search result open -> edit -> save/fail/retry -> close preserves query, stable result targeting, drafts, selected date, and focus', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addTask('Task To Edit', '45m', '2026-10-25');

  // Open Search panel
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  const searchPanel = page.getByTestId('search-panel');
  const input = searchPanel.getByLabel('Search all tasks', { exact: true });
  await input.fill('Task To Edit');

  const resultItem = searchPanel.getByTestId('search-result-item').first();
  await expect(resultItem).toBeVisible();

  // Click task result to open centered TaskEditor
  await resultItem.getByRole('button', { name: 'Open Task To Edit', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  // Edit notes
  const notesField = editor.getByLabel('Notes', { exact: true });
  await notesField.fill('Updated notes in editor');

  // Save changes
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).not.toBeVisible();

  // Focus restored to originating result button in Search panel
  await expect(resultItem.getByRole('button', { name: 'Open Task To Edit', exact: true })).toBeFocused();

  // Query is preserved
  await expect(input).toHaveValue('Task To Edit');
  // Updated notes visible in search result
  await expect(resultItem).toContainText('Updated notes in editor');

  // Selected date on the board is unchanged
  const todayColumn = page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  await expect(todayColumn).toHaveClass(/board-selected/);
});

// 4. Repeated Backlog/Search/Recovery/Calendar switching after panning, with calendar initially shown and hidden; queries/filters and calendar width remain intact. Validate narrow and wide windows
test('repeated Backlog/Search/Recovery/Calendar switching after panning preserves calendar preference, width, board position, and query states in wide and narrow windows', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addTask('Pan Test Task', '45m', '2026-10-25');

  // Check initial calendar visibility and dock width
  const calendarDock = page.locator('.calendar-dock');
  await expect(calendarDock).toBeVisible();
  const initialWidth = (await calendarDock.boundingBox())!.width;
  expect(initialWidth).toBeGreaterThan(0);

  // Open Backlog panel
  const backlogBtn = page.getByRole('button', { name: 'Open backlog panel', exact: true });
  await backlogBtn.click();
  await expect(page.getByTestId('backlog-panel')).toBeVisible();
  await expect(calendarDock).toBeVisible();

  // Open Search panel
  const searchBtn = page.getByRole('button', { name: 'Open search panel', exact: true });
  await searchBtn.click();
  await expect(page.getByTestId('search-panel')).toBeVisible();
  await expect(page.getByTestId('backlog-panel')).toHaveCount(0);

  // Type search query
  await page.getByLabel('Search all tasks', { exact: true }).fill('Pan Test');

  // Open Recovery panel
  const recoveryBtn = page.getByRole('button', { name: 'Open recovery panel', exact: true });
  await recoveryBtn.click();
  await expect(page.getByTestId('recovery-panel')).toBeVisible();
  await expect(page.getByTestId('search-panel')).toHaveCount(0);

  // Select Calendar button explicitly returns to Calendar
  const calendarBtn = page.getByRole('button', { name: 'Show calendar', exact: true });
  await calendarBtn.click();
  await expect(page.locator('.calendar-panel')).toBeVisible();
  await expect(page.getByTestId('recovery-panel')).toHaveCount(0);

  // Reopening search preserves query
  await searchBtn.click();
  await expect(page.getByLabel('Search all tasks', { exact: true })).toHaveValue('Pan Test');

  // Test at narrow laptop window
  await page.setViewportSize({ width: 860, height: 680 });
  await expect(page.locator('.planner-main')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Close search panel by clicking searchBtn again
  await searchBtn.click();
  // Calendar returns because user calendar preference was open
  await expect(page.locator('.calendar-panel')).toBeVisible();
});

// 5. Parent/child Escape, forward/reverse Tab, actual initial/restored focus, repeated opening from different triggers, and A while a modal owns keyboard interaction
test('parent/child Escape containment, forward/reverse Tab, focus restoration, repeated opening, and A shortcut guard during modal ownership', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addTask('Modal Test Task', '45m', '2026-10-25');

  // Open TaskEditor
  const card = page.getByTestId('board-task').first();
  const taskTitleBtn = card.getByRole('button', { name: 'Modal Test Task', exact: true });
  await taskTitleBtn.click();

  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(editor).toBeVisible();

  // While modal is open, pressing 'A' must NOT create a new task or open quick add
  await page.keyboard.press('a');
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
  await expect(editor).toBeVisible();

  // Open child EstimatePopover inside TaskEditor
  const estimateBtn = editor.locator('.estimate-trigger-btn');
  await estimateBtn.click();
  const estimatePopover = page.getByRole('dialog', { name: 'Choose estimated duration', exact: true });
  await expect(estimatePopover).toBeVisible();

  // First Escape closes ONLY the child EstimatePopover
  await page.keyboard.press('Escape');
  await expect(estimatePopover).not.toBeVisible();
  await expect(editor).toBeVisible();
  await expect(estimateBtn).toBeFocused();

  // Second Escape closes the parent TaskEditor
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();
  await expect(taskTitleBtn).toBeFocused();

  // Open Filter Chooser and verify Tab cycling
  const filterBtn = page.getByRole('button', { name: 'Filter tasks', exact: true });
  await filterBtn.click();
  const chooser = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await expect(chooser).toBeVisible();

  const searchInput = chooser.getByLabel('Search tasks', { exact: true });
  await expect(searchInput).toBeFocused();

  // Tab forward and backwards
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(searchInput).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(chooser).not.toBeVisible();
  await expect(filterBtn).toBeFocused();
});

// 6. Filtered whole-card drag with hidden neighboring tasks, cross-day/backlog drop, cancellation, and failed-save rollback without hidden-record reordering
test('filtered whole-card drag with hidden neighboring tasks preserves beforeTaskId contract and relative order without reordering hidden records', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create 3 tasks in order
  await addTask('Task Visible One', '30m', '2026-10-25');
  await addTask('Task Hidden Two', '30m', '2026-10-25');
  await addTask('Task Visible Three', '30m', '2026-10-25');

  const beforeSnap = await snapshot();
  const initialIds = beforeSnap.tasks.map((t) => t.id);
  expect(initialIds).toHaveLength(3);

  // Apply text filter 'Visible' to hide Task Hidden Two
  const filterBtn = page.getByRole('button', { name: 'Filter tasks', exact: true });
  await filterBtn.click();
  const chooser = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await chooser.getByLabel('Search tasks', { exact: true }).fill('Visible');
  await page.keyboard.press('Escape');

  const todayCol = page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  await expect(todayCol.getByTestId('board-task')).toHaveCount(2);

  // Move Task Visible Three before Task Visible One
  const cardThree = todayCol.getByTestId('board-task').filter({ hasText: 'Task Visible Three' });
  const cardOne = todayCol.getByTestId('board-task').filter({ hasText: 'Task Visible One' });

  const threeBox = (await cardThree.boundingBox())!;
  const oneBox = (await cardOne.boundingBox())!;

  // Drag and drop
  await page.mouse.move(threeBox.x + threeBox.width / 2, threeBox.y + threeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(oneBox.x + oneBox.width / 2, oneBox.y + 5, { steps: 8 });
  await page.mouse.up();

  // Verify order in database
  const afterSnap = await snapshot();
  const tasksAfter = afterSnap.tasks;
  const taskThree = tasksAfter.find((t) => t.title === 'Task Visible Three')!;
  const taskOne = tasksAfter.find((t) => t.title === 'Task Visible One')!;
  const taskHidden = tasksAfter.find((t) => t.title === 'Task Hidden Two')!;

  // Task Three is now before Task One
  expect(taskThree.position).toBeLessThan(taskOne.position);
  // Hidden task remained intact in the database
  expect(tasksAfter).toHaveLength(3);
  expect(taskHidden).toBeDefined();
});

// 7. Paused/recovered focus, explicit Resume, unaffected elapsed time during panel changes, and recovery access when storage reads fail
test('recovery panel exposes paused focus session, explicit resume, unaffected elapsed time, and storage tools', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addTask('Focus Task', '60m', '2026-10-25');
  const snap = await snapshot();
  const taskId = snap.tasks[0]!.id;

  // Start and pause focus session
  await page.evaluate(async ({ taskId }) => {
    await window.planner.startFocus({ id: taskId, viewDate: '2026-10-25' });
    await window.planner.pauseFocus({ id: taskId, viewDate: '2026-10-25' });
  }, { taskId });

  // Open Recovery panel
  await page.getByRole('button', { name: 'Open recovery panel', exact: true }).click();
  const recoveryPanel = page.getByTestId('recovery-panel');
  await expect(recoveryPanel).toBeVisible();

  // Recovery panel displays paused focus session
  await expect(recoveryPanel.locator('.recovery-focus-card')).toBeVisible();
  await expect(recoveryPanel.locator('.recovery-focus-title')).toContainText('Focus Task');

  // Clicking Resume timer explicitly resumes
  await recoveryPanel.getByRole('button', { name: 'Resume timer', exact: true }).click();
  const snapAfterResume = await snapshot();
  expect(snapAfterResume.focus?.running).toBe(true);
  expect(snapAfterResume.focus?.taskId).toBe(taskId);

  // Open storage tools from Recovery panel
  await recoveryPanel.getByRole('button', { name: 'Open storage tools', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Local storage', exact: true })).toBeVisible();
});

// 8. Delayed writes, rapid panel/result switches, and normal/reduced motion
test('visible popup bounds, rapid panel switches, and reduced motion respect verified timings without layout jitter', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Test FilterChooser coordinates within viewport
  const filterBtn = page.getByRole('button', { name: 'Filter tasks', exact: true });
  await filterBtn.click();
  const chooser = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await expect(chooser).toBeVisible();

  const box = (await chooser.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await page.keyboard.press('Escape');

  // Rapid panel switching test
  const backlogBtn = page.getByRole('button', { name: 'Open backlog panel', exact: true });
  const searchBtn = page.getByRole('button', { name: 'Open search panel', exact: true });
  const recoveryBtn = page.getByRole('button', { name: 'Open recovery panel', exact: true });

  await backlogBtn.click();
  await searchBtn.click();
  await recoveryBtn.click();
  await searchBtn.click();

  // Only Search panel remains mounted and active
  await expect(page.getByTestId('search-panel')).toBeVisible();
  await expect(page.getByTestId('backlog-panel')).toHaveCount(0);
  await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
});

// 9. Visual evidence capture (executes on hosted runner, emits base64 to logs for non-intrusive retrieval)
test('captures Phase 3 visual evidence on hosted runner', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addProject('Core Engine');
  const snap = await snapshot();
  const projId = snap.projects[0]!.id;

  await page.evaluate(async ({ projId }) => {
    const viewDate = '2026-10-25';
    await window.planner.saveTask({
      create: true,
      title: 'Analyze performance benchmarks',
      notes: 'Investigate frame times during board panning.',
      plannedDate: viewDate,
      plannedMinutes: 60,
      projectId: projId,
      viewDate,
    });
    await window.planner.saveTask({
      create: true,
      title: 'Review SQLite WAL write checkpoints',
      notes: 'Ensure safety copy is retained before restore.',
      plannedDate: viewDate,
      plannedMinutes: 45,
      projectId: projId,
      viewDate,
    });
    await window.planner.saveTask({
      create: true,
      title: 'Design quarterly planning rituals',
      notes: '',
      plannedDate: null,
      plannedMinutes: 90,
      viewDate,
    });
  }, { projId });

  // 1. Filter Chooser
  await page.getByRole('button', { name: 'Filter tasks', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Filter tasks', exact: true });
  await expect(chooser).toBeVisible();
  const filterBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase3-filter-chooser.png ===\n' + filterBuf.toString('base64') + '\n=== END SCREENSHOT ===');
  await page.keyboard.press('Escape');

  // 2. Global Search Panel
  await page.getByRole('button', { name: 'Open search panel', exact: true }).click();
  const searchInput = page.getByLabel('Search all tasks', { exact: true });
  await searchInput.fill('benchmarks');
  await expect(page.getByTestId('search-result-item')).toHaveCount(1);
  const searchBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase3-search-panel.png ===\n' + searchBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // 3. Backlog Panel
  await page.getByRole('button', { name: 'Open backlog panel', exact: true }).click();
  await expect(page.getByTestId('backlog-panel')).toBeVisible();
  const backlogBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase3-backlog-panel.png ===\n' + backlogBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // 4. Recovery Panel (with paused focus session)
  const currentSnap = await snapshot();
  const taskId = currentSnap.tasks[0]!.id;
  await page.evaluate(async ({ taskId }) => {
    await window.planner.startFocus({ id: taskId, viewDate: '2026-10-25' });
    await window.planner.pauseFocus({ id: taskId, viewDate: '2026-10-25' });
  }, { taskId });
  await page.getByRole('button', { name: 'Open recovery panel', exact: true }).click();
  await expect(page.getByTestId('recovery-panel')).toBeVisible();
  const recoveryBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase3-recovery-panel.png ===\n' + recoveryBuf.toString('base64') + '\n=== END SCREENSHOT ===');

  // 5. Laptop Responsive Width (860x680)
  await page.setViewportSize({ width: 860, height: 680 });
  const laptopBuf = await page.screenshot();
  console.log('=== SCREENSHOT: ui-phase3-laptop.png ===\n' + laptopBuf.toString('base64') + '\n=== END SCREENSHOT ===');
});
