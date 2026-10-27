import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import type {Menu,Tray} from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

declare global {var menuBarTest:{tray:Tray|null;menu:Menu|null;errors:string[]}|undefined;}
let app:ElectronApplication;let page:Page;let directory:string;let clock:number;
async function launch(){
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[resolve('.')],env:{...env,TZ:'Asia/Kolkata',LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:new Date(clock).toISOString()}});
  page=await app.firstWindow();await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();
  await app.evaluate(({Tray,dialog})=>{
    globalThis.menuBarTest={tray:null,menu:null,errors:[]};
    const title=Tray.prototype.setTitle;const menu=Tray.prototype.setContextMenu;
    Tray.prototype.setTitle=function(...args){globalThis.menuBarTest!.tray=this;return title.apply(this,args);};
    Tray.prototype.setContextMenu=function(value){globalThis.menuBarTest!.menu=value;return menu.call(this,value);};
    dialog.showErrorBox=(_title,message)=>{globalThis.menuBarTest!.errors.push(message);};
  });
  await page.getByRole('button',{name:'Daily planner',exact:true}).click();
}
async function title(){return app.evaluate(()=>{const tray=globalThis.menuBarTest?.tray;return tray && !tray.isDestroyed()?tray.getTitle():null;});}
async function menuLabel(id:string){return app.evaluate((_electron,id)=>globalThis.menuBarTest?.menu?.getMenuItemById(id)?.label,id);}
async function clickMenu(id:string){await app.evaluate((_electron,id)=>{const item=globalThis.menuBarTest?.menu?.getMenuItemById(id);if(!item?.enabled)throw new Error(`Menu item unavailable: ${id}`);item.click();},id);}
async function advance(ms:number){clock+=ms;await app.evaluate((_electron,iso)=>{process.env.LAPTOP_PLANNER_TEST_NOW=iso;},new Date(clock).toISOString());}
async function add(title='Practice'){
  await page.getByRole('button',{name:'Add task',exact:true}).click();const form=page.getByRole('dialog',{name:'New task',exact:true});
  await form.getByLabel('Task title',{exact:true}).fill(title);await form.getByLabel('Estimated time',{exact:true}).fill('45m');await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();
}
async function start(title='Practice'){await page.getByRole('button',{name:`Start focus ${title}`,exact:true}).click();await expect.poll(()=>menuLabel('focus-task')).toBe(title);}
test.beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'laptop-planner-menu-bar-'));clock=Date.parse('2026-10-25T07:30:00.000Z');await launch();});
test.afterEach(async({},info)=>{
  if(info.status!==info.expectedStatus) {
    console.log('NATIVE_MENU_FAILURE_STATE',await app.evaluate(()=>({
      errors:globalThis.menuBarTest?.errors,
      title:globalThis.menuBarTest?.tray?.getTitle(),
      toggle:globalThis.menuBarTest?.menu?.getMenuItemById('focus-toggle')?.label,
      state:globalThis.menuBarTest?.menu?.getMenuItemById('focus-state')?.label,
    })).catch(()=>null));
    console.log('NATIVE_MENU_FAILURE_FOCUS',await page.evaluate(async()=>{
      const result=await window.planner.getDay();return result.ok?result.value.focus:result.error;
    }).catch(()=>null));
  }
  await app?.close();await rm(directory,{recursive:true,force:true});
});

test('native timer updates in background; native menu pauses, resumes and reopens the planner',async()=>{
  expect(await title()).toBeNull();await add();await start();await expect.poll(title).toBe('00:00');
  await advance(5000);await expect.poll(title).toBe('00:05');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.hide());
  await advance(5000);await expect.poll(title).toBe('00:10');await clickMenu('focus-open');
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  await clickMenu('focus-toggle');await expect.poll(title).toBe('Ⅱ 00:10');await expect(page.getByRole('button',{name:'Resume focus',exact:true})).toBeEnabled();
  await advance(3600000);await expect.poll(()=>menuLabel('focus-toggle')).toBe('Resume timer');expect(await title()).toBe('Ⅱ 00:10');
  await clickMenu('focus-toggle');await advance(3000);await expect.poll(title).toBe('00:13');
  await expect(page.getByTestId('focus-elapsed')).toHaveText('00:13');await expect.poll(()=>menuLabel('focus-elapsed')).toBe('00:13 elapsed · 45m planned');
  await page.getByRole('button',{name:'Complete task',exact:true}).click();await expect.poll(title).toBeNull();
});

test('switching and editing focus updates the native menu; deleting the task removes it',async()=>{
  await add('First');await add('Second');await start('First');await advance(2000);await expect.poll(title).toBe('00:02');
  await start('Second');await expect.poll(title).toBe('00:00');
  await page.getByRole('button',{name:'Second',exact:true}).click();const form=page.getByRole('dialog',{name:'Edit task',exact:true});await form.getByLabel('Task title',{exact:true}).fill('Second renamed');await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).not.toBeVisible();
  await expect.poll(()=>menuLabel('focus-task')).toBe('Second renamed');await page.getByRole('button',{name:'Delete Second renamed',exact:true}).click();await expect.poll(title).toBeNull();
});

