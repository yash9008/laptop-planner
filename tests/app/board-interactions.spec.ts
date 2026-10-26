import {test,expect,_electron as electron,type ElectronApplication,type Page,type Locator} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
let app:ElectronApplication;let directory:string;let page:Page;
test.beforeEach(async()=>{
  directory=await mkdtemp(join(tmpdir(),'laptop-planner-board-interactions-'));
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[resolve('.')],env:{...env,TZ:'Asia/Kolkata',LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:'2026-10-25T07:30:00.000Z'}});
  page=await app.firstWindow();
  // Match the native content surface to the emulated page viewport. Native
  // wheel hit-testing must not target pixels below the real window's edge.
  const contentSize=await app.evaluate(({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0]!;
    const before=window.getContentSize();window.setContentSize(1440,900);
    return {before,after:window.getContentSize()};
  });
  if(process.env.CI)console.log('Board native content size:',contentSize);
  await page.setViewportSize({width:1440,height:900});
  await expect(page.getByRole('region',{name:'Multi-day board',exact:true})).toBeVisible();
});
test.afterEach(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});
const column=(date:string)=>page.locator(`[data-testid="board-day"][data-date="${date}"]`);
const board=()=>page.getByRole('region',{name:'Multi-day board',exact:true});
async function data(){return page.evaluate(async()=>{const result=await window.planner.getDay('2026-10-25');if(!result.ok)throw new Error(result.error.message);return result.value;});}
async function seed(){
  await page.evaluate(async()=>{
    for(const [title,plannedDate,plannedMinutes] of [['Alpha','2026-10-25',30],['Beta','2026-10-25',60],['Gamma','2026-10-25',45],['Monday work','2026-10-26',90],['Tuesday work','2026-10-27',120]] as const){
      const result=await window.planner.saveTask({title,plannedDate,plannedMinutes,notes:`Notes for ${title}`,viewDate:'2026-10-25'});if(!result.ok)throw new Error(result.error.message);
    }
  });
  await page.getByRole('button',{name:'Go to today',exact:true}).click();
  await expect(column('2026-10-25').getByTestId('board-task')).toHaveCount(3);
}
async function lift(title:string){
  const source=page.getByRole('button',{name:title,exact:true});const rect=(await source.boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2+10,rect.y+rect.height/2,{steps:3});
  await expect(page.getByTestId('board-drop-placeholder')).toBeVisible();
}
async function point(target:Locator,where:'top'|'bottom'='top'){
  const rect=(await target.boundingBox())!;const x=rect.x+rect.width/2;const y=where==='top'?rect.y+4:rect.y+rect.height-4;
  await page.mouse.move(x,y,{steps:5});await page.mouse.move(x+1,y);
}
async function panBy(pixels:number,button:'left'|'right'='right'){
  const rect=(await board().boundingBox())!;const x=rect.x+Math.min(rect.width-25,Math.max(50,pixels+30));const y=rect.y+rect.height-70;
  await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x-pixels,y,{steps:12});await page.mouse.up({button});
}

test('whole-card drag animates a live slot, reorders once and inserts across days without losing task data',async()=>{
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message));await seed();
  const original=(await data()).tasks.find((task)=>task.title==='Gamma')!;
  await lift('Gamma');await point(page.getByRole('button',{name:'Alpha',exact:true}));
  await expect(page.getByTestId('board-drop-placeholder')).toHaveAttribute('data-target-date','2026-10-25');
  const placeholder=await page.getByTestId('board-drop-placeholder').boundingBox();const alpha=await page.getByRole('button',{name:'Alpha',exact:true}).boundingBox();expect(placeholder!.y).toBeLessThan(alpha!.y);
  await page.screenshot({path:'test-results/board-live-insertion.png'});
  await page.mouse.up();await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);
  await expect.poll(async()=>(await data()).tasks.map((task)=>task.title)).toEqual(['Gamma','Alpha','Beta']);
  await lift('Alpha');await point(page.getByRole('button',{name:'Monday work',exact:true}));
  await expect(page.getByTestId('board-drop-placeholder')).toHaveAttribute('data-target-date','2026-10-26');
  await page.mouse.up();await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);
  const after=await data();expect(after.board[1]!.tasks.map((task)=>task.title)).toEqual(['Alpha','Monday work']);
  expect(after.allTasks.find((task)=>task.id===original.id)!.notes).toEqual(original.notes);
  expect(after.allTasks).toHaveLength(5);expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Alpha',exact:true}).click();await expect(page.getByRole('dialog',{name:'Edit task',exact:true})).toBeVisible();
});

