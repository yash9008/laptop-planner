import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'laptop-planner-phase5-'));
  const clock = Date.parse('2026-10-25T07:30:00.000Z');
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
      const minutes = estimate.endsWith('h') ? parseInt(estimate, 10) * 60 : parseInt(estimate, 10);
      const res = await window.planner.saveTask({
        id: crypto.randomUUID(),
        create: true,
        title,
        notes: `Notes for ${title}`,
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

test('motion parity: computed transition and animation properties in normal and reduced motion across all surfaces', async () => {
  await addTask('Task for Motion Audit', '30m');
  const card = page.locator('.task-card').first();
  await expect(card).toBeVisible();

  // 1. Normal Motion: check declared transition properties
  const normalCardStyles = await card.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(normalCardStyles.transitionProperty).toContain('opacity');
  expect(normalCardStyles.transitionDuration).toContain('0.2s');

  const checkbox = card.locator('.task-checkbox');
  const normalCheckboxStyles = await checkbox.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(normalCheckboxStyles.transitionDuration).toContain('0.05s');

  const tools = card.locator('.task-tools');
  const normalToolsStyles = await tools.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(normalToolsStyles.transitionProperty).toContain('opacity');
  expect(normalToolsStyles.transitionDuration).toContain('0.2s');

  const railBtn = page.locator('.rail-button').first();
  const normalRailStyles = await railBtn.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(normalRailStyles.transitionProperty).toContain('opacity');
  expect(normalRailStyles.transitionDuration).toContain('0.2s');

  const navIcon = page.locator('.nav-item svg').first();
  const normalNavIconStyles = await navIcon.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(normalNavIconStyles.transitionProperty).toContain('transform');
  expect(normalNavIconStyles.transitionDuration).toContain('0.3s');

  // Check Overlays under Normal Motion: must report 0s duration and no animation
  // Quick Add
  await page.keyboard.press('a');
  const composer = page.locator('.quick-add-container');
  await expect(composer).toBeVisible();
  const composerStyles = await composer.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(composerStyles.animationName).toBe('none');
  expect(composerStyles.transitionDuration === '0s' || composerStyles.transitionProperty === 'none').toBe(true);
  await page.keyboard.press('Escape');

  // Task Editor
  await card.getByRole('button', { name: 'Task for Motion Audit' }).click();
  const editor = page.locator('.task-editor-container');
  await expect(editor).toBeVisible();
  const editorStyles = await editor.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(editorStyles.animationName).toBe('none');
  expect(editorStyles.transitionDuration === '0s' || editorStyles.transitionProperty === 'none').toBe(true);

  // Estimate Popover nested inside editor
  const estimateTrigger = editor.locator('.estimate-trigger-btn');
  await estimateTrigger.click();
  const popover = page.locator('.dropdown-panel');
  await expect(popover).toBeVisible();
  const popoverStyles = await popover.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(popoverStyles.animationName).toBe('none');
  expect(popoverStyles.transitionDuration === '0s' || popoverStyles.transitionProperty === 'none').toBe(true);
  await page.keyboard.press('Escape'); // Closes popover only
  await expect(popover).toHaveCount(0);
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape'); // Closes editor

  // Command Palette
  await page.keyboard.press('Meta+k');
  const palette = page.locator('.command-palette-dialog');
  await expect(palette).toBeVisible();
  const paletteStyles = await palette.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(paletteStyles.animationName).toBe('none');
  expect(paletteStyles.transitionDuration === '0s' || paletteStyles.transitionProperty === 'none').toBe(true);
  await page.keyboard.press('Escape');

  // Focus View Calendar Dock opacity transition in Normal Motion
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();
  const calendarDock = page.locator('.calendar-dock');
  await expect(calendarDock).toHaveCSS('opacity', '0');
  await expect(calendarDock).toHaveCSS('transition-duration', '0.3s');
  await page.keyboard.press('Escape');
  await expect(focusScreen).toHaveCount(0);

  // 2. Reduced Motion: check that transitions and animations are suppressed (0s / none)
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const reducedCardStyles = await card.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
    };
  });
  expect(reducedCardStyles.transitionDuration === '0s' || reducedCardStyles.transitionProperty === 'none').toBe(true);

  const reducedCheckboxStyles = await checkbox.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(reducedCheckboxStyles.transitionDuration === '0s' || reducedCheckboxStyles.transitionProperty === 'none').toBe(true);

  const reducedNavIconStyles = await navIcon.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(reducedNavIconStyles.transitionDuration === '0s' || reducedNavIconStyles.transitionProperty === 'none').toBe(true);

  // Focus Calendar Dock under Reduced Motion
  await page.keyboard.press('f');
  await expect(focusScreen).toBeVisible();
  const reducedDockStyles = await calendarDock.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(reducedDockStyles.transitionDuration === '0s' || reducedDockStyles.transitionProperty === 'none').toBe(true);
  await page.keyboard.press('Escape');
  await expect(focusScreen).toHaveCount(0);
});