test('sleep and clean restart keep a paused menu timer and exclude closed time',async()=>{
  await add();await start();await advance(6000);await expect.poll(title).toBe('00:06');
  await app.evaluate(({powerMonitor})=>powerMonitor.emit('suspend'));await expect.poll(title).toBe('Ⅱ 00:06');await expect.poll(()=>menuLabel('focus-state')).toBe('Paused for sleep');
  await advance(3600000);await app.evaluate(({powerMonitor})=>powerMonitor.emit('resume'));expect(await title()).toBe('Ⅱ 00:06');
  await clickMenu('focus-toggle');
  await expect.poll(()=>menuLabel('focus-toggle')).toBe('Pause timer');
  expect(await app.evaluate(()=>globalThis.menuBarTest?.errors)).toEqual([]);
  await expect.poll(()=>page.evaluate(async()=>{
    const result=await window.planner.getDay();return result.ok?result.value.focus?.running:false;
  })).toBe(true);
  await advance(4000);await expect.poll(title).toBe('00:10');
  await app.close();clock+=3600000;await launch();await expect.poll(title).toBe('Ⅱ 00:10');
  await expect(page.getByRole('button',{name:'Resume focus',exact:true})).toBeEnabled();
});

test('repeated sleep and explicit native resume preserve only the committed running intervals',async()=>{
  await add();await start();
  for(let cycle=1;cycle<=5;cycle++) {
    await advance(2000);await expect.poll(title).toBe(`00:${String(cycle*2).padStart(2,'0')}`);
    await app.evaluate(({powerMonitor})=>powerMonitor.emit('suspend'));
    await expect.poll(()=>menuLabel('focus-state')).toBe('Paused for sleep');
    await expect.poll(title).toBe(`Ⅱ 00:${String(cycle*2).padStart(2,'0')}`);
    await advance(3600000);
    await app.evaluate(({powerMonitor})=>powerMonitor.emit('resume'));
    expect(await title()).toBe(`Ⅱ 00:${String(cycle*2).padStart(2,'0')}`);
    await clickMenu('focus-toggle');
    await expect.poll(()=>menuLabel('focus-toggle')).toBe('Pause timer');
    expect(await app.evaluate(()=>globalThis.menuBarTest?.errors)).toEqual([]);
    await expect.poll(()=>page.evaluate(async()=>{
      const result=await window.planner.getDay();return result.ok?result.value.focus?.running:false;
    })).toBe(true);
  }
  await clickMenu('focus-toggle');await expect.poll(title).toBe('Ⅱ 00:10');
  const focus=await page.evaluate(async()=>{
    const result=await window.planner.getDay();if(!result.ok)throw new Error(result.error.message);return result.value.focus;
  });
  expect(focus?.running).toBe(false);expect(focus?.actualMilliseconds).toBe(10000);
});

test('menu timer retains the active task across midnight',async()=>{
  await add();clock=Date.parse('2026-10-25T18:29:50.000Z');await advance(0);await start();
  await advance(10000);await expect.poll(title).toBe('00:10');await advance(5000);await expect.poll(title).toBe('00:15');await expect.poll(()=>menuLabel('focus-task')).toBe('Practice');
  await clickMenu('focus-toggle');await expect.poll(title).toBe('Ⅱ 00:15');await expect(page.getByRole('button',{name:'Resume focus',exact:true})).toBeEnabled();
});

test('failed native pause reports the error and keeps the saved running state',async()=>{
  await add();await start();
  async function trigger(remove:boolean){await app.evaluate(async({app},remove)=>{
    await new Promise<void>((resolve)=>setImmediate(resolve));
    const require=process.getBuiltinModule('node:module').createRequire(`${app.getAppPath()}/package.json`);
    const Database=require('better-sqlite3');const database=new Database(`${app.getPath('userData')}/planner.sqlite`);
    try {database.exec(remove?'DROP TRIGGER IF EXISTS menu_pause_failure':"CREATE TRIGGER menu_pause_failure BEFORE UPDATE OF ended_at ON focus_sessions BEGIN SELECT RAISE(ABORT,'Test disk failure'); END;");}finally{database.close();}
  },remove);}
  await trigger(false);
  try {
    await clickMenu('focus-toggle');await expect.poll(()=>app.evaluate(()=>globalThis.menuBarTest?.errors.length)).toBe(1);
    expect(await title()).toBe('00:00');expect(await menuLabel('focus-toggle')).toBe('Pause timer');
    await expect(page.getByRole('button',{name:'Pause focus',exact:true})).toBeEnabled();
  }finally{await trigger(true);}
  await clickMenu('focus-toggle');await expect.poll(title).toBe('Ⅱ 00:00');
});
