import { test, expect, _electron as electron, type ElectronApplication, type Page, type Locator } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application: ElectronApplication | undefined;
let directory: string;
let page: Page;
async function launch() {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({args:[resolve('.')], env:{...env,TZ:'Asia/Kolkata',LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:'2026-10-25T07:30:00.000Z'}});
  page = await application.firstWindow();
  await expect(page.getByRole('button',{name:/^Add task for /}).first()).toBeEnabled();
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();
}
test.beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'laptop-planner-phase4-'));await launch();});
test.afterEach(async()=>{await application?.close();application=undefined;await rm(directory,{recursive:true,force:true});});
async function snapshot(date?:string) {
  return page.evaluate(async(date)=>{const result=await window.planner.getDay(date); if(!result.ok)throw new Error(result.error.message);return result.value;},date);
}
async function addTask(title='Deep work',estimate='2h') {
  await page.keyboard.press('a');
  const form=page.getByRole('dialog',{name:'New task',exact:true});
  await form.getByLabel('Task title',{exact:true}).fill(title);
  await form.getByLabel('Estimated time',{exact:true}).fill(estimate);
  await form.getByRole('button',{name:'Add to day',exact:true}).click();
  await expect(form).not.toBeVisible();
}
async function addEvent(title='Meeting',start='14:00',end='16:00') {
  await page.getByRole('button',{name:'Add fixed event',exact:true}).click();
  const form=page.getByRole('dialog',{name:'New fixed event',exact:true});
  await form.getByLabel('Event title',{exact:true}).fill(title);
  await form.getByLabel('Start time',{exact:true}).fill(start);
  await form.getByLabel('End time',{exact:true}).fill(end);
  await form.getByRole('button',{name:'Add event',exact:true}).click();
  await expect(form).not.toBeVisible();
}
async function verticalDrag(handle:Locator,delta:number) {
  await handle.scrollIntoViewIfNeeded(); const box=await handle.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2+delta,{steps:8});
  await page.mouse.up();
}

async function dragAcross(source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from=await source.boundingBox();const viewport=await page.getByRole('region',{name:'Multi-day board',exact:true}).boundingBox();
  expect(from).not.toBeNull();expect(viewport).not.toBeNull();
  const left=viewport!.x;const right=left+viewport!.width;
  const x=from!.x+from!.width/2;const y=from!.y+from!.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(x>right-30?-10:10),y,{steps:3});
  let to=(await target.boundingBox())!;
  const visible=()=>Math.min(right,to.x+to.width)-Math.max(left,to.x);
  if(visible()<Math.min(to.width,viewport!.width)-32){
    const edge=to.x+to.width/2>(left+right)/2?right-12:left+12;
    const edgeY=viewport!.y+Math.min(160,viewport!.height/2);
    await page.mouse.move(edge,edgeY,{steps:3});await page.mouse.move(edge+1,edgeY);
    await page.waitForFunction((element)=>{
      const target=element!.getBoundingClientRect();const panel=element!.closest('.planning-board')!.getBoundingClientRect();
      return Math.min(target.right,panel.right)-Math.max(target.left,panel.left)>Math.min(target.width,panel.width)-32;
    },await target.elementHandle(),{polling:'raf',timeout:5000});
  }
  to=(await target.boundingBox())!;
  const dropX=(Math.max(left,to.x)+Math.min(right,to.x+to.width))/2;const dropY=to.y+Math.min(200,to.height/2);
  await page.mouse.move(dropX,dropY);await page.mouse.move(dropX+1,dropY);await page.mouse.up();
}

