import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
let app:ElectronApplication;let page:Page;let directory:string;
async function launch(healthy=true){const env=Object.fromEntries(Object.entries({...process.env,LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:'2026-10-25T07:30:00.000Z'}).filter((entry):entry is [string,string]=>entry[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[resolve('.')],env});page=await app.firstWindow();if(healthy){await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Daily planner',exact:true}).click();}else await expect(page.getByRole('heading',{name:'Storage needs attention',exact:true})).toBeVisible();}
test.beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'planner-phase6-'));await launch();});
test.afterEach(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});
async function add(title='Keep this task'){await page.getByRole('button',{name:'Add task',exact:true}).click();const form=page.getByRole('dialog',{name:'New task',exact:true});await form.getByLabel('Task title',{exact:true}).fill(title);await form.getByLabel('Estimated time',{exact:true}).fill('2h');await form.getByRole('button',{name:'Open full details',exact:true}).click();await form.getByLabel('Notes',{exact:true}).fill('Original notes');return form;}
async function settings(){await page.getByRole('button',{name:'Settings',exact:true}).click();return page.getByRole('dialog',{name:'Settings',exact:true});}
async function sql(statement:string){await app.evaluate(async({app},statement)=>{await new Promise<void>((resolve)=>setImmediate(resolve));const require=process.getBuiltinModule('node:module').createRequire(`${app.getAppPath()}/package.json`);const Database=require('better-sqlite3');const db=new Database(`${app.getPath('userData')}/planner.sqlite`);try{db.exec(statement);}finally{db.close();}},statement);}
async function snapshot(){return page.evaluate(async()=>{const data=await window.planner.getDay();if(!data.ok)throw new Error(data.error.message);return data.value;});}

test('settings persist, reflow capacity, reject invalid input and preserve a draft on disk errors',async()=>{
  const task=await add();await task.getByRole('button',{name:'Add to day',exact:true}).click();await expect(task).not.toBeVisible();
  const form=await settings();await form.getByLabel('Daily start time').fill('14:00');await form.getByLabel('Daily end time').fill('15:00');await form.getByRole('button',{name:'Save settings',exact:true}).click();await expect(form.getByText('Settings saved. Your schedule has been updated.',{exact:true})).toBeVisible();
  expect((await snapshot()).plan.summary.unscheduledMinutes).toBe(60);
  await form.getByLabel('Daily end time').fill('13:00');await form.getByRole('button',{name:'Save settings',exact:true}).click();await expect(form.getByRole('alert')).toContainText('end after the start');await expect(form.getByLabel('Daily end time')).toHaveValue('13:00');
  await form.getByLabel('Daily end time').fill('16:00');await sql("CREATE TRIGGER settings_disk_failure BEFORE UPDATE ON planner_settings BEGIN SELECT RAISE(ABORT,'disk full'); END;");
  await form.getByRole('button',{name:'Save settings',exact:true}).click();await expect(form.getByRole('alert')).toContainText('could not be saved');await expect(form.getByLabel('Daily end time')).toHaveValue('16:00');expect((await snapshot()).dailyHours.endMinute).toBe(900);
  await sql('DROP TRIGGER settings_disk_failure');await form.getByRole('button',{name:'Save settings',exact:true}).click();await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(form.getByText('Settings saved. Your schedule has been updated.',{exact:true})).toBeVisible();await expect(form.getByRole('button',{name:'Save settings',exact:true})).toBeEnabled();await page.screenshot({path:'test-results/planner-settings.png'});await app.close();await launch();const reopened=await settings();await expect(reopened.getByLabel('Daily start time')).toHaveValue('14:00');await expect(reopened.getByLabel('Daily end time')).toHaveValue('16:00');
});