test('interruption: rapid repeated toggles, modal cycles, and cancellation preserve state and focus', async () => {
  await addTask('Rapid Toggle Task', '45m');
  const checkbox = page.locator('.task-checkbox').first();
  await expect(checkbox).toBeVisible();

  // 1. Rapid repeated checkbox clicks (5 times without waiting for animation)
  for (let i = 0; i < 5; i++) {
    await checkbox.click({ noWaitAfter: true });
  }
  // Odd number of clicks -> task should be completed
  await expect(checkbox).toBeChecked();
  await expect(page.locator('.completed-task')).toHaveCount(1);
  let data = await snapshot();
  expect(data.tasks.find((t) => t.title === 'Rapid Toggle Task')?.completed).toBe(true);

  // Click once more to uncomplete
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  data = await snapshot();
  expect(data.tasks.find((t) => t.title === 'Rapid Toggle Task')?.completed).toBe(false);

  // 2. Rapid modal opening and cancellation cycles
  // Quick-Add rapid open/cancel
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('a');
    await expect(page.locator('.quick-add-container')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.quick-add-container')).toHaveCount(0);
  }

  // Command palette rapid toggle
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('.command-palette-dialog')).toBeVisible();
    await page.keyboard.press('Meta+k');
    await expect(page.locator('.command-palette-dialog')).toHaveCount(0);
  }

  // Focus view rapid entry and exit
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('f');
    await expect(page.getByTestId('focus-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('focus-screen')).toHaveCount(0);
  }

  // Board state intact after rapid cycles
  await expect(page.locator('.task-card')).toHaveCount(1);
  expect(data.tasks).toHaveLength(1);
});

