import { createRequire } from 'node:module';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require=createRequire(join(process.cwd(),'package.json'));
const {_electron:electron,expect}=require('@playwright/test');
const reports=[];
const output=resolve('docs/evidence/phase2-r8-final-check');
await mkdir(output,{recursive:true});
async function run(name,fn){
 if(process.env.PHASE2_REVIEW_CASE&&!new RegExp(process.env.PHASE2_REVIEW_CASE).test(name))return;
 const directory=await mkdtemp(join(tmpdir(),'planner-phase2-review-'));
 const env={...process.env,TZ:'Asia/Kolkata',LAPTOP_PLANNER_TEST_DATA_DIR:directory,LAPTOP_PLANNER_TEST_NOW:'2026-10-25T07:30:00.000Z'};
 delete env.ELECTRON_RUN_AS_NODE;
 let app;
 try{
  app=await electron.launch({args:[resolve('.')],env});
  const page=await app.firstWindow();page.setDefaultTimeout(6000);
  await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();
  async function seed(title='Review task'){
   await page.evaluate(async title=>{const r=await window.planner.saveTask({title,notes:'Original notes',plannedMinutes:30,plannedDate:'2026-10-25',viewDate:'2026-10-25'});if(!r.ok)throw Error(r.error.message);},title);
   await page.getByRole('button',{name:'Go to today',exact:true}).click();
   await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
  }
  const data=()=>page.evaluate(async()=>{const r=await window.planner.getDay();if(!r.ok)throw Error(r.error.message);return r.value;});
  const result=await fn({app,page,seed,data});
  const entry={name,...result};reports.push(entry);console.log(JSON.stringify(entry));
 }catch(error){const entry={name,error:String(error)};reports.push(entry);console.log(JSON.stringify(entry));}
 finally{if(app)await app.close();await rm(directory,{recursive:true,force:true});}
}
await run('pristine-editor-cache-overwrites-new-estimate',async({page,seed,data})=>{
 await seed();await page.getByRole('button',{name:'Review task',exact:true}).click();
 let editor=page.getByRole('dialog',{name:'Edit task',exact:true});
 await expect(editor.getByLabel('Estimated time',{exact:true})).toHaveValue('30m');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Edit duration for Review task',exact:true}).click();
 await page.getByRole('dialog',{name:'Planned time presets',exact:true}).getByRole('button',{name:'1 hr',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Planned time presets',exact:true})).toHaveCount(0);
 const afterPopover=(await data()).tasks[0].plannedMinutes;
 await page.getByRole('button',{name:'Review task',exact:true}).click();
 const reopenedValue=await editor.getByLabel('Estimated time',{exact:true}).inputValue();
 await editor.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(editor).toHaveCount(0);
 return {afterPopover,reopenedValue,afterEditorSave:(await data()).tasks[0].plannedMinutes};
});
await run('failed-delete-loses-retained-title-draft',async({app,page,seed,data})=>{
 await seed();await page.getByRole('button',{name:'Review task',exact:true}).click();
 let editor=page.getByRole('dialog',{name:'Edit task',exact:true});
 await editor.getByLabel('Task title',{exact:true}).fill('Uncommitted title');await page.keyboard.press('Escape');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('planner:delete-task');ipcMain.handle('planner:delete-task',()=>({ok:false,error:{code:'STORAGE_ERROR',message:'Injected review delete failure'}}));});
 await page.getByRole('button',{name:'Delete Review task',exact:true}).click();
 await expect(page.locator('.error-banner')).toContainText('Injected review delete failure');
 await page.getByRole('button',{name:'Review task',exact:true}).click();
 return {recordStillExists:(await data()).tasks.length===1,reopenedTitle:await editor.getByLabel('Task title',{exact:true}).inputValue(),expectedDraft:'Uncommitted title'};
});
await run('quick-add-focus-escapes-modal',async({page})=>{
 await page.keyboard.press('a');let dialog=page.getByRole('dialog',{name:'New task',exact:true});
 await expect(dialog.getByLabel('Task title',{exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');
 return await page.evaluate(()=>({insideDialog:!!document.activeElement?.closest('[role=dialog]'),activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label')}));
});
await run('editor-focus-escapes-modal',async({page,seed})=>{
 await seed();await page.getByRole('button',{name:'Review task',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Edit task',exact:true});await dialog.getByRole('button',{name:'Save changes',exact:true}).focus();await page.keyboard.press('Tab');
 return await page.evaluate(()=>({insideDialog:!!document.activeElement?.closest('[role=dialog]'),activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label')}));
});
await run('pending-save-can-be-dismissed',async({app,page})=>{
 await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('planner:save-task');ipcMain.removeHandler('planner:save-task');ipcMain.handle('planner:save-task',async(event,input)=>{await new Promise(resolve=>{globalThis.__phase2ReviewRelease=resolve;});return original(event,input);});});
 await page.keyboard.press('a');let dialog=page.getByRole('dialog',{name:'New task',exact:true});
 await dialog.getByLabel('Task title',{exact:true}).fill('Pending task');await dialog.getByLabel('Estimated time',{exact:true}).fill('30m');
 await dialog.getByRole('button',{name:'Add to day',exact:true}).click();await expect(dialog.getByRole('button',{name:'Saving…',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');const closedWhileSaving=await dialog.count()===0;
 await app.evaluate(()=>globalThis.__phase2ReviewRelease());
 await expect(page.getByRole('button',{name:'Pending task',exact:true})).toBeVisible();
 return {closedWhileSaving};
});
await run('estimate-save-failure-has-no-inline-error',async({app,page,seed})=>{
 await seed();await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('planner:save-task');ipcMain.handle('planner:save-task',()=>({ok:false,error:{code:'STORAGE_ERROR',message:'Injected review estimate failure'}}));});
 await page.getByRole('button',{name:'Edit duration for Review task',exact:true}).click();
 let popover=page.getByRole('dialog',{name:'Planned time presets',exact:true});await popover.getByRole('button',{name:'1.5 hr',exact:true}).click();
 await expect(page.locator('.error-banner')).toContainText('Injected review estimate failure');
 return {inlineAlerts:await popover.getByRole('alert').count(),retainedInput:await popover.getByLabel('Custom duration',{exact:true}).inputValue(),failedSelectionMinutes:90};
});
await run('nested-estimate-placement',async({page,seed})=>{
 await page.setViewportSize({width:860,height:680});await seed();await page.getByRole('button',{name:'Review task',exact:true}).click();
 let editor=page.getByRole('dialog',{name:'Edit task',exact:true});let trigger=editor.getByRole('button',{name:'Choose estimate preset',exact:true});await trigger.click();
 let popover=page.getByRole('dialog',{name:'Planned time presets',exact:true});await expect(popover).toBeVisible();
 const anchor=await trigger.boundingBox(),panel=await popover.boundingBox(),parent=await editor.boundingBox();
 await page.screenshot({path:join(output,'nested-estimate-laptop.png')});
 return {viewport:{width:860,height:680},anchor,panel,parent,outsideViewport:panel.x+panel.width>860||panel.y+panel.height>680,offsetBelowAnchor:panel.y-(anchor.y+anchor.height)};
});
await run('keyboard-date-default-after-board-pan',async({page})=>{
 const board=page.getByRole('region',{name:'Multi-day board',exact:true});await board.focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByLabel('Go to date',{exact:true})).toHaveValue('2026-10-26');
 await page.keyboard.press('a');const composer=page.getByRole('dialog',{name:'New task',exact:true});await expect(composer).toBeVisible();
 const composerDate=await composer.getByLabel('Day',{exact:true}).inputValue();await page.screenshot({path:join(output,'keyboard-selected-date.png')});
 return {selectedBoardDate:'2026-10-26',composerDate};
});
await run('nested-estimate-wide',async({page,seed})=>{
 await page.setViewportSize({width:1440,height:900});await seed();await page.getByRole('button',{name:'Review task',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Edit task',exact:true}),trigger=editor.getByRole('button',{name:'Choose estimate preset',exact:true});await trigger.click();
 const popover=page.getByRole('dialog',{name:'Planned time presets',exact:true});await expect(popover).toBeVisible();
 const anchor=await trigger.boundingBox(),panel=await popover.boundingBox(),parent=await editor.boundingBox();await page.screenshot({path:join(output,'nested-estimate-wide.png')});
 return {anchor,panel,parent,extendsPastEditor:panel.x+panel.width>parent.x+parent.width,offsetX:panel.x-anchor.x,offsetBelowAnchor:panel.y-(anchor.y+anchor.height)};
});
await run('quick-add-dismissal-restores-trigger-focus',async({page})=>{
 const trigger=page.getByRole('button',{name:'Add task',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'New task',exact:true});await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 return {triggerFocused:await trigger.evaluate(el=>el===document.activeElement),...(await page.evaluate(()=>({activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label'),shellInert:document.querySelector('.planner-shell')?.hasAttribute('inert')})))};
});
await run('editor-dismissal-restores-trigger-focus',async({page,seed})=>{
 await seed();const trigger=page.getByRole('button',{name:'Review task',exact:true});await trigger.click();
 const editor=page.getByRole('dialog',{name:'Edit task',exact:true});await expect(editor).toBeVisible();
 await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
 return {triggerFocused:await trigger.evaluate(el=>el===document.activeElement),...(await page.evaluate(()=>({activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label'),shellInert:document.querySelector('.planner-shell')?.hasAttribute('inert')})))};
});
await run('child-dismissal-restores-parent-trigger-focus',async({page,seed})=>{
 await seed();await page.getByRole('button',{name:'Review task',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Edit task',exact:true}),trigger=editor.getByRole('button',{name:'Choose estimate preset',exact:true});await trigger.click();
 const popover=page.getByRole('dialog',{name:'Planned time presets',exact:true});await expect(popover).toBeVisible();
 const childAutoFocused=await popover.getByLabel('Custom duration',{exact:true}).evaluate(el=>el===document.activeElement);
 if(!childAutoFocused)await page.keyboard.press('Tab');await expect(popover.getByLabel('Custom duration',{exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(popover).toHaveCount(0);await expect(editor).toBeVisible();
 const afterEscape={triggerFocused:await trigger.evaluate(el=>el===document.activeElement),...(await page.evaluate(()=>({activeTag:document.activeElement?.tagName,insideParent:!!document.activeElement?.closest('.task-editor-container')})))};
 await page.keyboard.press('a');return {childAutoFocused,...afterEscape,aOpenedUnrelatedComposer:await page.locator('.quick-add-container').count()===1,editorStillOpen:await editor.count()===1};
});
await run('focus-origin-switches-from-toolbar-to-column',async({page})=>{
 const toolbar=page.getByRole('button',{name:'Add task',exact:true});await toolbar.click();
 const composer=page.getByRole('dialog',{name:'New task',exact:true});await expect(composer).toBeVisible();await page.keyboard.press('Escape');await expect(composer).toHaveCount(0);
 const column=page.getByRole('button',{name:'Add task for 2026-10-25',exact:true});await column.click();await expect(composer).toBeVisible();await page.keyboard.press('Escape');await expect(composer).toHaveCount(0);
 return {columnTriggerFocused:await column.evaluate(el=>el===document.activeElement),activeLabel:await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))};
});
await writeFile(join(output,process.env.PHASE2_REVIEW_CASE?'results-extra.json':'results.json'),JSON.stringify({reviewedAt:new Date().toISOString(),reports},null,2)+'\n');
