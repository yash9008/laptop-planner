import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let application:ElectronApplication|undefined;
let directory:string;let page:Page;let clock:number;
async function launch() {
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  application=await electron.launch({args:[resolve('.')],env:{...env,TZ:'Asia/Kolkata',LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:new Date(clock).toISOString()}});
  page=await application.firstWindow();await expect(page.getByRole('button',{name:/^Add task for /}).first()).toBeEnabled();await page.getByRole('button',{name:'Daily planner',exact:true}).click();
}
async function setClock(at:number) {clock=at;await application!.evaluate((_electron,iso)=>{process.env.LAPTOP_PLANNER_TEST_NOW=iso;},new Date(clock).toISOString());}
async function data() {return page.evaluate(async()=>{const result=await window.planner.getDay();if(!result.ok)throw new Error(result.error.message);return result.value;});}
async function add(title:string,repeat?:'daily'|'weekdays') {
  await page.keyboard.press('a');const form=page.getByRole('dialog',{name:'New task',exact:true});
  await form.getByLabel('Task title',{exact:true}).fill(title);await form.getByLabel('Estimated time',{exact:true}).fill('45m');
  if(repeat) {
    await form.getByRole('button',{name:'Open full details',exact:true}).click();
    await form.getByLabel('Repeat task',{exact:true}).selectOption(repeat);
  }
  return form;
}
async function saveTask(title:string,repeat?:'daily'|'weekdays') {const form=await add(title,repeat);await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();}
async function start(title='Practice') {await page.getByRole('button',{name:`Start focus ${title}`,exact:true}).click();await expect(page.getByRole('button',{name:'Pause focus',exact:true})).toBeEnabled();}

test.beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'laptop-planner-phase5-'));clock=Date.parse('2026-10-25T07:30:00.000Z');await launch();});
test.afterEach(async()=>{await application?.close();application=undefined;await rm(directory,{recursive:true,force:true});});

test('daily repeats keep independent completion, editing scope and identity after restarting',async()=>{
  await saveTask('Typing daily','daily');let snapshot=await data();expect(snapshot.allTasks).toHaveLength(7);const firstId=snapshot.tasks[0]!.id;
  await page.getByRole('checkbox',{name:'Complete Typing daily',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Reopen Typing daily',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Typing daily',exact:true}).click();const form=page.getByRole('dialog',{name:'Edit task',exact:true});
  await expect(form.getByText(/Changes here affect only this occurrence/)).toBeVisible();
  await form.getByLabel('Task title',{exact:true}).fill('Only this Sunday');
  await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).not.toBeVisible();
  await application!.close();application=undefined;await launch();snapshot=await data();
  expect(snapshot.tasks[0]!.id).toBe(firstId);expect(snapshot.tasks[0]!.completed).toBe(true);expect(snapshot.board[1]!.tasks[0]!.completed).toBe(false);expect(snapshot.board[1]!.tasks[0]!.title).toBe('Typing daily');
  await page.getByRole('button',{name:'Only this Sunday',exact:true}).click();
  await page.getByLabel('Stop future repeats',{exact:true}).check();await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();expect((await data()).allTasks).toHaveLength(1);
});

