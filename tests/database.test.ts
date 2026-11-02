import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { PlannerDatabase } from '../src/main/storage/database';
import { migrate, migrations } from '../src/main/storage/migrations';
import { PlannerInputError, PlannerRepository } from '../src/main/storage/planner-repository';
import { writeBackup, restoreBackup } from '../src/main/storage/backup';
import { localClock } from '../src/main/local-clock';
import { parseDuration, formatDuration, shiftDate } from '../src/shared/task-input';

const databases: { close(): void }[] = [];
const directories: string[] = [];
function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'laptop-planner-db-'));
  directories.push(directory);
  return join(directory, 'nested', 'planner.sqlite');
}
function open(path = databasePath()): PlannerDatabase {
  const database = new PlannerDatabase(path, 'Asia/Kolkata');
  databases.push(database);
  return database;
}
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test('creates a file-backed SQLite database with migrated daily-hour defaults', () => {
  const database = open();
  const status = database.getStatus();
  assert.equal(status.schemaVersion, 4);
  assert.equal(status.journalMode, 'wal');
  assert.match(status.sqliteVersion, /^3\./);
  assert.deepEqual(status.dailyHours, { startMinute: 360, endMinute: 1320, timeZone: 'Asia/Kolkata' });
  assert.equal(database.connection.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(database.connection.pragma('foreign_keys', { simple: true }), 1);
});

test('reopening preserves settings and does not run an applied migration again', () => {
  const path = databasePath();
  const first = open(path);
  first.connection.prepare('UPDATE planner_settings SET day_start_minute = 480 WHERE id = 1').run();
  const originalHistory = first.connection.prepare('SELECT * FROM schema_migrations').all();
  first.close();
  const reopened = open(path);
  assert.equal(reopened.getStatus().dailyHours.startMinute, 480);
  assert.deepEqual(reopened.connection.prepare('SELECT * FROM schema_migrations').all(), originalHistory);
  assert.equal((reopened.connection.prepare('SELECT COUNT(*) AS count FROM planner_settings').get() as { count: number }).count, 1);
});

test('invalid workday hours are rejected by SQLite without changing saved settings', () => {
  const database = open();
  assert.throws(() => database.connection.prepare('UPDATE planner_settings SET day_end_minute = 100 WHERE id = 1').run(), /CHECK constraint failed/);
  assert.equal(database.getStatus().dailyHours.endMinute, 1320);
});

test('a failed migration rolls back schema changes and its history record', () => {
  const database = open();
  assert.throws(() => migrate(database.connection, [...migrations, {
    version: 5, name: 'deliberately-failing-migration',
    sql: 'CREATE TABLE should_not_exist (id INTEGER); INSERT INTO missing_table VALUES (1);',
  }]), /no such table/);
  assert.equal(database.connection.prepare("SELECT name FROM sqlite_master WHERE name = 'should_not_exist'").get(), undefined);
  assert.equal((database.connection.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }).count, 4);
  assert.equal(database.getStatus().dailyHours.startMinute, 360);
});

test('an older app refuses a newer schema and preserves its data', () => {
  const database = open();
  migrate(database.connection, [...migrations, { version: 5, name: 'future-version', sql: 'CREATE TABLE future_data (note TEXT);' }]);
  database.connection.prepare('INSERT INTO future_data VALUES (?)').run('keep me');
  assert.throws(() => migrate(database.connection), /newer version/);
  assert.deepEqual(database.connection.prepare('SELECT note FROM future_data').all(), [{ note: 'keep me' }]);
});

test('changed migration history fails explicitly rather than silently migrating', () => {
  const database = open();
  database.connection.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('unexpected');
  assert.throws(() => migrate(database.connection), /does not match/);
  assert.equal(database.getStatus().dailyHours.endMinute, 1320);
});

test('a successful upgrade is atomic, recorded once, and repeatable', () => {
  const database = open();
  const steps = [...migrations, { version: 5, name: 'test-upgrade', sql: 'CREATE TABLE upgrade_check (id INTEGER PRIMARY KEY);' }];
  assert.equal(migrate(database.connection, steps), 5);
  assert.equal(migrate(database.connection, steps), 5);
  assert.equal((database.connection.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }).count, 5);
});

