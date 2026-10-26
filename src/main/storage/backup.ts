import Database from 'better-sqlite3';
import {chmodSync,copyFileSync,existsSync,fsyncSync,openSync,closeSync,mkdirSync,mkdtempSync,renameSync,rmSync,linkSync,lstatSync,realpathSync,statSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PlannerDatabase} from './database';
import {PlannerRepository,PlannerInputError} from './planner-repository';

function flush(path:string){const descriptor=openSync(path,'r');try{fsyncSync(descriptor);}finally{closeSync(descriptor);}}
function protectLive(path:string,live:string){
  const parent=realpathSync(dirname(resolve(path)));const normalized=join(parent,basename(path));
  const active=realpathSync(live);
  if([active,`${active}-wal`,`${active}-shm`].includes(normalized) || (existsSync(path) && lstatSync(path).isSymbolicLink()))throw new PlannerInputError('Choose a separate backup file outside the active database files.');
  if(existsSync(path) && realpathSync(path)===active)throw new PlannerInputError('Choose a separate backup file.');
}
function schema(connection:Database.Database){return connection.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name").all();}
function validate(connection:Database.Database){
  if(connection.pragma('quick_check',{simple:true})!=='ok' || (connection.pragma('foreign_key_check') as unknown[]).length)throw new PlannerInputError('This backup is damaged or has broken references.');
  const reference=new PlannerDatabase(':memory:','UTC');
  try {
    if(JSON.stringify(schema(connection))!==JSON.stringify(schema(reference.connection)))throw new PlannerInputError('This file does not have a supported Laptop Planner database structure.');
  }finally{reference.close();}
}

/** Online SQLite backup includes committed WAL data. Rename publishes only a complete file. */
export async function writeBackup(database:PlannerDatabase,destination:string,now:Date):Promise<void>{
  protectLive(destination,database.path);
  const temporary=join(dirname(destination),`.planner-backup-${randomUUID()}.sqlite`);
  try {
    new PlannerRepository(database).checkpointFocus(now);
    await database.connection.backup(temporary);
    // Keep the exact saved checkpoint, never count time between backup and restore.
    const copy=new PlannerDatabase(temporary);
    try {new PlannerRepository(copy).recoverFocus();}finally{copy.close();}
    chmodSync(temporary,0o600);flush(temporary);renameSync(temporary,destination);
  }finally{for(const suffix of ['','-wal','-shm'])rmSync(temporary+suffix,{force:true});}
}

async function stageSource(source:string,staged:string,now:()=>Date){
    const input=new Database(source,{readonly:true,fileMustExist:true});
    try {
      input.pragma('trusted_schema = OFF');
      if(input.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('trigger','view') LIMIT 1").get())throw new PlannerInputError('This backup contains unsupported database objects.');
      if(input.pragma('quick_check',{simple:true})!=='ok')throw new PlannerInputError('This backup is damaged.');
      await input.backup(staged);
    }finally{input.close();}
    const candidate=new PlannerDatabase(staged);
    try {
      validate(candidate.connection);
      const repository=new PlannerRepository(candidate);repository.recoverFocus();
      const hours=candidate.getStatus().dailyHours;
      new Intl.DateTimeFormat('en',{timeZone:hours.timeZone}).format(now());
      repository.getDay(undefined,now());
      validate(candidate.connection);
    }finally{candidate.close();}
    chmodSync(staged,0o600);flush(staged);
}

export interface DatabaseHolder { current:PlannerDatabase }
/** Validate and migrate an isolated copy before any replacement of the live database. */
export async function restoreBackup(holder:DatabaseHolder,source:string,now:()=>Date):Promise<string>{
  const current=holder.current;protectLive(source,current.path);
  const directory=mkdtempSync(join(dirname(current.path),'.restore-'));chmodSync(directory,0o700);
  const staged=join(directory,'staged.sqlite');const rollback=join(directory,'previous.sqlite');
  let replacement=false;let closed=false;
  try {
    await stageSource(source,staged,now);
    const repository=new PlannerRepository(current);const at=now();const focus=repository.getMenuBarFocus(at);
    if(focus?.running)repository.pauseForLifecycle(at,'paused');
    const backups=join(dirname(current.path),'Backups');mkdirSync(backups,{recursive:true,mode:0o700});
    const safety=join(backups,`before-restore-${at.toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.sqlite`);
    await writeBackup(current,safety,now());
    const checkpoint=current.connection.pragma('wal_checkpoint(TRUNCATE)') as {busy:number}[];
    if(checkpoint[0]?.busy)throw new Error('The current database is busy. Close other database tools and retry.');
    current.close();closed=true;
    if(existsSync(`${current.path}-wal`) && statSync(`${current.path}-wal`).size)throw new Error('Uncheckpointed database data remains. Restore was not applied.');
    linkSync(current.path,rollback);
    renameSync(staged,current.path);replacement=true;
    holder.current=new PlannerDatabase(current.path);
    new PlannerRepository(holder.current).getDay(undefined,now());
    return safety;
  }catch(error){
    if(closed){
      if(holder.current!==current)holder.current.close();
      if(replacement)renameSync(rollback,current.path);
      holder.current=new PlannerDatabase(current.path);
    }
    throw error;
  }finally{rmSync(directory,{recursive:true,force:true});}
}

/** Recovery is also available when the live database cannot be opened. Preserve its raw files first. */
export async function restoreUnreadableDatabase(source:string,path:string,now:()=>Date){
  protectLive(source,path);
  const directory=mkdtempSync(join(dirname(path),'.restore-'));chmodSync(directory,0o700);
  const staged=join(directory,'staged.sqlite');const original=join(directory,'original.sqlite');
  let replaced=false;let opened:PlannerDatabase|undefined;
  try {
    await stageSource(source,staged,now);
    const safety=join(dirname(path),'Backups',`unreadable-before-restore-${now().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`);
    mkdirSync(safety,{recursive:true,mode:0o700});
    for(const suffix of ['','-wal','-shm'])if(existsSync(path+suffix)){const copy=join(safety,'planner.sqlite'+suffix);copyFileSync(path+suffix,copy);chmodSync(copy,0o600);flush(copy);}
    linkSync(path,original);
    for(const suffix of ['-wal','-shm'])if(existsSync(path+suffix))renameSync(path+suffix,join(directory,'original'+suffix));
    renameSync(staged,path);replaced=true;
    opened=new PlannerDatabase(path);new PlannerRepository(opened).getDay(undefined,now());
    return {database:opened,safetyBackupPath:safety};
  }catch(error){
    opened?.close();
    if(replaced)renameSync(original,path);
    for(const suffix of ['-wal','-shm'])if(existsSync(join(directory,'original'+suffix)))renameSync(join(directory,'original'+suffix),path+suffix);
    throw error;
  }finally{rmSync(directory,{recursive:true,force:true});}
}