test('selected-weekday picker creates only selected dates and an occurrence can be deleted without duplication',async()=>{
  const form=await add('Study','weekdays');await form.getByLabel('Day',{exact:true}).fill('2026-10-26');
  for(const day of ['Tue','Thu','Fri'])await form.getByLabel(`Repeat on ${day}`,{exact:true}).uncheck();
  await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();
  let snapshot=await data();expect(snapshot.allTasks.map((task)=>task.plannedDate).sort()).toEqual(['2026-10-26','2026-10-28']);
  await page.getByLabel('Go to date',{exact:true}).fill('2026-10-26');await expect(page.getByRole('button',{name:'Study',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete Study',exact:true}).click();await expect(page.getByTestId('task-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();await page.getByLabel('Go to date',{exact:true}).fill('2026-10-26');await expect(page.getByTestId('task-card')).toHaveCount(0);
  snapshot=await data();expect(snapshot.allTasks.some((task)=>task.occurrenceDate==='2026-10-26')).toBe(false);
});

test('active lower task comes first; pause/resume and completion retain actual versus planned time',async()=>{
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message));
  await saveTask('First');await saveTask('Practice');await start();
  const focused=(await data()).focus!.taskId;await expect(page.getByTestId('calendar-block').first()).toHaveAttribute('data-task-id',focused);
  await setClock(clock+3000);await expect(page.getByTestId('focus-elapsed')).toHaveText('00:03');
  await page.getByRole('button',{name:'Pause focus',exact:true}).click();await expect(page.getByRole('button',{name:'Resume focus',exact:true})).toBeEnabled();
  await setClock(clock+3600000);await page.getByRole('button',{name:'Resume focus',exact:true}).click();await expect(page.getByRole('button',{name:'Pause focus',exact:true})).toBeEnabled();
  await expect(page.getByTestId('focus-elapsed')).toHaveText('00:03');
  await setClock(clock+4000);await expect(page.getByTestId('focus-elapsed')).toHaveText('00:07');
  await page.screenshot({path:'test-results/planner-focus.png'});
  await page.getByRole('button',{name:'Complete task',exact:true}).click();await expect(page.getByRole('region',{name:'Focus timer',exact:true})).toHaveCount(0);
  await expect(page.getByRole('checkbox',{name:'Reopen Practice',exact:true})).toBeChecked();await expect(page.getByTestId('actual-total')).toHaveText('00:07');
  expect((await data()).allTasks.find((task)=>task.id===focused)!.actualMinutes).toBe(7/60);expect(errors).toEqual([]);
});

test('native sleep/resume events pause focus and exclude the sleeping interval',async()=>{
  await saveTask('Practice');await start();await setClock(clock+5000);await expect(page.getByTestId('focus-elapsed')).toHaveText('00:05');
  await application!.evaluate(({powerMonitor})=>{powerMonitor.emit('suspend');});
  await expect(page.getByText('Paused for sleep. Resume when you’re ready.',{exact:true})).toBeVisible();
  await setClock(clock+3600000);await application!.evaluate(({powerMonitor})=>{powerMonitor.emit('resume');});
  await expect(page.getByTestId('focus-elapsed')).toHaveText('00:05');expect((await data()).focus!.running).toBe(false);
  await page.getByRole('button',{name:'Resume focus',exact:true}).click();await expect(page.getByRole('button',{name:'Pause focus',exact:true})).toBeEnabled();
});

test('clean quit and restart keep a paused timer without counting closed time',async()=>{
  await saveTask('Practice');await start();await setClock(clock+7000);await expect(page.getByTestId('focus-elapsed')).toHaveText('00:07');
  await application!.close();application=undefined;clock+=3600000;await launch();
  await expect(page.getByText('Paused when you quit. Time while closed was not counted.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('focus-elapsed')).toHaveText('00:07');await expect(page.getByRole('button',{name:'Resume focus',exact:true})).toBeEnabled();
});

test('a killed process recovers only persisted focus checkpoints and remains paused',async()=>{
  await saveTask('Practice');await start();await setClock(clock+5000);await expect(page.getByTestId('focus-elapsed')).toHaveText('00:05');
  const process=application!.process();const exited=once(process,'exit');process.kill('SIGKILL');await exited;application=undefined;
  clock+=3600000;await launch();
  await expect(page.getByText('Interrupted session recovered. Only saved focus time was kept.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('focus-elapsed')).toHaveText('00:05');expect((await data()).focus!.running).toBe(false);
});

test('open app crosses midnight, creates one new repeat, and retains the old running task identity',async()=>{
  await saveTask('Practice','daily');const previous=(await data()).tasks[0]!.id;
  await setClock(Date.parse('2026-10-25T18:29:50.000Z'));await start();
  await setClock(clock+10000);await expect(page.getByText('October 26, 2026',{exact:true})).toBeVisible();
  await expect(page.getByTestId('focus-elapsed')).toHaveText('00:10');
  await setClock(clock+5000);await expect(page.getByTestId('focus-elapsed')).toHaveText('00:15');
  let snapshot=await data();expect(snapshot.focus!.taskId).toBe(previous);expect(snapshot.focus!.running).toBe(true);
  expect(snapshot.tasks).toHaveLength(1);expect(snapshot.tasks[0]!.id).not.toBe(previous);expect(snapshot.tasks[0]!.actualMinutes).toBe(0);expect(snapshot.actualMinutesOnDate).toBe(5/60);
  await page.getByRole('button',{name:'Complete task',exact:true}).click();await expect(page.getByRole('region',{name:'Focus timer',exact:true})).toHaveCount(0);
  await expect(page.getByRole('checkbox',{name:'Complete Practice',exact:true})).not.toBeChecked();
  await application!.close();application=undefined;clock+=3600000;await launch();snapshot=await data();
  expect(snapshot.tasks).toHaveLength(1);expect(snapshot.tasks[0]!.occurrenceDate).toBe('2026-10-26');expect(snapshot.tasks[0]!.completed).toBe(false);
});