test('native backup and restore round-trip data, retain a safety copy and respect cancellation',async()=>{
  const task=await add();await task.getByRole('button',{name:'Add to day',exact:true}).click();await expect(task).not.toBeVisible();
  const backup=join(directory,'backup.sqlite');await app.evaluate(({dialog},backup)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:backup});},backup);
  let form=await settings();await form.getByRole('button',{name:'Create backup',exact:true}).click();await expect(form.getByText(`Backup saved to ${backup}`,{exact:true})).toBeVisible();expect((await readFile(backup)).subarray(0,16).toString()).toBe('SQLite format 3\u0000');
  await form.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Delete Keep this task',exact:true}).click();expect((await snapshot()).tasks).toHaveLength(0);
  form=await settings();await app.evaluate(({dialog},backup)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backup]});dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});},backup);
  await form.getByRole('button',{name:'Restore backup',exact:true}).click();await expect(form.getByText('Canceled. Your planner was not replaced.',{exact:true})).toBeVisible();expect((await snapshot()).tasks).toHaveLength(0);
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});await form.getByRole('button',{name:'Restore backup',exact:true}).click();await expect(form.getByText(/Backup restored\. Previous planner saved to/)).toBeVisible();
  const restored=await snapshot();expect(restored.tasks[0]!.title).toBe('Keep this task');expect(restored.tasks[0]!.notes).toBe('Original notes');
  await form.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByTestId('board-task')).toHaveCount(1);await expect(page.getByText('Task deleted.',{exact:true})).not.toBeVisible();
});

test('invalid restore and failed export leave the current planner and prior files intact',async()=>{
  const task=await add();await task.getByRole('button',{name:'Add to day',exact:true}).click();await expect(task).not.toBeVisible();
  const invalid=join(directory,'bad.sqlite');await writeFile(invalid,'This is not a backup');
  await app.evaluate(({dialog},invalid)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[invalid]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},invalid);
  const form=await settings();await form.getByRole('button',{name:'Restore backup',exact:true}).click();await expect(form.getByRole('alert')).toContainText('could not be restored');expect((await snapshot()).tasks).toHaveLength(1);
  await app.evaluate(({dialog},directory)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:`${directory}/missing/fail.sqlite`});},directory);
  await form.getByRole('button',{name:'Create backup',exact:true}).click();await expect(form.getByRole('alert')).toContainText('could not be created');expect((await snapshot()).tasks[0]!.title).toBe('Keep this task');
});

test('failed task save keeps the form, quiet refresh keeps the warning, retry saves exactly one task',async()=>{
  await sql("CREATE TRIGGER task_disk_failure BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'disk full'); END;");
  const form=await add();await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form.getByRole('alert')).toContainText('could not be saved');await expect(form.getByLabel('Task title',{exact:true})).toHaveValue('Keep this task');await expect(form.getByLabel('Notes',{exact:true})).toHaveValue('Original notes');expect((await snapshot()).tasks).toHaveLength(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.error-banner')).toContainText('could not be saved');
  await sql('DROP TRIGGER task_disk_failure');await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();expect((await snapshot()).tasks).toHaveLength(1);await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('a valid backup can recover an unreadable database without deleting the original file',async()=>{
  const task=await add();await task.getByRole('button',{name:'Add to day',exact:true}).click();await expect(task).not.toBeVisible();
  const backup=join(directory,'recovery.sqlite');await app.evaluate(({dialog},backup)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:backup});},backup);
  let form=await settings();await form.getByRole('button',{name:'Create backup',exact:true}).click();await expect(form.getByText(`Backup saved to ${backup}`,{exact:true})).toBeVisible();
  await app.close();await writeFile(join(directory,'planner.sqlite'),'Unreadable original planner');await launch(false);form=await settings();await expect(form.getByRole('alert')).toBeVisible();
  await app.evaluate(({dialog},backup)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backup]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},backup);
  await form.getByRole('button',{name:'Restore backup',exact:true}).click();await expect(form.getByText(/Backup restored\. Previous planner saved to/)).toBeVisible();expect((await snapshot()).tasks[0]!.title).toBe('Keep this task');
  const message=await form.locator('.backup-message').innerText();const safety=message.replace('Backup restored. Previous planner saved to ','');expect(await readFile(join(safety,'planner.sqlite'),'utf8')).toBe('Unreadable original planner');
});

test('a lost save response keeps the draft and retry cannot create a duplicate',async()=>{
  await app.evaluate(({ipcMain})=>{
    const handlers=(ipcMain as unknown as {_invokeHandlers:Map<string,Function>})._invokeHandlers;
    const original=handlers.get('planner:save-task')!;let fail=true;
    ipcMain.removeHandler('planner:save-task');ipcMain.handle('planner:save-task',async(event,input)=>{const result=await original(event,input);if(fail){fail=false;throw new Error('Simulated lost save acknowledgement');}return result;});
  });
  const form=await add('One confirmed task');await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form.getByRole('alert')).toContainText('could not be confirmed');expect((await snapshot()).tasks).toHaveLength(1);
  await form.getByRole('button',{name:'Add to day',exact:true}).click();await expect(form).not.toBeVisible();expect((await snapshot()).tasks).toHaveLength(1);
});
