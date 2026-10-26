import { _electron as electron,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const bundle=resolve(process.argv[2]??'release/mac-arm64/Laptop Planner.app');
const label=process.argv[3]??'app';const executable=join(bundle,'Contents/MacOS/Laptop Planner');
const verificationHome=await mkdtemp(join(tmpdir(),'planner-packaged-'));await mkdir(join(verificationHome,'Documents'));await mkdir(join(verificationHome,'Library'));
const env={...process.env,HOME:verificationHome,CFFIXED_USER_HOME:verificationHome,TZ:'Asia/Kolkata'};delete env.ELECTRON_RUN_AS_NODE;delete env.LAPTOP_PLANNER_TEST_DATA_DIR;delete env.LAPTOP_PLANNER_TEST_NOW;
let application;let status;
async function launch(){application=await electron.launch({executablePath:executable,env});const page=await application.firstWindow();await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();return page;}
try {
  let page=await launch();const errors=[];page.on('pageerror',(error)=>errors.push(error.message));
  const packaged=await application.evaluate(({app})=>app.isPackaged);assert.equal(packaged,true);
  const foundation=await page.evaluate(()=>window.planner.getFoundationStatus());assert.equal(foundation.ok,true);status=foundation.value;
  assert.ok(status.storage.databasePath.startsWith(verificationHome+'/'),'Packaged smoke must use a disposable verificationHome, never personal data.');assert.equal(status.app.architecture,'arm64');
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  const blocked=await page.evaluate(async()=>{try{await fetch('https://planner-offline-test.invalid');return false;}catch{return true;}});assert.equal(blocked,true);
  assert.equal(await application.evaluate(async({net})=>{try{await net.fetch('https://planner-offline-test.invalid');return false;}catch{return true;}}),true);
  const accepted=await page.evaluate(async()=>{
    const get=async(date)=>{const result=await window.planner.getDay(date);if(!result.ok)throw new Error(result.error.message);return result.value;};
    const initial=await get();const date=initial.board[1].date;const splitDate=initial.board[2].date;
    for(const [index,plannedMinutes] of [120,60,45,45].entries()){const result=await window.planner.saveTask({title:`Acceptance ${index+1}`,notes:'Packaged offline fixture',plannedDate:date,plannedMinutes,viewDate:date});if(!result.ok)throw new Error(result.error.message);}
    const four=await get(date);
    const settings=await window.planner.saveSettings({startMinute:780,endMinute:1020,timeZone:initial.dailyHours.timeZone,viewDate:splitDate});if(!settings.ok)throw new Error(settings.error.message);
    const task=await window.planner.saveTask({title:'Split acceptance',notes:'Keep this',plannedDate:splitDate,plannedMinutes:120,viewDate:splitDate});if(!task.ok)throw new Error(task.error.message);
    const event=await window.planner.saveEvent({title:'Fixed meeting',notes:'',start:{date:splitDate,minute:840},end:{date:splitDate,minute:960},viewDate:splitDate});if(!event.ok)throw new Error(event.error.message);
    return {fourMinutes:four.plan.summary.plannedMinutes,split:event.value.plan.scheduledBlocks.map((block)=>[block.startMinute,block.endMinute]),splitDate,taskId:event.value.tasks[0].id};
  });
  assert.equal(accepted.fourMinutes,270);assert.deepEqual(accepted.split,[[780,840],[960,1020]]);
  const backup=join(verificationHome,'Documents','offline-backup.sqlite');
  await application.evaluate(({dialog},backup)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:backup});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backup]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},backup);
  assert.equal((await page.evaluate(()=>window.planner.createBackup())).ok,true);
  await page.evaluate(async({taskId,splitDate})=>{const result=await window.planner.deleteTask({id:taskId,viewDate:splitDate});if(!result.ok)throw new Error(result.error.message);},accepted);
  const restored=await page.evaluate(()=>window.planner.restoreBackup());assert.equal(restored.ok,true);assert.equal(restored.value.canceled,false);
  await application.close();application=undefined;page=await launch();
  const reopened=await page.evaluate(async(date)=>{const result=await window.planner.getDay(date);if(!result.ok)throw new Error(result.error.message);return result.value;},accepted.splitDate);
  assert.equal(reopened.tasks[0].title,'Split acceptance');assert.equal(reopened.events[0].title,'Fixed meeting');assert.equal(reopened.dailyHours.startMinute,780);
  await page.getByLabel('Go to date',{exact:true}).fill(accepted.splitDate);await expect(page.getByRole('button',{name:'Split acceptance',exact:true})).toBeVisible();
  await mkdir('release/verification',{recursive:true});await page.screenshot({path:`release/verification/${label}-launch.png`});
  assert.deepEqual(errors,[]);
  const report={bundle,verifiedAt:new Date().toISOString(),isPackaged:true,architecture:status.app.architecture,version:status.app.version,schema:status.storage.schemaVersion,offlineRenderer:true,offlineMain:true,fourTaskMinutes:accepted.fourMinutes,splitIntervals:accepted.split,backupRestore:true,restartPersistence:true,isolatedData:true};
  await writeFile(`release/verification/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await application?.close();await rm(verificationHome,{recursive:true,force:true});}