test('fixed event splits 1–2 / 4–5 PM, real pointer drag and resize save, and restart retains it',async()=>{
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message));
  await addTask(); await addEvent();
  await expect(page.getByTestId('calendar-block')).toHaveCount(2);
  await expect(page.getByTestId('calendar-block').first()).toHaveAccessibleName('Deep work, 1:00 PM to 2:00 PM');
  await expect(page.getByTestId('calendar-block').last()).toHaveAccessibleName('Deep work, 4:00 PM to 5:00 PM');
  await expect(page.getByTestId('scheduled-total')).toHaveText('4h');
  await page.screenshot({path:'test-results/planner-events.png'});
  await verticalDrag(page.getByRole('button',{name:'Move event Meeting',exact:true}),48);
  await expect.poll(async()=> (await snapshot()).events[0]!.start.minute).toBe(900);
  await expect(page.getByTestId('calendar-block')).toHaveCount(1);
  await verticalDrag(page.getByRole('button',{name:'Resize event Meeting',exact:true}),48);
  await expect.poll(async()=> (await snapshot()).events[0]!.end.minute).toBe(1080);
  await expect(page.getByRole('button',{name:'Resize event Meeting',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Resize event Meeting',exact:true}).press('ArrowUp');
  await expect.poll(async()=> (await snapshot()).events[0]!.end.minute).toBe(1065);
  const before=await snapshot();
  await application!.close();application=undefined;await launch();
  expect((await snapshot()).events).toEqual(before.events);
  await expect(page.getByRole('button',{name:'Edit event Meeting',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('event edit validates time, overlapping events stay visible in separate lanes, and deletion reflows',async()=>{
  await addTask();await addEvent();await addEvent('Review','15:00','17:00');
  await expect(page.getByText('Fixed events overlap. Check their times.',{exact:true})).toBeVisible();
  const meetings=page.getByTestId('fixed-event');await expect(meetings).toHaveCount(2);
  const first=await meetings.first().boundingBox();const second=await meetings.last().boundingBox();
  expect(Math.abs(first!.x-second!.x)).toBeGreaterThan(50);
  await page.getByRole('button',{name:'Edit event Meeting',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Edit fixed event',exact:true});
  await form.getByLabel('End time',{exact:true}).fill('13:00');
  await form.getByRole('button',{name:'Save event',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('end after it starts');
  expect((await snapshot()).events[0]!.end.minute).toBe(960);
  await form.getByLabel('End time',{exact:true}).fill('15:00');
  await form.getByLabel('Event title',{exact:true}).fill('Quick meeting');
  await form.getByRole('button',{name:'Save event',exact:true}).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByText('Fixed events overlap. Check their times.',{exact:true})).not.toBeVisible();
  for(const title of ['Quick meeting','Review']) {
    await page.getByRole('button',{name:`Edit event ${title}`,exact:true}).click();
    await page.getByRole('button',{name:'Delete event',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await expect(page.getByTestId('fixed-event')).toHaveCount(0);
  await expect(page.getByTestId('calendar-block')).toHaveAccessibleName('Deep work, 1:00 PM to 3:00 PM');
});

test('project details and deadlines persist; project backlog tasks can be scheduled without losing metadata',async()=>{
  await page.getByRole('button',{name:'New project',exact:true}).click();
  let form=page.getByRole('dialog',{name:'New project',exact:true});
  await form.getByLabel('Project title',{exact:true}).fill('Learning');
  await form.getByLabel('Project notes',{exact:true}).fill('Study a little every day.');
  await form.getByLabel('Project color',{exact:true}).fill('#aabbcc');
  await form.getByLabel('Project deadline',{exact:true}).fill('2026-11-01');
  await form.getByRole('button',{name:'Create project',exact:true}).click();await expect(form).not.toBeVisible();
  await page.getByRole('button',{name:'Open project Learning',exact:true}).click();
  await expect(page.getByText('Study a little every day.',{exact:true})).toBeVisible();
  await page.keyboard.press('a');
  form=page.getByRole('dialog',{name:'New task',exact:true});
  await expect(form.getByLabel('Keep in backlog',{exact:true})).toBeChecked();
  await form.getByLabel('Task title',{exact:true}).fill('Read chapter');
  await form.getByLabel('Estimated time',{exact:true}).fill('45m');
  await form.getByRole('button',{name:'Open full details',exact:true}).click();
  await form.getByLabel('Task deadline',{exact:true}).fill('2026-10-24');
  await form.getByRole('button',{name:'Add to backlog',exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.getByText('Overdue · Oct 24',{exact:true})).toBeVisible();
  let data=await snapshot();expect(data.backlog[0]!.projectId).toBe(data.projects[0]!.id);expect(data.plan.scheduledBlocks).toHaveLength(0);
  await page.getByRole('button',{name:'Read chapter',exact:true}).click();
  form=page.getByRole('dialog',{name:'Edit task',exact:true});
  await form.getByLabel('Keep in backlog',{exact:true}).uncheck();
  await form.getByLabel('Day',{exact:true}).fill('2026-10-26');
  await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).not.toBeVisible();
  await page.getByRole('button',{name:'Edit project',exact:true}).click();
  form=page.getByRole('dialog',{name:'Edit project',exact:true});
  await form.getByLabel('Project title',{exact:true}).fill('Study');
  await form.getByRole('button',{name:'Save project',exact:true}).click();await expect(form).not.toBeVisible();
  await page.screenshot({path:'test-results/planner-project.png'});
  data=await snapshot();expect(data.backlog).toHaveLength(0);expect(data.board[1]!.plan.scheduledBlocks[0]!.startMinute).toBe(360);
  await application!.close();application=undefined;await launch();
  await page.getByRole('button',{name:'Open project Study',exact:true}).click();
  await expect(page.getByRole('button',{name:'Read chapter',exact:true})).toBeVisible();
  expect((await snapshot()).allTasks[0]!.deadline).toBe('2026-10-24');
});

test('seven-day board drags a task across days and backlog, opens a day, and keeps overflow on its date',async()=>{
  await addTask('Long task','10h');
  await page.getByRole('button',{name:'Multi-day board',exact:true}).click();
  await expect(page.getByTestId('board-day')).toHaveCount(7);
  const today=page.locator('[data-testid="board-day"][data-date="2026-10-25"]');
  const tomorrow=page.locator('[data-testid="board-day"][data-date="2026-10-26"]');
  await expect(today).toContainText('1h won’t fit');
  await expect(tomorrow.getByTestId('board-task')).toHaveCount(0);
  await dragAcross(page.getByRole('button',{name:'Drag Long task between days',exact:true}),tomorrow);
  await expect(tomorrow.getByTestId('board-task')).toHaveCount(1);await expect(today.getByTestId('board-task')).toHaveCount(0);
  await dragAcross(page.getByRole('button',{name:'Drag Long task between days',exact:true}),page.getByTestId('board-backlog'));
  await expect(page.getByTestId('board-backlog').getByTestId('board-task')).toHaveCount(1);
  expect((await snapshot()).board.every((column)=>column.plan.scheduledBlocks.length===0)).toBe(true);
  await dragAcross(page.getByRole('button',{name:'Drag Long task between days',exact:true}),today);
  await expect(today.getByTestId('board-task')).toHaveCount(1);
  await page.screenshot({path:'test-results/planner-board.png'});
  await page.getByRole('button',{name:'Open 2026-10-26',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tomorrow',exact:true})).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(0);
  await application!.close();application=undefined;await launch();
  await expect(page.getByRole('button',{name:'Long task',exact:true})).toBeVisible();
  await expect(page.getByTestId('unscheduled-total')).toHaveText('1h');
});

test('board stays within a narrow window and creates a task directly on its chosen day',async()=>{
  await page.setViewportSize({width:860,height:680});
  await page.getByRole('button',{name:'Multi-day board',exact:true}).click();
  await page.getByRole('button',{name:'Add task for 2026-10-26',exact:true}).click();
  const form=page.getByRole('dialog',{name:'New task',exact:true});
  await expect(form.getByLabel('Day',{exact:true})).toHaveValue('2026-10-26');
  await form.getByLabel('Task title',{exact:true}).fill('Tomorrow only');
  await form.getByLabel('Estimated time',{exact:true}).fill('30m');
  await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const data=await snapshot();expect(data.tasks).toHaveLength(0);expect(data.board[1]!.tasks[0]!.title).toBe('Tomorrow only');
});

test('short events remain clickable and overnight events expose resizing on their final day',async()=>{
  await addEvent('Quick check','14:00','14:15');
  await page.getByRole('button',{name:'Edit event Quick check',exact:true}).click();
  let form=page.getByRole('dialog',{name:'Edit fixed event',exact:true});
  await expect(form.getByLabel('End time',{exact:true})).toHaveValue('14:15');
  await form.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Add fixed event',exact:true}).click();
  form=page.getByRole('dialog',{name:'New fixed event',exact:true});
  await form.getByLabel('Event title',{exact:true}).fill('Overnight');
  await form.getByLabel('Start time',{exact:true}).fill('23:00');
  await form.getByLabel('End day',{exact:true}).fill('2026-10-26');
  await form.getByLabel('End time',{exact:true}).fill('07:00');
  await form.getByRole('button',{name:'Add event',exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Resize event Overnight',exact:true})).toHaveCount(0);
  await page.getByLabel('Go to date',{exact:true}).fill('2026-10-26');
  await expect(page.getByRole('button',{name:'Resize event Overnight',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit event Overnight',exact:true}).click();
  form=page.getByRole('dialog',{name:'Edit fixed event',exact:true});
  await expect(form.getByLabel('Start day',{exact:true})).toHaveValue('2026-10-25');
  await expect(form.getByLabel('End day',{exact:true})).toHaveValue('2026-10-26');
});