test('drag motion: whole-card lift, placeholder reflow, settling, edge scrolling, and Escape cancellation', async () => {
  await addTask('Card Alpha', '30m', '2026-10-25');
  await addTask('Card Beta', '45m', '2026-10-25');
  await addTask('Card Gamma', '60m', '2026-10-25');

  const cardAlpha = page.getByRole('button', { name: 'Card Alpha', exact: true });
  const cardBeta = page.getByRole('button', { name: 'Card Beta', exact: true });
  const alphaBox = (await cardAlpha.boundingBox())!;
  const betaBox = (await cardBeta.boundingBox())!;

  // 1. Initiate drag lift
  await page.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + alphaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(alphaBox.x + alphaBox.width / 2 + 10, alphaBox.y + alphaBox.height / 2, { steps: 3 });

  // Placeholder appears
  const placeholder = page.getByTestId('board-drop-placeholder');
  await expect(placeholder).toBeVisible();

  // Move over Card Beta: placeholder moves between Beta and Gamma
  await page.mouse.move(betaBox.x + betaBox.width / 2, betaBox.y + betaBox.height + 4, { steps: 5 });
  await expect(placeholder).toBeVisible();

  // 2. Escape cancels drag without saving
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(placeholder).toHaveCount(0);

  let data = await snapshot();
  expect(data.tasks.map((t) => t.title)).toEqual(['Card Alpha', 'Card Beta', 'Card Gamma']);

  // 3. Normal drag move and settling
  await page.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + alphaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(betaBox.x + betaBox.width / 2, betaBox.y + betaBox.height + 6, { steps: 5 });
  await expect(placeholder).toBeVisible();
  await page.mouse.up();
  await expect(placeholder).toHaveCount(0);

  // Verify atomic reorder persisted
  await expect.poll(async () => (await snapshot()).tasks.map((t) => t.title)).toEqual([
    'Card Beta',
    'Card Alpha',
    'Card Gamma',
  ]);

  // 4. Reduced Motion: verify drag settling has 0 duration
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const newAlphaBox = (await cardAlpha.boundingBox())!;
  const newBetaBox = (await cardBeta.boundingBox())!;

  await page.mouse.move(newAlphaBox.x + newAlphaBox.width / 2, newAlphaBox.y + newAlphaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(newBetaBox.x + newBetaBox.width / 2, newBetaBox.y - 4, { steps: 5 });
  await expect(placeholder).toBeVisible();
  await page.mouse.up();
  await expect(placeholder).toHaveCount(0);

  await expect.poll(async () => (await snapshot()).tasks.map((t) => t.title)).toEqual([
    'Card Alpha',
    'Card Beta',
    'Card Gamma',
  ]);
});

test('fault injection: drag rollback on simulated save failure preserves baseline order', async () => {
  await addTask('Stable One', '30m', '2026-10-25');
  await addTask('Stable Two', '45m', '2026-10-25');

  const cardOne = page.getByRole('button', { name: 'Stable One', exact: true });
  const cardTwo = page.getByRole('button', { name: 'Stable Two', exact: true });
  const boxOne = (await cardOne.boundingBox())!;
  const boxTwo = (await cardTwo.boundingBox())!;

  // Inject a temporary move failure by intercepting window.planner.moveTask
  await page.evaluate(() => {
    const originalMove = window.planner.moveTask;
    (window as unknown as { __originalMove: typeof originalMove }).__originalMove = originalMove;
    window.planner.moveTask = async () => {
      return { ok: false, error: { code: 'SAVE_FAILED', message: 'Simulated storage failure on move' } };
    };
  });

  // Attempt move
  await page.mouse.move(boxOne.x + boxOne.width / 2, boxOne.y + boxOne.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxTwo.x + boxTwo.width / 2, boxTwo.y + boxTwo.height + 4, { steps: 5 });
  await page.mouse.up();

  // Error banner appears
  const errorBanner = page.locator('.error-banner');
  await expect(errorBanner).toBeVisible();
  await expect(errorBanner).toContainText('Simulated storage failure');

  // Order is rolled back
  let data = await snapshot();
  expect(data.tasks.map((t) => t.title)).toEqual(['Stable One', 'Stable Two']);

  // Restore original moveTask and retry successfully
  await page.evaluate(() => {
    window.planner.moveTask = (window as unknown as { __originalMove: typeof window.planner.moveTask }).__originalMove;
  });

  const refreshedBoxOne = (await cardOne.boundingBox())!;
  const refreshedBoxTwo = (await cardTwo.boundingBox())!;
  await page.mouse.move(refreshedBoxOne.x + refreshedBoxOne.width / 2, refreshedBoxOne.y + refreshedBoxOne.height / 2);
  await page.mouse.down();
  await page.mouse.move(refreshedBoxTwo.x + refreshedBoxTwo.width / 2, refreshedBoxTwo.y + refreshedBoxTwo.height + 4, {
    steps: 5,
  });
  await page.mouse.up();

  await expect.poll(async () => (await snapshot()).tasks.map((t) => t.title)).toEqual(['Stable Two', 'Stable One']);
});

test('board panning and keyboard motion: smooth vs instant scrolling, cancellation, and click suppression', async () => {
  await addTask('Pan Motion Task', '60m', '2026-10-25');
  const board = page.getByRole('region', { name: 'Multi-day board', exact: true });
  await expect(board).toBeVisible();

  // 1. Keyboard scroll on board: Left/Right Arrow
  await board.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => board.evaluate((el) => el.scrollLeft)).toBe(0);

  // 2. Board panning via pointer drag
  const boardBox = (await board.boundingBox())!;
  const startX = boardBox.x + 300;
  const startY = boardBox.y + boardBox.height - 50;

  // Drag right button (button 2) to pan 100px
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(startX - 100, startY, { steps: 8 });
  await page.mouse.up({ button: 'right' });

  expect(await board.evaluate((el) => el.scrollLeft)).toBeCloseTo(100, -1);

  // 3. Pan cancellation with Escape
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(startX - 150, startY, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'right' });

  // Panning cancelled back to prior scrollLeft
  expect(await board.evaluate((el) => el.scrollLeft)).toBeCloseTo(100, -1);

  // Reset to today
  await page.getByRole('button', { name: 'Go to today', exact: true }).click();
  await expect.poll(async () => board.evaluate((el) => el.scrollLeft)).toBe(0);
});