test('rejects malformed migration sequences before writing the database', () => {
  const connection = new Database(':memory:');
  databases.push(connection);
  assert.throws(() => migrate(connection, [{ version: 2, name: 'gap', sql: 'CREATE TABLE bad (id INTEGER);' }]), /consecutive/);
  assert.equal(connection.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").get(), undefined);
});

const DAY = '2026-10-25';
const NOW = new Date('2026-10-25T01:30:00.000Z'); // 7 AM Asia/Kolkata
function save(repository: PlannerRepository, title: string, plannedMinutes: number, plannedDate = DAY) {
  return repository.saveTask({ title, notes: '', plannedMinutes, plannedDate, viewDate: plannedDate }, NOW);
}

test('upgrades a real Phase 1 database without replacing its existing settings', () => {
  const path = databasePath();
  // Create the parent first, then build the original schema with its original ledger.
  const seed = open(path); seed.close();
  rmSync(path, { force: true });
  const old = new Database(path);
  migrate(old, migrations.slice(0, 1));
  old.prepare('INSERT INTO planner_settings (id, day_start_minute, time_zone) VALUES (1, 480, ?)').run('Asia/Kolkata');
  old.close();
  const upgraded = open(path);
  assert.equal(upgraded.schemaVersion, 4);
  assert.equal(upgraded.getStatus().dailyHours.startMinute, 480);
  assert.equal((upgraded.connection.prepare('SELECT COUNT(*) AS count FROM tasks').get() as { count: number }).count, 0);
});

test('task creation writes an atomic four-task schedule of 270 minutes to SQLite', () => {
  const database = open(); const repository = new PlannerRepository(database);
  save(repository, 'Typing', 45); save(repository, 'Review bugs', 60); save(repository, 'The Odin Project', 120);
  const snapshot = save(repository, 'Aerospace', 45);
  assert.equal(snapshot.plan.summary.scheduledMinutes, 270);
  assert.equal(snapshot.plan.summary.unscheduledMinutes, 0);
  assert.deepEqual(snapshot.tasks.map((task) => task.title), ['Typing', 'Review bugs', 'The Odin Project', 'Aerospace']);
  assert.equal((database.connection.prepare("SELECT SUM(end_minute - start_minute) AS minutes FROM calendar_blocks WHERE kind = 'scheduled'").get() as { minutes: number }).minutes, 270);
  assert.equal(snapshot.plan.scheduledBlocks[0]!.startMinute, 420);
});

test('editing title, notes, and duration updates storage and reschedules following tasks', () => {
  const repository = new PlannerRepository(open());
  save(repository, 'First', 45); const original = save(repository, 'Second', 60);
  const first = original.tasks[0]!;
  const snapshot = repository.saveTask({ id: first.id, title: 'Updated', notes: 'Review the editor\nThen test.', plannedDate: DAY, plannedMinutes: 90, viewDate: DAY }, NOW);
  assert.equal(snapshot.tasks[0]!.id, first.id);
  assert.equal(snapshot.tasks[0]!.notes, 'Review the editor\nThen test.');
  assert.equal(snapshot.plan.scheduledBlocks[1]!.startMinute, 510);
  assert.equal(snapshot.plan.summary.plannedMinutes, 150);
});

test('a task and its schedule survive closing and reopening the database', () => {
  const path = databasePath(); const database = open(path); const repository = new PlannerRepository(database);
  const before = save(repository, 'Persistent task', 120);
  database.close();
  const reopened = new PlannerRepository(open(path));
  assert.deepEqual(reopened.getDay(DAY, NOW), before);
});

test('reordering changes persisted priority and rejects duplicate, missing, or foreign IDs', () => {
  const database = open(); const repository = new PlannerRepository(database);
  save(repository, 'First', 45); const before = save(repository, 'Second', 60);
  const ids = before.tasks.map((task) => task.id);
  const reordered = repository.reorderTasks({ date: DAY, taskIds: [...ids].reverse() }, NOW);
  assert.deepEqual(reordered.tasks.map((task) => task.title), ['Second', 'First']);
  assert.equal(reordered.plan.scheduledBlocks[0]!.taskId, ids[1]);
  for (const invalid of [[ids[0]!, ids[0]!], [ids[0]!], [ids[0]!, 'foreign']]) {
    assert.throws(() => repository.reorderTasks({ date: DAY, taskIds: invalid }, NOW), PlannerInputError);
    assert.deepEqual(repository.getDay(DAY, NOW), reordered);
  }
});

test('completion retains elapsed planned history and reopening restores flexible work', () => {
  const repository = new PlannerRepository(open());
  const original = save(repository, 'Typing', 45); const task = original.tasks[0]!;
  const later = new Date('2026-10-25T02:15:00.000Z');
  const done = repository.setTaskCompleted({ id: task.id, completed: true, viewDate: DAY }, later);
  assert.equal(done.tasks[0]!.completed, true);
  assert.equal(done.plan.scheduledBlocks.length, 0);
  assert.deepEqual(done.plan.completedBlocks.map(({ startMinute, endMinute }) => [startMinute, endMinute]), [[420, 465]]);
  assert.equal(done.plan.tasks[0]!.actualMinutes, 0); // Completing a checkbox never fabricates timer records.
  assert.equal(repository.setTaskCompleted({ id: task.id, completed: true, viewDate: DAY }, later).plan.completedBlocks.length, 1);
  const reopened = repository.setTaskCompleted({ id: task.id, completed: false, viewDate: DAY }, later);
  assert.equal(reopened.tasks[0]!.completedAt, null);
  assert.equal(reopened.plan.completedBlocks.length, 0);
  assert.equal(reopened.plan.scheduledBlocks[0]!.startMinute, 465);
});

test('moving a task to tomorrow reflows both dates and starts tomorrow at 6 AM', () => {
  const repository = new PlannerRepository(open());
  save(repository, 'First', 45); const original = save(repository, 'Second', 60);
  const task = original.tasks[0]!;
  const today = repository.saveTask({ ...task, plannedDate: '2026-10-26', viewDate: DAY }, NOW);
  assert.deepEqual(today.tasks.map((task) => task.title), ['Second']);
  assert.equal(today.plan.scheduledBlocks[0]!.startMinute, 420);
  const tomorrow = repository.getDay('2026-10-26', NOW);
  assert.equal(tomorrow.tasks[0]!.id, task.id);
  assert.equal(tomorrow.plan.scheduledBlocks[0]!.startMinute, 360);
});

test('delete hides the task and undo restores the original identity and order', () => {
  const database = open(); const repository = new PlannerRepository(database);
  save(repository, 'First', 45); const original = save(repository, 'Second', 60);
  const task = original.tasks[0]!;
  const deleted = repository.deleteTask({ id: task.id, viewDate: DAY }, NOW);
  assert.deepEqual(deleted.tasks.map((task) => task.title), ['Second']);
  assert.equal(deleted.plan.summary.plannedMinutes, 60);
  assert.deepEqual(repository.restoreTask({ id: task.id, viewDate: DAY }, NOW), original);
});

test('undo inserts the task at its old position even after the remaining list is reordered', () => {
  const repository = new PlannerRepository(open());
  save(repository, 'First', 45); const original = save(repository, 'Second', 60);
  const first = original.tasks[0]!; const second = original.tasks[1]!;
  repository.deleteTask({ id: first.id, viewDate: DAY }, NOW);
  repository.reorderTasks({ date: DAY, taskIds: [second.id] }, NOW);
  const restored = repository.restoreTask({ id: first.id, viewDate: DAY }, NOW);
  assert.deepEqual(restored.tasks.map((task) => task.id), [first.id, second.id]);
  assert.deepEqual(restored.tasks.map((task) => task.position), [0, 1]);
});

test('a schedule write failure rolls back the task change and keeps the previous schedule', () => {
  const database = open(); const repository = new PlannerRepository(database);
  const before = save(repository, 'Existing', 45);
  const blocksBefore = database.connection.prepare('SELECT * FROM calendar_blocks').all();
  database.connection.exec("CREATE TRIGGER fail_schedule BEFORE INSERT ON calendar_blocks BEGIN SELECT RAISE(ABORT, 'simulated schedule write failure'); END;");
  assert.throws(() => save(repository, 'Must not persist', 60), /simulated schedule write failure/);
  assert.deepEqual(repository.getDay(DAY, NOW), before);
  assert.deepEqual(database.connection.prepare('SELECT * FROM calendar_blocks').all(), blocksBefore);
});

test('reading a later day snapshot is read-only and does not rewrite stored history', () => {
  const database = open(); const repository = new PlannerRepository(database);
  save(repository, 'Task', 45);
  const stored = database.connection.prepare('SELECT * FROM calendar_blocks').all();
  const later = repository.getDay(DAY, new Date('2026-10-25T03:30:00.000Z'));
  assert.equal(later.plan.scheduledBlocks[0]!.startMinute, 540);
  assert.deepEqual(database.connection.prepare('SELECT * FROM calendar_blocks').all(), stored);
});

test('repository validates untrusted task fields before writing and stores titles as plain text', () => {
  const repository = new PlannerRepository(open());
  const base = { title: 'Task', notes: '', plannedMinutes: 45, plannedDate: DAY, viewDate: DAY };
  for (const change of [{ title: ' ' }, { plannedMinutes: -1 }, { plannedMinutes: 1.5 }, { plannedDate: '2026-02-30' }, { notes: 'x'.repeat(20001) }]) {
    assert.throws(() => repository.saveTask({ ...base, ...change }, NOW), PlannerInputError);
    assert.equal(repository.getDay(DAY, NOW).tasks.length, 0);
  }
  const literal = "<img src=x onerror=alert(1)>'); DROP TABLE tasks; --";
  const result = repository.saveTask({ ...base, title: literal }, NOW);
  assert.equal(result.tasks[0]!.title, literal);
  assert.equal(repository.getDay(DAY, NOW).tasks.length, 1);
});

test('the app clock uses the saved timezone across midnight without a UTC date shift', () => {
  assert.deepEqual(localClock(new Date('2026-10-25T18:29:30.000Z'), 'Asia/Kolkata'), { date: DAY, minute: 1439.5 });
  assert.deepEqual(localClock(new Date('2026-10-25T18:30:00.000Z'), 'Asia/Kolkata'), { date: '2026-10-26', minute: 0 });
  assert.deepEqual(localClock(new Date('2026-10-25T01:30:00.000Z'), 'America/Los_Angeles'), { date: '2026-10-24', minute: 1110 });
});

test('duration input accepts hours and minutes without silently rounding malformed values', () => {
  for (const [text, expected] of [['45', 45], ['45m', 45], ['2h', 120], ['1h 30m', 90], ['1:30', 90], ['2 hours 5 minutes', 125]] as const) assert.equal(parseDuration(text), expected);
  for (const text of ['', '0', '-5', '1.5h', '1:90', 'two hours', '45m garbage', 'Infinity']) assert.equal(parseDuration(text), null);
  assert.equal(formatDuration(270), '4h 30m');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
});

test('Phase 3 upgrade preserves task IDs, deleted/completed rows, history, settings, and foreign keys', () => {
  const path = databasePath(); const seed = open(path); seed.close(); rmSync(path, { force: true });
  const old = new Database(path); old.pragma('foreign_keys = ON'); migrate(old, migrations.slice(0, 2));
  old.prepare('INSERT INTO planner_settings (id, day_start_minute, time_zone) VALUES (1,480,?)').run('Asia/Kolkata');
  for (const [id, completed, deleted] of [['one', 0, null], ['done', 1, null], ['deleted', 0, NOW.toISOString()]] as const) {
    old.prepare('INSERT INTO tasks (id,title,notes,planned_date,planned_minutes,completed,position,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,id,'keep notes',DAY,45,completed,1,NOW.toISOString(),NOW.toISOString(),deleted);
  }
  old.prepare('INSERT INTO calendar_blocks VALUES (?,?,?,?,?,?)').run('keep-block','done',DAY,400,420,'completed');
  const before = old.prepare('SELECT * FROM tasks ORDER BY id').all(); old.close();
  const database = open(path);
  const after = database.connection.prepare('SELECT * FROM tasks ORDER BY id').all() as Record<string, unknown>[];
  assert.deepEqual(after.map(({ project_id, deadline, recurrence_id, occurrence_date, ...row }) => row), before);
  assert.ok(after.every((row) => row.project_id === null && row.deadline === null));
  assert.deepEqual(database.connection.prepare('SELECT * FROM calendar_blocks').all(), [{id:'keep-block',task_id:'done',date:DAY,start_minute:400,end_minute:420,kind:'completed'}]);
  assert.equal(database.getStatus().dailyHours.startMinute,480);
  assert.deepEqual(database.connection.pragma('foreign_key_check'), []);
  assert.equal(database.connection.pragma('integrity_check', {simple:true}), 'ok');
});

test('backlog has no blocks; moving to/from a day preserves identity, notes, estimate and deadline', () => {
  const database = open(); const repository = new PlannerRepository(database);
  let snapshot = repository.saveTask({title:'Future work',notes:'retain',plannedMinutes:45,plannedDate:null,deadline:'2026-10-26',viewDate:DAY},NOW);
  const task = snapshot.backlog[0]!;
  assert.equal(snapshot.tasks.length,0); assert.equal(snapshot.plan.scheduledBlocks.length,0);
  snapshot = repository.saveTask({...task,plannedDate:DAY,viewDate:DAY},NOW);
  assert.equal(snapshot.backlog.length,0); assert.equal(snapshot.plan.summary.scheduledMinutes,45);
  snapshot = repository.saveTask({...snapshot.tasks[0]!,plannedDate:null,viewDate:DAY},NOW);
  assert.equal(snapshot.plan.scheduledBlocks.length,0);
  assert.deepEqual(snapshot.backlog.map((row) => [row.id,row.notes,row.plannedMinutes,row.deadline]),[[task.id,'retain',45,'2026-10-26']]);
  assert.equal(database.connection.prepare("SELECT * FROM calendar_blocks WHERE kind='scheduled'").all().length,0);
  repository.setTaskCompleted({id:task.id,completed:true,viewDate:DAY},NOW);
  repository.deleteTask({id:task.id,viewDate:DAY},NOW);
  assert.equal(repository.restoreTask({id:task.id,viewDate:DAY},NOW).backlog[0]!.completed,true);
});

test('projects, nullable assignments and deadlines survive reopening without changing scheduling order', () => {
  const path = databasePath(); const database = open(path); const repository = new PlannerRepository(database);
  const project = repository.saveProject({title:'Learning',color:'#aabbee',notes:'Read daily',deadline:'2026-11-01',viewDate:DAY},NOW).projects[0]!;
  save(repository,'First',45);
  let snapshot = repository.saveTask({title:'Urgent',notes:'project task',plannedMinutes:60,plannedDate:DAY,projectId:project.id,deadline:'2026-10-24',viewDate:DAY},NOW);
  assert.deepEqual(snapshot.tasks.map((row)=>row.title),['First','Urgent']);
  const task = snapshot.tasks[1]!;
  snapshot = repository.saveProject({...project,title:'Study',color:'#aaccee',notes:'Updated',viewDate:DAY},NOW);
  assert.equal(snapshot.allTasks.find((row)=>row.id===task.id)!.projectId,project.id);
  assert.equal(snapshot.projects[0]!.deadline,'2026-11-01');
  database.close();
  const reopened = new PlannerRepository(open(path)).getDay(DAY,NOW);
  assert.deepEqual(reopened.projects,snapshot.projects); assert.deepEqual(reopened.allTasks,snapshot.allTasks);
  assert.equal(reopened.board.length,7); assert.equal(reopened.board.at(-1)!.date,'2026-10-31');
});

const ONE_PM = new Date('2026-10-25T07:30:00.000Z');
function eventInput(start=840,end=960) { return {title:'Meeting',notes:'Local event',start:{date:DAY,minute:start},end:{date:DAY,minute:end},viewDate:DAY}; }

test('fixed event produces the exact 1–2 PM / 4–5 PM task split and delete restores continuous time', () => {
  const database = open(); const repository = new PlannerRepository(database);
  repository.saveTask({title:'Two hours',notes:'',plannedMinutes:120,plannedDate:DAY,viewDate:DAY},ONE_PM);
  const snapshot = repository.saveEvent(eventInput(),ONE_PM);
  assert.deepEqual(snapshot.plan.scheduledBlocks.map((b)=>[b.startMinute,b.endMinute]),[[780,840],[960,1020]]);
  assert.equal(snapshot.plan.summary.fixedEventMinutes,120);
  assert.equal(database.connection.prepare("SELECT * FROM calendar_blocks WHERE kind='scheduled'").all().length,2);
  const removed=repository.deleteEvent({id:snapshot.events[0]!.id,viewDate:DAY},ONE_PM);
  assert.equal(removed.events.length,0);
  assert.deepEqual(removed.plan.scheduledBlocks.map((b)=>[b.startMinute,b.endMinute]),[[780,900]]);
});

test('editing, moving and resizing a fixed event updates all affected days and persisted blocks', () => {
  const repository = new PlannerRepository(open());
  repository.saveTask({title:'Today',notes:'',plannedMinutes:120,plannedDate:DAY,viewDate:DAY},ONE_PM);
  repository.saveTask({title:'Tomorrow',notes:'',plannedMinutes:120,plannedDate:'2026-10-26',viewDate:DAY},ONE_PM);
  const original = repository.saveEvent(eventInput(),ONE_PM).events[0]!;
  let snapshot = repository.saveEvent({...original,title:'Moved overnight',start:{date:DAY,minute:1380},end:{date:'2026-10-26',minute:420},viewDate:DAY},ONE_PM);
  assert.deepEqual(snapshot.plan.scheduledBlocks.map((b)=>[b.startMinute,b.endMinute]),[[780,900]]);
  assert.equal(snapshot.board[1]!.plan.scheduledBlocks[0]!.startMinute,420);
  snapshot = repository.saveEvent({...snapshot.events[0]!,end:{date:'2026-10-26',minute:480},viewDate:'2026-10-26'},ONE_PM);
  assert.equal(snapshot.plan.scheduledBlocks[0]!.startMinute,480);
  assert.equal(snapshot.plan.summary.fixedEventMinutes,120);
  assert.equal(snapshot.events[0]!.title,'Moved overnight');
  assert.deepEqual(repository.getDay(DAY,ONE_PM).plan.scheduledBlocks.map((b)=>[b.startMinute,b.endMinute]),[[780,900]]);
});

test('overlapping fixed events count their union and report conflicts without double-booking tasks', () => {
  const repository = new PlannerRepository(open()); save(repository,'Work',600);
  repository.saveEvent(eventInput(840,960),ONE_PM);
  const snapshot=repository.saveEvent({...eventInput(900,1020),title:'Overlap'},ONE_PM);
  assert.equal(snapshot.plan.summary.fixedEventMinutes,180);
  assert.ok(snapshot.plan.eventConflicts.length>0);
  assert.ok(snapshot.plan.scheduledBlocks.every((b)=>b.endMinute<=840||b.startMinute>=1020));
});

test('a failed event reschedule rolls back both the event and task blocks', () => {
  const database=open(); const repository=new PlannerRepository(database); save(repository,'Work',120);
  const before=repository.getDay(DAY,ONE_PM);
  const blocks=database.connection.prepare('SELECT * FROM calendar_blocks ORDER BY id').all();
  database.connection.exec("CREATE TRIGGER reject_block BEFORE INSERT ON calendar_blocks BEGIN SELECT RAISE(ABORT,'simulated disk write failure'); END;");
  assert.throws(()=>repository.saveEvent(eventInput(),ONE_PM),/simulated disk write failure/);
  assert.deepEqual(repository.getDay(DAY,ONE_PM),before);
  assert.deepEqual(database.connection.prepare('SELECT * FROM calendar_blocks ORDER BY id').all(),blocks);
});

test('rejects invalid event/project/deadline and missing project IDs before writing', () => {
  const repository=new PlannerRepository(open());
  for (const input of [eventInput(840,840),eventInput(900,840),eventInput(-1,840),eventInput(840,1440),{...eventInput(),start:{date:'2026-02-30',minute:500}}]) assert.throws(()=>repository.saveEvent(input,NOW),PlannerInputError);
  for (const color of ['red','#123','url(invalid)']) assert.throws(()=>repository.saveProject({title:'Project',notes:'',color,deadline:null,viewDate:DAY},NOW),PlannerInputError);
  assert.throws(()=>repository.saveTask({title:'Task',notes:'',plannedDate:null,plannedMinutes:45,projectId:'missing',viewDate:DAY},NOW),PlannerInputError);
  assert.throws(()=>repository.saveTask({title:'Task',notes:'',plannedDate:DAY,plannedMinutes:45,deadline:'2026-02-30',viewDate:DAY},NOW),PlannerInputError);
  const snapshot=repository.getDay(DAY,NOW); assert.equal(snapshot.events.length,0); assert.equal(snapshot.projects.length,0); assert.equal(snapshot.allTasks.length,0);
});

// Phase 5: all clock advances are explicit, with no waits or personal data.
function advanceFocus(repository:PlannerRepository,from:Date,milliseconds:number):Date {
  const end=new Date(from.getTime()+milliseconds);
  for(let at=from.getTime()+10000;at<=end.getTime();at+=10000)repository.checkpointFocus(new Date(at));
  repository.checkpointFocus(end);return end;
}
function repeating(repository:PlannerRepository,weekdays=[0,1,2,3,4,5,6]) {
  return repository.saveTask({title:'Daily typing',notes:'Practice',plannedMinutes:45,plannedDate:DAY,viewDate:DAY,recurrence:{weekdays}},NOW);
}

test('daily recurrence creates independent instances once, including after reopen and date revisits',()=>{
  const path=databasePath();const database=open(path);const repository=new PlannerRepository(database);
  let data=repeating(repository);assert.equal(data.allTasks.length,7);
  const first=data.tasks[0]!;const tomorrow=data.board[1]!.tasks[0]!;
  assert.notEqual(first.id,tomorrow.id);assert.equal(first.recurrenceId,tomorrow.recurrenceId);
  data=repository.setTaskCompleted({id:first.id,completed:true,viewDate:DAY},NOW);
  assert.equal(data.board[1]!.tasks[0]!.completed,false);
  assert.equal(repository.getDay(DAY,NOW).allTasks.length,7);
  database.close();const reopened=new PlannerRepository(open(path));
  assert.equal(reopened.getDay(DAY,NOW).allTasks.length,7);
  assert.equal(reopened.getDay(DAY,NOW).tasks[0]!.id,first.id);
});

test('selected weekdays follow civil weekdays, skip nonselected dates and never generate before start',()=>{
  const repository=new PlannerRepository(open());
  // 2026-10-26 is Monday; select Monday and Wednesday.
  const data=repository.saveTask({title:'Study',notes:'',plannedMinutes:60,plannedDate:'2026-10-26',viewDate:DAY,recurrence:{weekdays:[1,3]}},NOW);
  assert.equal(data.tasks.length,0);
  assert.deepEqual(data.allTasks.map((task)=>task.plannedDate).sort(),['2026-10-26','2026-10-28']);
  assert.equal(repository.getDay('2026-10-24',NOW).tasks.length,0);
  assert.equal(repository.getDay('2026-10-26',NOW).tasks[0]!.title,'Study');
});

test('moving/deleting an occurrence never recreates it; editing affects only that occurrence',()=>{
  const repository=new PlannerRepository(open());let data=repeating(repository);const first=data.tasks[0]!;
  data=repository.saveTask({...first,title:'One special day',plannedDate:null,viewDate:DAY},NOW);
  assert.equal(data.tasks.length,0);assert.equal(data.backlog[0]!.occurrenceDate,DAY);
  assert.equal(data.board[1]!.tasks[0]!.title,'Daily typing');
  repository.deleteTask({id:first.id,viewDate:DAY},NOW);
  assert.equal(repository.getDay(DAY,NOW).tasks.length,0);
  const restored=repository.restoreTask({id:first.id,viewDate:DAY},NOW).backlog[0]!;
  assert.equal(restored.id,first.id);assert.equal(restored.title,'One special day');
});

test('stopping future repeats preserves past, today, moved and completed instances, and prevents regeneration',()=>{
  const repository=new PlannerRepository(open());let data=repeating(repository);
  const first=data.tasks[0]!;const moved=data.board[1]!.tasks[0]!;const completed=data.board[2]!.tasks[0]!;
  repository.saveTask({...moved,plannedDate:null,viewDate:DAY},NOW);
  repository.setTaskCompleted({id:completed.id,completed:true,viewDate:DAY},NOW);
  data=repository.saveTask({...first,stopRepeats:true,viewDate:DAY},NOW);
  assert.equal(data.allTasks.length,3);assert.equal(data.backlog[0]!.id,moved.id);
  assert.equal(data.recurrences[0]!.stoppedOn,DAY);
  assert.equal(repository.getDay('2026-12-01',NOW).tasks.length,0);
  assert.equal(repository.getDay(DAY,NOW).allTasks.length,3);
});

test('recurrence validates weekdays and atomically rolls back the first task on failure',()=>{
  const repository=new PlannerRepository(open());
  for(const weekdays of [[],[7],[-1],[0,0],[1]])assert.throws(()=>repeating(repository,weekdays),PlannerInputError);
  assert.equal(repository.getDay(DAY,NOW).allTasks.length,0);
  assert.throws(()=>repository.saveTask({title:'Backlog',notes:'',plannedDate:null,plannedMinutes:45,viewDate:DAY,recurrence:{weekdays:[0]}},NOW),PlannerInputError);
  const data=repeating(repository);assert.throws(()=>repository.saveTask({...data.tasks[0]!,recurrence:{weekdays:[0]},viewDate:DAY},NOW),PlannerInputError);
  assert.equal(repository.getDay(DAY,NOW).recurrences.length,1);
});

test('focus start prioritizes a lower task; pause retains exact elapsed time and resume deducts it',()=>{
  const repository=new PlannerRepository(open());save(repository,'First',45);let data=save(repository,'Second',60);
  const second=data.tasks[1]!;data=repository.startFocus({id:second.id,viewDate:DAY},NOW);
  assert.equal(data.plan.scheduledBlocks[0]!.taskId,second.id);assert.equal(data.tasks[0]!.title,'First');
  let at=advanceFocus(repository,NOW,90500);data=repository.pauseFocus({id:second.id,viewDate:DAY},at);
  assert.equal(data.focus!.running,false);assert.equal(data.focus!.actualMilliseconds,90500);
  assert.equal(data.tasks[1]!.actualMinutes,90500/60000);
  assert.ok(Math.abs(data.plan.tasks[1]!.remainingMinutes-(60-90500/60000))<1e-8);
  at=new Date(at.getTime()+3600000);data=repository.startFocus({id:second.id,viewDate:DAY},at);
  at=advanceFocus(repository,at,29500);data=repository.pauseFocus({id:second.id,viewDate:DAY},at);
  assert.equal(data.focus!.actualMilliseconds,120000);assert.equal(data.plan.tasks[1]!.remainingMinutes,58);
});

test('switching focus is atomic, idempotent, and permits only one running session',()=>{
  const database=open();const repository=new PlannerRepository(database);save(repository,'First',45);let data=save(repository,'Second',60);
  const [first,second]=data.tasks;repository.startFocus({id:first!.id,viewDate:DAY},NOW);
  const at=advanceFocus(repository,NOW,5000);data=repository.startFocus({id:second!.id,viewDate:DAY},at);
  repository.startFocus({id:second!.id,viewDate:DAY},at);
  assert.equal(database.connection.prepare('SELECT * FROM focus_sessions WHERE ended_at IS NULL').all().length,1);
  assert.equal(database.connection.prepare('SELECT * FROM focus_sessions').all().length,2);
  assert.equal(data.tasks[0]!.actualMinutes,5/60);
  assert.throws(()=>repository.pauseFocus({id:first!.id,viewDate:DAY},at),PlannerInputError);
});

test('sleep and clean quit pause at the saved moment and never count downtime',()=>{
  for(const reason of ['sleep','quit'] as const) {
    const path=databasePath();const database=open(path);const repository=new PlannerRepository(database);const task=save(repository,'Focus',45).tasks[0]!;
    repository.startFocus({id:task.id,viewDate:DAY},NOW);const at=advanceFocus(repository,NOW,6500);
    repository.pauseForLifecycle(at,reason);database.close();
    const reopened=new PlannerRepository(open(path));reopened.recoverFocus();
    const data=reopened.getDay(DAY,new Date(at.getTime()+4*3600000));
    assert.equal(data.focus!.running,false);assert.equal(data.focus!.reason,reason);assert.equal(data.focus!.actualMilliseconds,6500);
  }
});

test('crash recovery closes at the last checkpoint and repeated recoveries cannot double-count',()=>{
  const path=databasePath();const database=open(path);const repository=new PlannerRepository(database);const task=save(repository,'Focus',45).tasks[0]!;
  repository.startFocus({id:task.id,viewDate:DAY},NOW);advanceFocus(repository,NOW,12500);database.close();
  const reopened=new PlannerRepository(open(path));reopened.recoverFocus();reopened.recoverFocus();
  const data=reopened.getDay(DAY,new Date(NOW.getTime()+3600000));
  assert.equal(data.focus!.reason,'interrupted');assert.equal(data.focus!.actualMilliseconds,12500);assert.equal(data.focus!.running,false);
});

test('missed sleep or backward clock corrections pause without adding a gap or corrupting the plan',()=>{
  for(const delta of [3600000,-3600000]) {
    const repository=new PlannerRepository(open());const task=save(repository,'Focus',45).tasks[0]!;
    repository.startFocus({id:task.id,viewDate:DAY},NOW);advanceFocus(repository,NOW,5000);
    const data=repository.getDay(DAY,new Date(NOW.getTime()+5000+delta));
    assert.equal(data.focus!.reason,'interrupted');assert.equal(data.focus!.actualMilliseconds,5000);assert.equal(data.focus!.running,false);
    assert.equal(data.tasks[0]!.actualMinutes,5/60);
  }
});

test('completion, deletion and moving away stop focus while preserving actual records and undo',()=>{
  for(const change of ['complete','delete','move'] as const) {
    const repository=new PlannerRepository(open());const task=save(repository,'Focus',45).tasks[0]!;
    repository.startFocus({id:task.id,viewDate:DAY},NOW);const at=advanceFocus(repository,NOW,10000);
    let data=change==='complete'?repository.setTaskCompleted({id:task.id,completed:true,viewDate:DAY},at):change==='delete'?repository.deleteTask({id:task.id,viewDate:DAY},at):repository.saveTask({...task,plannedDate:null,viewDate:DAY},at);
    assert.equal(data.focus,null);
    if(change==='delete')data=repository.restoreTask({id:task.id,viewDate:DAY},at);
    assert.equal(data.allTasks.find((row)=>row.id===task.id)!.actualMinutes,1/6);
    if(change==='complete'){assert.equal(data.plan.completedBlocks.length,0);assert.equal(data.plan.recordedBlocks.length,1);}
  }
});

test('overrun focus remains running with zero remaining estimate and positive actual time',()=>{
  const repository=new PlannerRepository(open());const task=save(repository,'Short',1).tasks[0]!;
  repository.startFocus({id:task.id,viewDate:DAY},NOW);const at=advanceFocus(repository,NOW,90000);const data=repository.getDay(DAY,at);
  assert.equal(data.focus!.running,true);assert.equal(data.plan.tasks[0]!.remainingMinutes,0);assert.equal(data.tasks[0]!.actualMinutes,1.5);
});

test('midnight creates a fresh occurrence, splits actual time by date and keeps yesterday identity on restart',()=>{
  const path=databasePath();const database=open(path);const repository=new PlannerRepository(database);
  const beforeMidnight=new Date('2026-10-25T18:29:50.000Z');let data=repeating(repository);const old=data.tasks[0]!;
  repository.startFocus({id:old.id,viewDate:DAY},beforeMidnight);
  const afterMidnight=advanceFocus(repository,beforeMidnight,20000);data=repository.getDay(undefined,afterMidnight);
  assert.equal(data.date,'2026-10-26');assert.equal(data.focus!.taskId,old.id);assert.equal(data.focus!.actualMilliseconds,20000);
  assert.equal(data.actualMinutesOnDate,10/60);assert.equal(data.tasks[0]!.actualMinutes,0);assert.notEqual(data.tasks[0]!.id,old.id);
  assert.equal(data.tasks[0]!.completed,false);assert.equal(repository.getDay(DAY,afterMidnight).actualMinutesOnDate,10/60);
  repository.pauseForLifecycle(afterMidnight,'quit');database.close();
  const reopened=new PlannerRepository(open(path));reopened.recoverFocus();data=reopened.getDay(undefined,new Date('2026-10-26T01:00:00.000Z'));
  assert.equal(data.focus!.actualMilliseconds,20000);assert.equal(data.tasks.length,1);assert.equal(data.tasks[0]!.occurrenceDate,'2026-10-26');
});

test('focus cannot start on backlog, future, completed, deleted or nonexistent tasks',()=>{
  const repository=new PlannerRepository(open());let data=save(repository,'Tomorrow',45,'2026-10-26');
  assert.throws(()=>repository.startFocus({id:data.allTasks[0]!.id,viewDate:DAY},NOW),PlannerInputError);
  data=repository.saveTask({title:'Backlog',notes:'',plannedMinutes:45,plannedDate:null,viewDate:DAY},NOW);
  assert.throws(()=>repository.startFocus({id:data.backlog[0]!.id,viewDate:DAY},NOW),PlannerInputError);
  const task=save(repository,'Today',45).tasks[0]!;repository.setTaskCompleted({id:task.id,completed:true,viewDate:DAY},NOW);
  assert.throws(()=>repository.startFocus({id:task.id,viewDate:DAY},NOW),PlannerInputError);
  assert.throws(()=>repository.startFocus({id:'missing',viewDate:DAY},NOW),PlannerInputError);
});

test('focus transaction failure preserves the previous running task and elapsed records',()=>{
  const database=open();const repository=new PlannerRepository(database);save(repository,'First',45);const data=save(repository,'Second',45);const [first,second]=data.tasks;
  repository.startFocus({id:first!.id,viewDate:DAY},NOW);
  database.connection.exec("CREATE TRIGGER reject_focus BEFORE INSERT ON focus_sessions BEGIN SELECT RAISE(ABORT,'focus write failed'); END;");
  assert.throws(()=>repository.startFocus({id:second!.id,viewDate:DAY},new Date(NOW.getTime()+1000)),/focus write failed/);
  const snapshot=repository.getDay(DAY,NOW);assert.equal(snapshot.focus!.taskId,first!.id);assert.equal(snapshot.focus!.running,true);assert.equal(snapshot.focus!.actualMilliseconds,0);
});

test('UTC focus durations remain exact across daylight-saving transitions',()=>{
  for(const interval of [
    ['2026-11-01','2026-11-01T08:30:00.000Z','2026-11-01T10:30:00.000Z',120],
    ['2026-03-08','2026-03-08T09:30:00.000Z','2026-03-08T10:30:00.000Z',60],
  ] as const) {
    const [date,start,end,minutes]=interval;const database=open();database.connection.prepare('UPDATE planner_settings SET time_zone=?').run('America/Los_Angeles');const repository=new PlannerRepository(database);
    const task=repository.saveTask({title:'DST work',notes:'',plannedDate:date,plannedMinutes:180,viewDate:date},new Date(start)).tasks[0]!;
    database.connection.prepare('INSERT INTO focus_sessions (id,task_id,started_at,checkpoint_at,ended_at,reason) VALUES (?,?,?,?,?,?)').run('dst-session',task.id,Date.parse(start),Date.parse(end),Date.parse(end),'paused');
    const data=repository.getDay(date,new Date(end));assert.equal(data.tasks[0]!.actualMinutes,minutes);assert.equal(data.actualMinutesOnDate,minutes);assert.equal(data.plan.tasks[0]!.remainingMinutes,180-minutes);
  }
});

test('recurrence generation failure rolls back every occurrence and its template together',()=>{
  const database=open();const repository=new PlannerRepository(database);
  database.connection.exec("CREATE TRIGGER reject_tomorrow BEFORE INSERT ON tasks WHEN NEW.planned_date='2026-10-26' BEGIN SELECT RAISE(ABORT,'occurrence failure'); END;");
  assert.throws(()=>repeating(repository),/occurrence failure/);
  assert.equal(repository.getDay(DAY,NOW).allTasks.length,0);assert.equal(repository.getDay(DAY,NOW).recurrences.length,0);
});

test('Schema 3 upgrade preserves Phase 4 data and initializes empty focus state',()=>{
  const path=databasePath();const seed=open(path);seed.close();rmSync(path,{force:true});const old=new Database(path);migrate(old,migrations.slice(0,3));
  old.prepare('INSERT INTO planner_settings (id,time_zone) VALUES (1,?)').run('Asia/Kolkata');
  old.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?)').run('project','Keep','#aabbcc','Notes',null,NOW.toISOString(),NOW.toISOString());
  old.prepare('INSERT INTO tasks (id,title,notes,planned_date,planned_minutes,position,created_at,updated_at,project_id,deadline) VALUES (?,?,?,?,?,?,?,?,?,?)').run('task','Existing','Task notes',DAY,45,0,NOW.toISOString(),NOW.toISOString(),'project','2026-10-27');
  old.prepare('INSERT INTO fixed_events (id,title,notes,start_date,start_minute,end_date,end_minute,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run('event','Event','Event notes',DAY,840,DAY,900,NOW.toISOString(),NOW.toISOString());old.close();
  const database=open(path);const data=new PlannerRepository(database).getDay(DAY,NOW);
  assert.equal(database.schemaVersion,4);assert.equal(data.tasks[0]!.id,'task');assert.equal(data.tasks[0]!.deadline,'2026-10-27');assert.equal(data.projects[0]!.title,'Keep');assert.equal(data.events[0]!.title,'Event');assert.equal(data.focus,null);assert.deepEqual(database.connection.pragma('foreign_key_check'),[]);
});

test('board drop reorders within a day and preserves timer priority and list identity',()=>{
  const repository=new PlannerRepository(open());save(repository,'First',45);save(repository,'Second',60);let data=save(repository,'Third',30);
  const [first,second,third]=data.tasks;
  repository.startFocus({id:second!.id,viewDate:DAY},NOW);
  data=repository.moveTask({id:third!.id,plannedDate:DAY,beforeTaskId:first!.id,viewDate:DAY},NOW);
  assert.deepEqual(data.tasks.map((row)=>row.id),[third!.id,first!.id,second!.id]);
  assert.equal(data.focus!.taskId,second!.id);assert.equal(data.focus!.running,true);
  assert.equal(data.plan.scheduledBlocks[0]!.taskId,second!.id);
  data=repository.moveTask({id:third!.id,plannedDate:DAY,beforeTaskId:null,viewDate:DAY},NOW);
  assert.deepEqual(data.tasks.map((row)=>row.id),[first!.id,second!.id,third!.id]);
});

test('board drop moves into an exact destination slot and reflows both days',()=>{
  const database=open();const repository=new PlannerRepository(database);save(repository,'Move me',45);let data=save(repository,'Stay',30);
  const moving=data.tasks[0]!;
  save(repository,'Tomorrow first',60,'2026-10-26');data=save(repository,'Tomorrow last',90,'2026-10-26');
  const last=data.tasks[1]!;
  data=repository.moveTask({id:moving.id,plannedDate:'2026-10-26',beforeTaskId:last.id,viewDate:DAY},NOW);
  assert.deepEqual(data.tasks.map((row)=>row.title),['Stay']);
  assert.deepEqual(data.board[1]!.tasks.map((row)=>row.title),['Tomorrow first','Move me','Tomorrow last']);
  assert.equal(data.plan.scheduledBlocks[0]!.startMinute,420);
  assert.deepEqual(data.board[1]!.plan.scheduledBlocks.map((block)=>[block.startMinute,block.endMinute]),[[360,420],[420,465],[465,555]]);
  const saved=database.connection.prepare("SELECT task_id AS taskId,date,start_minute AS startMinute FROM calendar_blocks WHERE kind='scheduled' ORDER BY date,start_minute").all();
  assert.deepEqual(saved.map((row)=>row),[...data.plan.scheduledBlocks,...data.board[1]!.plan.scheduledBlocks].map(({taskId,date,startMinute})=>({taskId,date,startMinute})));
});

test('board drop inserts and reorders backlog work without scheduling it',()=>{
  const repository=new PlannerRepository(open());const moving=save(repository,'Dated',45).tasks[0]!;
  repository.saveTask({title:'Backlog first',notes:'',plannedMinutes:30,plannedDate:null,viewDate:DAY},NOW);
  let data=repository.saveTask({title:'Backlog last',notes:'',plannedMinutes:60,plannedDate:null,viewDate:DAY},NOW);
  const last=data.backlog[1]!;
  data=repository.moveTask({id:moving.id,plannedDate:null,beforeTaskId:last.id,viewDate:DAY},NOW);
  assert.deepEqual(data.backlog.map((row)=>row.title),['Backlog first','Dated','Backlog last']);assert.equal(data.plan.scheduledBlocks.length,0);
  data=repository.moveTask({id:moving.id,plannedDate:null,beforeTaskId:null,viewDate:DAY},NOW);
  assert.deepEqual(data.backlog.map((row)=>row.title),['Backlog first','Backlog last','Dated']);
  data=repository.moveTask({id:moving.id,plannedDate:DAY,beforeTaskId:null,viewDate:DAY},NOW);
  assert.equal(data.tasks[0]!.id,moving.id);assert.equal(data.plan.summary.scheduledMinutes,45);
});

test('board drop retains separate completion groups with null meaning the end of its group',()=>{
  const repository=new PlannerRepository(open());save(repository,'Pending A',30);save(repository,'Pending B',30);save(repository,'Done A',30);let data=save(repository,'Done B',30);
  const [pendingA,pendingB,doneA,doneB]=data.tasks;
  repository.setTaskCompleted({id:doneA!.id,completed:true,viewDate:DAY},NOW);repository.setTaskCompleted({id:doneB!.id,completed:true,viewDate:DAY},NOW);
  data=repository.moveTask({id:pendingA!.id,plannedDate:DAY,beforeTaskId:null,viewDate:DAY},NOW);
  assert.deepEqual(data.tasks.map((row)=>row.id),[pendingB!.id,pendingA!.id,doneA!.id,doneB!.id]);
  data=repository.moveTask({id:doneB!.id,plannedDate:DAY,beforeTaskId:doneA!.id,viewDate:DAY},NOW);
  assert.deepEqual(data.tasks.map((row)=>row.id),[pendingB!.id,pendingA!.id,doneB!.id,doneA!.id]);
  data=repository.moveTask({id:pendingB!.id,plannedDate:DAY,beforeTaskId:doneB!.id,viewDate:DAY},NOW);
  assert.deepEqual(data.tasks.map((row)=>row.id),[pendingA!.id,pendingB!.id,doneB!.id,doneA!.id]);
  assert.throws(()=>repository.moveTask({id:doneB!.id,plannedDate:DAY,beforeTaskId:pendingA!.id,viewDate:DAY},NOW),PlannerInputError);
});

test('invalid or stale board insertion targets cannot partially move a task',()=>{
  const repository=new PlannerRepository(open());const moving=save(repository,'Moving',45).tasks[0]!;const foreign=save(repository,'Other day',30,'2026-10-26').tasks[0]!;
  const before=repository.getDay(DAY,NOW);
  const valid={id:moving.id,plannedDate:DAY,beforeTaskId:null,viewDate:DAY};
  for(const change of [
    {beforeTaskId:moving.id},{beforeTaskId:foreign.id},{beforeTaskId:'missing'},
    {plannedDate:'2026-02-30'},{id:''},{plannedDate:undefined},{beforeTaskId:undefined},
  ])assert.throws(()=>repository.moveTask({...valid,...change} as never,NOW),PlannerInputError);
  assert.deepEqual(repository.getDay(DAY,NOW),before);
  repository.deleteTask({id:foreign.id,viewDate:DAY},NOW);
  assert.throws(()=>repository.moveTask({...valid,plannedDate:'2026-10-26',beforeTaskId:foreign.id},NOW),PlannerInputError);
  assert.equal(repository.getDay(DAY,NOW).tasks[0]!.id,moving.id);
});

test('a failed board drop rolls back date, order, active focus and both saved schedules',()=>{
  const database=open();const repository=new PlannerRepository(database);const moving=save(repository,'Moving',45).tasks[0]!;save(repository,'Destination',30,'2026-10-26');
  repository.startFocus({id:moving.id,viewDate:DAY},NOW);
  const before=repository.getDay(DAY,NOW);const blocks=database.connection.prepare('SELECT * FROM calendar_blocks ORDER BY id').all();const sessions=database.connection.prepare('SELECT * FROM focus_sessions').all();
  database.connection.exec("CREATE TRIGGER reject_board_schedule BEFORE INSERT ON calendar_blocks WHEN NEW.date='2026-10-26' BEGIN SELECT RAISE(ABORT,'board save failed'); END;");
  assert.throws(()=>repository.moveTask({id:moving.id,plannedDate:'2026-10-26',beforeTaskId:null,viewDate:DAY},NOW),/board save failed/);
  assert.deepEqual(repository.getDay(DAY,NOW),before);assert.deepEqual(database.connection.prepare('SELECT * FROM calendar_blocks ORDER BY id').all(),blocks);assert.deepEqual(database.connection.prepare('SELECT * FROM focus_sessions').all(),sessions);
});

test('cross-day board insertion preserves recurring identity, project, deadline, notes and actual time',()=>{
  const repository=new PlannerRepository(open());const project=repository.saveProject({title:'Study',notes:'Project',color:'#aabbcc',deadline:null,viewDate:DAY},NOW).projects[0]!;
  let data=repository.saveTask({title:'Recurring focus',notes:'Keep these notes',plannedMinutes:45,plannedDate:DAY,viewDate:DAY,projectId:project.id,deadline:'2026-11-01',recurrence:{weekdays:[0,1,2,3,4,5,6]}},NOW);
  const moving=data.tasks[0]!;const tomorrow=data.board[1]!.tasks[0]!;
  repository.startFocus({id:moving.id,viewDate:DAY},NOW);const at=advanceFocus(repository,NOW,10000);
  data=repository.moveTask({id:moving.id,plannedDate:'2026-10-26',beforeTaskId:tomorrow.id,viewDate:DAY},at);
  const result=data.allTasks.find((row)=>row.id===moving.id)!;
  assert.deepEqual([result.id,result.title,result.notes,result.plannedMinutes,result.projectId,result.deadline,result.recurrenceId,result.occurrenceDate,result.createdAt],
    [moving.id,moving.title,moving.notes,moving.plannedMinutes,moving.projectId,moving.deadline,moving.recurrenceId,moving.occurrenceDate,moving.createdAt]);
  assert.equal(result.actualMinutes,1/6);assert.equal(data.focus,null);assert.equal(data.plan.recordedBlocks[0]!.taskId,moving.id);
  assert.deepEqual(data.board[1]!.tasks.map((row)=>row.id),[moving.id,tomorrow.id]);assert.equal(data.tasks.length,0);
  assert.equal(repository.getDay(DAY,at).tasks.length,0);
});

test('board columns expose authoritative actual minutes for independent calendar selection across midnight',()=>{
  const repository=new PlannerRepository(open());const task=save(repository,'Overnight',45).tasks[0]!;
  const beforeMidnight=new Date('2026-10-25T18:29:50.000Z');repository.startFocus({id:task.id,viewDate:DAY},beforeMidnight);
  const afterMidnight=advanceFocus(repository,beforeMidnight,20000);const data=repository.getDay(DAY,afterMidnight);
  assert.equal(data.actualMinutesOnDate,1/6);assert.equal(data.board[0]!.actualMinutesOnDate,1/6);assert.equal(data.board[1]!.actualMinutesOnDate,1/6);assert.equal(data.board[2]!.actualMinutesOnDate,0);
});

test('menu bar read matches canonical focus time, preserves paused totals and performs no writes',()=>{
  const database=open();const repository=new PlannerRepository(database);
  assert.equal(repository.getMenuBarFocus(NOW),null);
  const task=save(repository,'Menu timer',45).tasks[0]!;
  repository.startFocus({id:task.id,viewDate:DAY},NOW);
  const later=new Date(NOW.getTime()+6500);
  repository.checkpointFocus(later);
  const canonical=repository.getDay(DAY,later).focus!;
  const changes=(database.connection.prepare('SELECT total_changes() AS count').get() as {count:number}).count;
  assert.deepEqual(repository.getMenuBarFocus(later),{...canonical,title:'Menu timer',plannedMinutes:45});
  assert.equal((database.connection.prepare('SELECT total_changes() AS count').get() as {count:number}).count,changes);
  repository.pauseFocus({id:task.id,viewDate:DAY},later);
  assert.equal(repository.getMenuBarFocus(new Date(later.getTime()+3600000))!.actualMilliseconds,6500);
  repository.setTaskCompleted({id:task.id,viewDate:DAY,completed:true},later);
  assert.equal(repository.getMenuBarFocus(later),null);
});

test('settings validate atomically, reflow known dates and persist without generating extra recurrence dates',()=>{
  const database=open();const repository=new PlannerRepository(database);
  const input={title:'Daily settings',notes:'Keep',plannedDate:DAY,plannedMinutes:180,recurrence:{weekdays:[0,1,2,3,4,5,6]},viewDate:DAY};
  const initial=repository.saveTask(input,NOW);const ids=initial.allTasks.map((task)=>task.id);
  const settings={startMinute:840,endMinute:960,timeZone:'Asia/Kolkata',viewDate:DAY};
  const saved=repository.saveSettings(settings,NOW);
  assert.deepEqual(saved.dailyHours,{startMinute:840,endMinute:960,timeZone:'Asia/Kolkata'});
  assert.equal(saved.plan.summary.scheduledMinutes,120);assert.equal(saved.plan.summary.unscheduledMinutes,60);
  assert.deepEqual(saved.allTasks.map((task)=>task.id),ids);
  for(const invalid of [{...settings,endMinute:800},{...settings,startMinute:.5},{...settings,endMinute:1441},{...settings,timeZone:'wrong/zone'}])assert.throws(()=>repository.saveSettings(invalid,NOW),PlannerInputError);
  assert.deepEqual(database.getStatus().dailyHours,saved.dailyHours);
  database.connection.exec("CREATE TRIGGER fail_settings BEFORE UPDATE ON planner_settings BEGIN SELECT RAISE(ABORT,'disk failure'); END;");
  assert.throws(()=>repository.saveSettings({...settings,startMinute:600},NOW));
  assert.deepEqual(database.getStatus().dailyHours,saved.dailyHours);
});

test('changing time zone pauses focus at its UTC duration and preserves task and event civil dates',()=>{
  const database=open();const repository=new PlannerRepository(database);const task=save(repository,'Timezone focus',45).tasks[0]!;
  repository.startFocus({id:task.id,viewDate:DAY},NOW);const later=new Date(NOW.getTime()+5000);
  const data=repository.saveSettings({startMinute:0,endMinute:1440,timeZone:'America/New_York',viewDate:DAY},later);
  assert.equal(data.focus!.running,false);assert.equal(data.focus!.actualMilliseconds,5000);assert.equal(data.tasks[0]!.plannedDate,DAY);
  assert.equal(data.dailyHours.timeZone,'America/New_York');
});

test('backup restores settings, recurring identities, deleted tasks and exact paused focus from WAL safely',async()=>{
  const database=open();const repository=new PlannerRepository(database);const directory=dirname(database.path);
  const initial=repository.saveTask({title:'Backup repeat',notes:'Keep notes',plannedDate:DAY,plannedMinutes:45,viewDate:DAY,recurrence:{weekdays:[0,1,2,3,4,5,6]}},NOW);
  const task=initial.tasks[0]!;repository.startFocus({id:task.id,viewDate:DAY},NOW);
  const at=new Date(NOW.getTime()+6500);repository.checkpointFocus(at);
  const backup=join(directory,'export.sqlite');await writeBackup(database,backup,at);
  assert.equal(repository.getMenuBarFocus(at)!.running,true);
  repository.saveTask({...task,title:'Changed after backup',viewDate:DAY},at);
  repository.saveSettings({startMinute:800,endMinute:1000,timeZone:'UTC',viewDate:DAY},at);
  const holder={current:database};const safety=await restoreBackup(holder,backup,()=>new Date(at.getTime()+3600000));databases.push(holder.current);
  const result=new PlannerRepository(holder.current).getDay(DAY,new Date(at.getTime()+3600000));
  assert.equal(result.tasks[0]!.title,'Backup repeat');assert.equal(result.tasks[0]!.notes,'Keep notes');assert.equal(result.tasks[0]!.id,task.id);
  assert.equal(result.focus!.running,false);assert.equal(result.focus!.actualMilliseconds,6500);assert.equal(result.dailyHours.timeZone,'Asia/Kolkata');
  assert.ok(existsSync(safety));const previous=new PlannerDatabase(safety);databases.push(previous);assert.equal(new PlannerRepository(previous).getDay(DAY,at).tasks[0]!.title,'Changed after backup');
});

test('invalid, foreign, altered and newer backups leave the live database usable and unchanged',async()=>{
  const database=open();const repository=new PlannerRepository(database);save(repository,'Live task',45);
  const holder={current:database};let bad=join(dirname(database.path),'bad.sqlite');writeFileSync(bad,'not a database');
  await assert.rejects(restoreBackup(holder,bad,()=>NOW));
  const foreign=new Database(bad=join(dirname(database.path),'foreign.sqlite'));foreign.exec('CREATE TABLE other (id INTEGER)');foreign.close();
  await assert.rejects(restoreBackup(holder,bad,()=>NOW));
  const backup=join(dirname(database.path),'valid.sqlite');await writeBackup(database,backup,NOW);
  const altered=new Database(backup);altered.exec("CREATE TRIGGER unsafe AFTER INSERT ON tasks BEGIN DELETE FROM tasks; END;");altered.close();
  await assert.rejects(restoreBackup(holder,backup,()=>NOW));
  const newer=join(dirname(database.path),'newer.sqlite');await writeBackup(database,newer,NOW);const newerDb=new Database(newer);newerDb.prepare('INSERT INTO schema_migrations(version,name,checksum) VALUES (99,?,?)').run('future','future');newerDb.close();
  await assert.rejects(restoreBackup(holder,newer,()=>NOW));
  assert.equal(holder.current,database);assert.equal(repository.getDay(DAY,NOW).tasks[0]!.title,'Live task');
  await assert.rejects(writeBackup(database,database.path,NOW));await assert.rejects(restoreBackup(holder,database.path,()=>NOW));
});

test('failed backup publication preserves an existing file and valid older backups migrate in isolation',async()=>{
  const database=open();const repository=new PlannerRepository(database);save(repository,'Live before older restore',30);
  const target=join(dirname(database.path),'existing');mkdirSync(target);writeFileSync(join(target,'keep.txt'),'Keep this');
  await assert.rejects(writeBackup(database,target,NOW));assert.equal(readFileSync(join(target,'keep.txt'),'utf8'),'Keep this');
  const olderPath=join(dirname(database.path),'older.sqlite');const older=new Database(olderPath);migrate(older,migrations.slice(0,2));older.prepare('INSERT INTO planner_settings(id,time_zone) VALUES (1,?)').run('Asia/Kolkata');older.close();
  const original=readFileSync(olderPath);const holder={current:database};await restoreBackup(holder,olderPath,()=>NOW);databases.push(holder.current);
  assert.equal(holder.current.schemaVersion,4);assert.deepEqual(readFileSync(olderPath),original);assert.equal(new PlannerRepository(holder.current).getDay(DAY,NOW).tasks.length,0);
});

test('creation IDs make retrying an unacknowledged task, event or project save idempotent',()=>{
  const database=open();const repository=new PlannerRepository(database);
  const task={id:'retry-task',create:true,title:'One task',notes:'Keep',plannedDate:DAY,plannedMinutes:45,viewDate:DAY,recurrence:{weekdays:[0,1,2,3,4,5,6]}};
  const first=repository.saveTask(task,NOW);const retry=repository.saveTask(task,NOW);
  assert.deepEqual(retry.allTasks.map((row)=>row.id),first.allTasks.map((row)=>row.id));assert.equal(retry.recurrences.length,1);
  const project={id:'retry-project',create:true,title:'One project',notes:'',color:'#aabbcc',deadline:null,viewDate:DAY};repository.saveProject(project,NOW);assert.equal(repository.saveProject(project,NOW).projects.length,1);
  const event={id:'retry-event',create:true,title:'One event',notes:'',start:{date:DAY,minute:840},end:{date:DAY,minute:900},viewDate:DAY};repository.saveEvent(event,NOW);assert.equal(repository.saveEvent(event,NOW).events.length,1);
});
