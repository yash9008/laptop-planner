import { test,expect,_electron as electron,type ElectronApplication,type Page } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
let application:ElectronApplication|undefined;let directory:string;let page:Page;
test.beforeEach(async()=>{
  directory=await mkdtemp(join(tmpdir(),'laptop-planner-design-'));
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  application=await electron.launch({args:[resolve('.')],env:{...env,TZ:'Asia/Kolkata',LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:'2026-10-25T07:30:00.000Z'}});
  page=await application.firstWindow();await expect(page.getByRole('button',{name:/^Add task for /}).first()).toBeEnabled();
});
test.afterEach(async()=>{await application?.close();application=undefined;await rm(directory,{recursive:true,force:true});});
async function add(title:string,estimate='45m',repeat=false){
  await page.keyboard.press('a');const form=page.getByRole('dialog',{name:'New task',exact:true});
  await form.getByLabel('Task title',{exact:true}).fill(title);await form.getByLabel('Estimated time',{exact:true}).fill(estimate);
  if(repeat) {
    await form.getByRole('button',{name:'Open full details',exact:true}).click();
    await form.getByLabel('Repeat task',{exact:true}).selectOption('daily');
  }
  if(title==='Read a chapter')await form.getByLabel('Project',{exact:true}).selectOption({label:'Learning'});
  await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();
}
async function resizeWindow(width:number,height:number){
  await application!.evaluate(({BrowserWindow},size)=>{BrowserWindow.getAllWindows()[0]!.setContentSize(size.width,size.height);},{width,height});
  await page.setViewportSize({width,height});
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
}
test('Home opens with day columns and a docked calendar, and board checkboxes update real tasks',async()=>{
  await page.setViewportSize({width:1710,height:1072});
  await expect(page.getByRole('region',{name:'Multi-day board',exact:true})).toBeVisible();await expect(page.getByTestId('board-day')).toHaveCount(7);
  await expect(page.getByRole('complementary',{name:'Day calendar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'New project',exact:true}).click();
  const project=page.getByRole('dialog',{name:'New project',exact:true});await project.getByLabel('Project title',{exact:true}).fill('Learning');await project.getByLabel('Project color',{exact:true}).fill('#d4a5db');await project.getByRole('button',{name:'Create project',exact:true}).click();await expect(project).not.toBeVisible();
  await add('Read a chapter','45m',true);await add('Build the scheduling demo','2h');
  const today=page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  await today.getByRole('checkbox',{name:'Complete Read a chapter',exact:true}).click();await expect(today.getByRole('checkbox',{name:'Reopen Read a chapter',exact:true})).toBeChecked();
  const canvas=await page.locator('.planner-main').boundingBox();const calendar=await page.locator('.calendar-dock').boundingBox();expect(canvas!.x+canvas!.width).toBeCloseTo(calendar!.x,0);
  await page.screenshot({path:'test-results/planner-redesign-board.png'});
  const result=await page.evaluate(()=>window.planner.getDay());expect(result.ok&&result.value.tasks.find((task)=>task.title==='Read a chapter')!.completed).toBe(true);
});
test('filtering changes the visible cards without changing scheduling and clears correctly',async()=>{
  await add('Writing notes');await add('Practice typing');
  const before=await page.evaluate(()=>window.planner.getDay());
  await page.getByRole('button',{name:'Filter tasks',exact:true}).click();await page.getByLabel('Search tasks',{exact:true}).fill('writing');
  await expect(page.getByTestId('board-task')).toHaveCount(1);await expect(page.getByRole('button',{name:'Writing notes',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.planner.getDay())).toEqual(before);
  await page.getByRole('button',{name:'Clear task filter',exact:true}).click();await expect(page.getByTestId('board-task')).toHaveCount(2);
});
test('Home menus expose local view, calendar and settings actions with safe dismissal',async()=>{
  await expect(page.getByRole('button',{name:'Calendars',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open local settings',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add task',exact:true})).toHaveCount(0);
  const viewTrigger=page.getByRole('button',{name:'Planner view',exact:true});
  await viewTrigger.click();await expect(page.getByRole('menu',{name:'Planner view',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(viewTrigger).toBeFocused();
  await viewTrigger.click();await page.getByRole('menuitem',{name:'Today view',exact:true}).click();
  await expect(page.locator('main.view-day')).toBeVisible();
  await page.getByRole('button',{name:'Board view',exact:true}).click();
  await page.getByRole('button',{name:'Calendars',exact:true}).click();
  await page.getByRole('menuitem',{name:'Hide calendar',exact:true}).click();await expect(page.locator('.calendar-dock')).toHaveCount(0);
  await page.getByRole('button',{name:'Show calendar',exact:true}).click();await expect(page.locator('.calendar-dock')).toBeVisible();
  await page.getByRole('button',{name:'Open local settings',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open local settings',exact:true})).toBeFocused();
});
test('calendar zoom, panel toggles, sidebar collapse and keyboard task creation work at laptop size',async()=>{
  await page.setViewportSize({width:860,height:680});await add('Short task');
  const original=await page.getByTestId('calendar-block').boundingBox();await page.getByRole('button',{name:'Zoom calendar in',exact:true}).click();
  const enlarged=await page.getByTestId('calendar-block').boundingBox();expect(enlarged!.height).toBeCloseTo(original!.height*1.25,0);
  await page.getByRole('button',{name:'Hide calendar',exact:true}).click();await expect(page.locator('.calendar-dock')).toHaveCount(0);
  // Below 1024px the sidebar is already a 60px icon rail, so the manual toggle is exercised at a wide size.
  await resizeWindow(860,680);
  await expect(page.locator('.sidebar')).toHaveCSS('width','60px');
  await resizeWindow(1440,900);
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await expect(page.locator('.sidebar')).toHaveCSS('width','60px');
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await expect(page.locator('.sidebar')).toHaveCSS('width','200px');
  await resizeWindow(860,680);
  await page.getByRole('button',{name:'Show calendar',exact:true}).click();
  await expect(page.locator('.calendar-dock')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.keyboard.press('a');const form=page.getByRole('dialog',{name:'New task',exact:true});await expect(form).toBeVisible();
  await form.getByLabel('Task title',{exact:true}).fill('A safe draft');await expect(page.getByRole('dialog')).toHaveCount(1);
  await form.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:'test-results/planner-redesign-laptop.png'});
});


test('card duration badges use hours and minutes consistently with seconds kept in the focus timer',async()=>{
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();await add('Focus practice');
  await page.getByRole('button',{name:'Start focus Focus practice',exact:true}).click();await expect(page.getByRole('button',{name:'Pause focus',exact:true})).toBeEnabled();
  let instant=Date.parse('2026-10-25T07:30:00.000Z');
  for(let tick=0;tick<18;tick++) {
    instant+=10000;await application!.evaluate((_electron,value)=>{process.env.LAPTOP_PLANNER_TEST_NOW=value;},new Date(instant).toISOString());
    await page.evaluate(()=>window.planner.getDay());
  }
  await expect(page.getByTestId('focus-elapsed')).toHaveText('03:00');
  await expect(page.getByRole('button',{name:'Edit duration for Focus practice',exact:true})).toHaveText('0:03 / 0:45');
});

test('calendar divider supports pointer resize, cancellation, keyboard bounds and remembered width without changing planner data',async()=>{
  await page.setViewportSize({width:1440,height:900});
  await add('Prepare workshop','90m');
  const before=await page.evaluate(()=>window.planner.getDay());
  const divider=page.getByRole('separator',{name:'Resize calendar',exact:true});
  const initial=(await page.locator('.calendar-dock').boundingBox())!.width;
  const grip=(await divider.boundingBox())!;
  await page.mouse.move(grip.x+grip.width/2,grip.y+200);await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2-60,grip.y+200,{steps:8});
  await expect.poll(async()=>(await page.locator('.calendar-dock').boundingBox())!.width).toBeCloseTo(initial+60,0);
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect.poll(async()=>(await page.locator('.calendar-dock').boundingBox())!.width).toBeCloseTo(initial,0);
  await expect(divider).toHaveAttribute('aria-valuenow',String(Math.round(initial)));
  await divider.focus();await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow',String(Math.round(initial)+24));
  await page.reload();await expect(page.getByRole('button',{name:/^Add task for /}).first()).toBeEnabled();
  await expect(page.getByRole('separator',{name:'Resize calendar',exact:true})).toHaveAttribute('aria-valuenow',String(Math.round(initial)+24));
  await page.getByRole('separator',{name:'Resize calendar',exact:true}).focus();await page.keyboard.press('Home');
  await expect(page.locator('.calendar-dock')).toHaveCSS('width','240px');
  await page.keyboard.press('End');await expect(page.locator('.calendar-dock')).toHaveCSS('width','480px');
  await page.setViewportSize({width:860,height:680});
  await expect.poll(async()=>(await page.locator('.planner-main').boundingBox())!.width).toBeGreaterThanOrEqual(280);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('separator',{name:'Resize calendar',exact:true}).dblclick();
  await expect.poll(async()=>(await page.locator('.calendar-dock').boundingBox())!.width).toBeCloseTo(initial,0);
  expect(await page.evaluate(()=>window.planner.getDay())).toEqual(before);
});

test('day totals live in each column, overflow is exposed there, and the Today view keeps the summary',async()=>{
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async()=>{
    for(const [title,plannedMinutes,plannedDate] of [
      ['Outline the workshop',90,'2026-10-25'],['Write the first draft',120,'2026-10-25'],
      ['Review the prototype',45,'2026-10-25'],['Read and take notes',30,'2026-10-26'],
      ['Plan next week',45,'2026-10-27'],['An ambitious afternoon',900,'2026-10-25'],
    ] as const){
      const result=await window.planner.saveTask({title,notes:'Disposable UI review fixture',plannedMinutes,plannedDate,viewDate:'2026-10-25'});
      if(!result.ok)throw new Error(result.error.message);
    }
  });
  await page.getByRole('button',{name:'Go to today',exact:true}).click();
  const today=page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  await expect(today.locator('.task-add-bar strong')).toHaveText('19h 15m');
  await expect(today.locator('.board-capacity')).toContainText('won’t fit');
  // The board itself has no separate workload strip above the columns.
  await expect(page.getByRole('region',{name:'Daily summary',exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/planner-ui-phase1-wide.png'});
  await page.getByRole('region',{name:'Multi-day board',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-26');
  const tomorrow=page.locator('[data-testid="board-day"][data-date="2026-10-26"]');
  await expect(tomorrow.locator('.task-add-bar strong')).toHaveText('30m');
  await expect(tomorrow.locator('.board-capacity')).toHaveCount(0);
  // The full workload summary is kept on the Today view.
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();
  const summary=page.getByRole('region',{name:'Daily summary',exact:true});
  await expect(summary).toHaveClass(/is-over-capacity/);
  await expect(page.getByTestId('planned-total')).toHaveText('19h 15m');
  await page.setViewportSize({width:860,height:680});
  await page.screenshot({path:'test-results/planner-ui-phase1-laptop.png'});
});