test('Escape and dropping outside the board cancel a lifted task without writing',async()=>{
  await seed();const before=(await data()).allTasks;
  await lift('Alpha');await point(page.getByRole('button',{name:'Monday work',exact:true}));await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);expect((await data()).allTasks).toEqual(before);
  await lift('Alpha');const toolbar=(await page.getByRole('button',{name:'Go to today',exact:true}).boundingBox())!;
  await page.mouse.move(toolbar.x+toolbar.width/2,toolbar.y+toolbar.height/2,{steps:5});await page.mouse.up();
  await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);expect((await data()).allTasks).toEqual(before);
});

test('right-drag pans continuously, nearest left column selects calendar, saves retain position, Today resets',async()=>{
  await seed();const before=(await data()).allTasks;
  await page.getByRole('button',{name:'Monday work',exact:true}).hover();await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-25');
  await panBy(200);await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-26');
  await expect(page.locator('.calendar-day-number')).toHaveText('26');await expect(page.getByTestId('planned-total')).toHaveText('1h 30m');
  await expect(page.getByTestId('calendar-block')).toHaveAccessibleName('Monday work, 6:00 AM to 7:30 AM');
  expect(await board().evaluate((host)=>host.scrollLeft)).toBeCloseTo(200,0);
  await panBy(272);await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-27');await expect(page.locator('.calendar-day-number')).toHaveText('27');
  expect((await data()).allTasks).toEqual(before);await expect(column('2026-10-25')).toBeAttached();
  await page.getByRole('button',{name:'Add task',exact:true}).click();const form=page.getByRole('dialog',{name:'New task',exact:true});
  await expect(form.getByLabel('Day',{exact:true})).toHaveValue('2026-10-27');await form.getByLabel('Task title',{exact:true}).fill('Tuesday extra');await form.getByLabel('Estimated time',{exact:true}).fill('30m');await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-27');expect(await board().evaluate((host)=>host.scrollLeft)).toBeCloseTo(472,0);
  await page.getByRole('button',{name:'Create fixed event',exact:true}).click();await expect(page.getByRole('dialog',{name:'New fixed event',exact:true}).getByLabel('Start day',{exact:true})).toHaveValue('2026-10-27');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await panBy(-272);await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-26');
  await page.getByRole('button',{name:'Go to today',exact:true}).click();await expect.poll(()=>board().evaluate((host)=>host.scrollLeft)).toBe(0);await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-25');
});

test('horizontal wheel, empty-board left drag and keyboard scrolling follow the same nearest-day rule',async()=>{
  await seed();const bounds=(await board().boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height-60);await page.mouse.wheel(160,0);
  try {
    await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-26');
  } catch(error) {
    // Preserve useful geometry in CI logs without changing the native gesture
    // or requiring stored screenshots/artifacts to diagnose the failure.
    console.log('Board wheel failure:',await board().evaluate((host)=>{
      const bounds=host.getBoundingClientRect();const x=bounds.x+bounds.width/2;const y=bounds.y+bounds.height-60;
      const target=document.elementFromPoint(x,y);
      return {scrollLeft:host.scrollLeft,scrollWidth:host.scrollWidth,clientWidth:host.clientWidth,viewport:{width:innerWidth,height:innerHeight},bounds:bounds.toJSON(),target:target?.className,overflowX:getComputedStyle(host).overflowX,focused:document.hasFocus(),columns:[...host.querySelectorAll('[data-testid="board-day"]')].slice(0,3).map((column)=>({date:(column as HTMLElement).dataset.date,left:column.getBoundingClientRect().left,width:column.getBoundingClientRect().width}))};
    }));
    throw error;
  }
  await panBy(272,'left');await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-27');
  await board().focus();await page.keyboard.press('ArrowLeft');await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-26');
  await page.screenshot({path:'test-results/board-calendar-follows-pan.png'});
});

test('a rejected save removes the preview, restores both lists and shows the failure',async()=>{
  await seed();const before=(await data()).allTasks;
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('planner:move-task');ipcMain.handle('planner:move-task',()=>({ok:false,error:{code:'SAVE_FAILED',message:'Test disk is full. Your move was not saved.'}}));});
  await lift('Alpha');await point(page.getByRole('button',{name:'Monday work',exact:true}));await page.mouse.up();
  await expect(page.getByTestId('board-drop-placeholder')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('Test disk is full.');
  expect((await data()).allTasks).toEqual(before);await expect(column('2026-10-25').getByRole('button',{name:'Alpha',exact:true})).toBeVisible();
  await expect(column('2026-10-26').getByTestId('board-task')).toHaveCount(1);
});
