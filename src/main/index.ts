import { app, BrowserWindow, ipcMain, Menu, session, powerMonitor, dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FOUNDATION_STATUS_CHANNEL, PLANNER_CHANNELS, type FoundationStatus, type PlannerResult, type SaveSettingsInput, type BackupOutcome, type SaveTaskInput, type CompleteTaskInput, type TaskActionInput, type ReorderTasksInput, type MoveTaskInput, type SaveEventInput, type SaveProjectInput } from '../shared/contracts';
import { FocusMenuBar } from './focus-menu-bar';
import { localClock } from './local-clock';
import { writeBackup, restoreBackup, restoreUnreadableDatabase } from './storage/backup';
import { PlannerDatabase } from './storage/database';
import { PlannerInputError, PlannerRepository } from './storage/planner-repository';

app.setName('Laptop Planner');
app.setPath('userData', join(app.getPath('appData'), 'Laptop Planner'));

// This override is only for isolated development tests, never a packaged app.
if (!app.isPackaged && process.env.LAPTOP_PLANNER_TEST_DATA_DIR) {
  app.setPath('userData', resolve(process.env.LAPTOP_PLANNER_TEST_DATA_DIR));
}

app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');

const rendererDirectory = resolve(__dirname, '../renderer');
const rendererEntry = join(rendererDirectory, 'index.html');
const rendererUrl = pathToFileURL(rendererEntry).href;
let mainWindow: BrowserWindow | null = null;
let database: PlannerDatabase | undefined;
let maintenance=false;
let heartbeat: ReturnType<typeof setInterval> | undefined;
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',()=>showPlanner());
let focusMenuBar:FocusMenuBar|undefined;
const notifyChanged=()=>{syncMenuBar();if(mainWindow && !mainWindow.isDestroyed())mainWindow.webContents.send(PLANNER_CHANNELS.changed);};

function syncMenuBar() {
  if(!database || !focusMenuBar)return;
  try {focusMenuBar.update(new PlannerRepository(database).getMenuBarFocus(now()));}
  catch(error){console.error('Menu bar timer refresh failed:',error);focusMenuBar.unavailable();}
}
function showPlanner() {
  if(mainWindow && !mainWindow.isDestroyed()) {if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}
  else void createWindow();
}

function getDatabase(): PlannerDatabase {
  if(!database) {
    const opened=new PlannerDatabase(join(app.getPath('userData'),'planner.sqlite'));
    try {new PlannerRepository(opened).recoverFocus();database=opened;}
    catch(error){opened.close();throw error;}
  }
  return database;
}

function now(): Date {
  const override = !app.isPackaged && process.env.LAPTOP_PLANNER_TEST_DATA_DIR && process.env.LAPTOP_PLANNER_TEST_NOW;
  const value = override ? new Date(override) : new Date();
  if (Number.isNaN(value.getTime())) throw new Error('Invalid test clock.');
  return value;
}

function isRendererAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;
    const file = fileURLToPath(parsed);
    return file === rendererEntry || file.startsWith(rendererDirectory + sep);
  } catch {
    return false;
  }
}