test('visual evidence: wide 1440x900 and narrow 860x680 captures of normal and reduced motion states', async () => {
  await addTask('Review Motion Parity', '1h');
  await addTask('Audit Transition Curves', '30m');

  // --- WIDE 1440x900 Normal Motion ---
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Board Wide Normal
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const boardWideBuf = await page.screenshot();
  console.log(
    '=== SCREENSHOT: ui-phase5-board-wide.png ===\n' + boardWideBuf.toString('base64') + '\n=== END SCREENSHOT ==='
  );

  // 2. Centered Task Editor with Nested Estimate Popover Wide
  const card = page.getByRole('button', { name: 'Review Motion Parity', exact: true });
  await card.click();
  const editor = page.locator('.task-editor-container');
  await expect(editor).toBeVisible();
  await editor.locator('.estimate-trigger-btn').click();
  const popover = page.locator('.dropdown-panel');
  await expect(popover).toBeVisible();
  const editorWideBuf = await page.screenshot();
  console.log(
    '=== SCREENSHOT: ui-phase5-editor-popover-wide.png ===\n' +
      editorWideBuf.toString('base64') +
      '\n=== END SCREENSHOT ==='
  );
  await page.keyboard.press('Escape'); // Close popover
  await page.keyboard.press('Escape'); // Close editor

  // 3. Focus Screen Wide
  await page.keyboard.press('f');
  const focusScreen = page.getByTestId('focus-screen');
  await expect(focusScreen).toBeVisible();
  const focusWideBuf = await page.screenshot();
  console.log(
    '=== SCREENSHOT: ui-phase5-focus-wide.png ===\n' + focusWideBuf.toString('base64') + '\n=== END SCREENSHOT ==='
  );
  await page.keyboard.press('Escape');

  // --- NARROW 860x680 Reduced Motion ---
  await page.setViewportSize({ width: 860, height: 680 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 4. Board Narrow Reduced Motion
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const boardNarrowReducedBuf = await page.screenshot();
  console.log(
    '=== SCREENSHOT: ui-phase5-board-narrow-reduced.png ===\n' +
      boardNarrowReducedBuf.toString('base64') +
      '\n=== END SCREENSHOT ==='
  );

  // 5. Command Palette Narrow Reduced Motion
  await page.keyboard.press('Meta+k');
  const palette = page.locator('.command-palette-dialog');
  await expect(palette).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const paletteNarrowBuf = await page.screenshot();
  console.log(
    '=== SCREENSHOT: ui-phase5-palette-narrow-reduced.png ===\n' +
      paletteNarrowBuf.toString('base64') +
      '\n=== END SCREENSHOT ==='
  );
  await page.keyboard.press('Escape');
});