function getFoundationStatus(): PlannerResult<FoundationStatus> {
  try {
    const database = getDatabase();
    return {
      ok: true,
      value: {
        app: { name: app.getName(), version: app.getVersion(), platform: process.platform, architecture: process.arch },
        storage: database.getStatus(),
      },
    };
  } catch (error) {
    console.error('Local database initialization failed:', error);
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: 'The local database could not be opened. Check that the app’s data folder is writable and try again. Your existing data has not been reset.',
      },
    };
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: 'Laptop Planner',
    width: 1280,
    height: 860,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: '#151917',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 22, y: 22 },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close',(event)=>{if(maintenance)event.preventDefault();});
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadFile(rendererEntry);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Laptop Planner', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [{ role: 'close' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]));
  const localSession = session.defaultSession;
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);
  localSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: !isRendererAsset(details.url) });
  });
  // All resources are local files. No localhost server, cloud requests, or telemetry.
  await localSession.enableNetworkEmulation({ offline: true });
  ipcMain.handle(FOUNDATION_STATUS_CHANNEL, (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame?.url !== rendererUrl) {
      throw new Error('Untrusted IPC sender.');
    }
    return getFoundationStatus();
  });
  function handle<T>(channel: string, write: boolean, operation: (repository: PlannerRepository, input: unknown) => T): void {
    ipcMain.handle(channel, (event, input: unknown): PlannerResult<T> => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame?.url !== rendererUrl) throw new Error('Untrusted IPC sender.');
      try {
        if(maintenance && write)throw new PlannerInputError('A local backup or restore is in progress. Please wait, then try again.');
        const value=operation(new PlannerRepository(getDatabase()), input);
        syncMenuBar();
        return { ok: true, value };
      } catch (error) {
        if (error instanceof PlannerInputError) return { ok: false, error: { code: error.code, message: error.message } };
        console.error('Local planner operation failed:', error);
        return { ok: false, error: {
          code: write ? 'SAVE_FAILED' : 'STORAGE_UNAVAILABLE',
          message: write
            ? 'Your change could not be saved. Your previous data is unchanged. Please try again.'
            : 'The local database could not be opened. Check that the app’s data folder is writable and try again. Your existing data has not been reset.',
        } };
      }
    });
  }
  handle(PLANNER_CHANNELS.saveSettings,true,(repository,input)=>repository.saveSettings(input as SaveSettingsInput,now()));
  handle(PLANNER_CHANNELS.getDay, false, (repository, input) => repository.getDay(input, now()));
  handle(PLANNER_CHANNELS.saveTask, true, (repository, input) => repository.saveTask(input as SaveTaskInput, now()));
  handle(PLANNER_CHANNELS.setTaskCompleted, true, (repository, input) => repository.setTaskCompleted(input as CompleteTaskInput, now()));
  handle(PLANNER_CHANNELS.deleteTask, true, (repository, input) => repository.deleteTask(input as TaskActionInput, now()));
  handle(PLANNER_CHANNELS.restoreTask, true, (repository, input) => repository.restoreTask(input as TaskActionInput, now()));
  handle(PLANNER_CHANNELS.reorderTasks, true, (repository, input) => repository.reorderTasks(input as ReorderTasksInput, now()));
  handle(PLANNER_CHANNELS.moveTask, true, (repository, input) => repository.moveTask(input as MoveTaskInput, now()));
  handle(PLANNER_CHANNELS.saveEvent, true, (repository, input) => repository.saveEvent(input as SaveEventInput, now()));
  handle(PLANNER_CHANNELS.deleteEvent, true, (repository, input) => repository.deleteEvent(input as TaskActionInput, now()));
  handle(PLANNER_CHANNELS.saveProject, true, (repository, input) => repository.saveProject(input as SaveProjectInput, now()));
  handle(PLANNER_CHANNELS.startFocus,true,(repository,input)=>repository.startFocus(input as TaskActionInput,now()));
  handle(PLANNER_CHANNELS.pauseFocus,true,(repository,input)=>repository.pauseFocus(input as TaskActionInput,now()));
  for(const kind of ['createBackup','restoreBackup'] as const)ipcMain.handle(PLANNER_CHANNELS[kind],async(event):Promise<PlannerResult<BackupOutcome>>=>{
    if(!mainWindow || event.sender!==mainWindow.webContents || event.senderFrame?.url!==rendererUrl)throw new Error('Untrusted IPC sender.');
    if(maintenance)return {ok:false,error:{code:'SAVE_FAILED',message:'Another backup or restore is in progress. Please wait and try again.'}};
    // Reserve the operation across native dialogs; heartbeat checkpoints continue.
    maintenance=true;
    try {
      if(kind==='createBackup') {
        const backups=join(app.getPath('userData'),'Backups');mkdirSync(backups,{recursive:true,mode:0o700});
        const chosen=await dialog.showSaveDialog(mainWindow,{title:'Create local backup',defaultPath:join(backups,`Laptop Planner ${now().toISOString().replace(/[.:]/g,'-')}.sqlite`),filters:[{name:'Laptop Planner backup',extensions:['sqlite']}]});
        if(chosen.canceled || !chosen.filePath)return {ok:true,value:{canceled:true}};
        await writeBackup(getDatabase(),chosen.filePath,now());
        return {ok:true,value:{canceled:false,path:chosen.filePath}};
      }
      const chosen=await dialog.showOpenDialog(mainWindow,{title:'Restore local backup',properties:['openFile'],filters:[{name:'Laptop Planner backup',extensions:['sqlite','db']}]});
      if(chosen.canceled || !chosen.filePaths[0])return {ok:true,value:{canceled:true}};
      const confirmed=await dialog.showMessageBox(mainWindow,{type:'warning',buttons:['Cancel','Restore backup'],defaultId:0,cancelId:0,message:'Replace this planner with the selected backup?',detail:'Tasks, events, projects, settings and focus history will be replaced. Running timers will pause. A safety backup of the current planner will be kept locally in its Backups folder.'});
      if(confirmed.response!==1)return {ok:true,value:{canceled:true}};
      let current:PlannerDatabase;
      try {current=getDatabase();}catch{
        const recovered=await restoreUnreadableDatabase(chosen.filePaths[0],join(app.getPath('userData'),'planner.sqlite'),now);
        database=recovered.database;
        return {ok:true,value:{canceled:false,path:chosen.filePaths[0],safetyBackupPath:recovered.safetyBackupPath}};
      }
      const holder={current};
      try {const safetyBackupPath=await restoreBackup(holder,chosen.filePaths[0],now);return {ok:true,value:{canceled:false,path:chosen.filePaths[0],safetyBackupPath}};}
      finally {database=holder.current;}
    }catch(error){
      console.error('Local backup operation failed:',error);
      return {ok:false,error:{code:'SAVE_FAILED',message:error instanceof PlannerInputError?error.message:kind==='createBackup'?'The backup could not be created. Check the destination folder and available disk space, then try again.':'The backup could not be restored. Your existing planner or its safety copy has been retained. Check the file and available disk space, then try again.'}};
    }finally{maintenance=false;notifyChanged();}
  });
  focusMenuBar=new FocusMenuBar({
    open:showPlanner,quit:()=>app.quit(),
    toggle:(taskId,running)=>{
      try {
        if(maintenance)throw new PlannerInputError('A local backup or restore is in progress. Please wait.');
        const repository=new PlannerRepository(getDatabase());const current=now();
        const focus=repository.getMenuBarFocus(current);
        if(!focus || focus.taskId!==taskId || focus.running!==running)throw new PlannerInputError('The focused task changed. Open the menu again to use its current controls.');
        const input={id:taskId,viewDate:localClock(current,getDatabase().getStatus().dailyHours.timeZone).date};
        if(running)repository.pauseFocus(input,current);else repository.startFocus(input,current);
      }catch(error){
        console.error('Menu bar timer change failed:',error);
        dialog.showErrorBox('Timer change could not be saved',error instanceof PlannerInputError?error.message:'Your timer change could not be saved. Your previous focus state is unchanged. Open Laptop Planner to check storage and try again.');
      }
      notifyChanged();
    },
  });
  await createWindow();
  syncMenuBar();
  let previousDate:string|undefined;
  heartbeat=setInterval(()=>{
    if(!database)return;
    try {
      const current=now();
      const changed=new PlannerRepository(database).checkpointFocus(current);
      syncMenuBar();
      const date=localClock(current,database.getStatus().dailyHours.timeZone).date;
      if(changed || previousDate!==date)notifyChanged();
      previousDate=date;
    }catch(error){console.error('Focus checkpoint failed:',error);notifyChanged();focusMenuBar?.unavailable();}
  },1000);
  heartbeat.unref();
  powerMonitor.on('suspend',()=>{
    try {if(database)new PlannerRepository(database).pauseForLifecycle(now(),'sleep');}
    catch(error){console.error('Focus pause failed:',error);}
    notifyChanged();
  });
  powerMonitor.on('resume',()=>{
    let failed=false;
    try {if(database)new PlannerRepository(database).checkpointFocus(now());}
    catch(error){failed=true;console.error('Focus resume checkpoint failed:',error);}
    notifyChanged();if(failed)focusMenuBar?.unavailable();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch((error: unknown) => {
  console.error('Laptop Planner could not start:', error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit',(event)=>{
  if(maintenance){event.preventDefault();return;}
  try {if(database)new PlannerRepository(database).pauseForLifecycle(now(),'quit');}
  catch(error) {
    event.preventDefault();
    if(!mainWindow)void createWindow();
    console.error('Focus quit save failed:',error);
    dialog.showErrorBox('Focus time could not be saved','Laptop Planner stayed open so you can retry. Check that the local data folder is writable, then pause your timer before quitting.');
  }
});
app.on('will-quit',()=>{if(heartbeat)clearInterval(heartbeat);focusMenuBar?.destroy();database?.close();});
