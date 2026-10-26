import { randomUUID } from 'node:crypto';
import { scheduleDay, type CompletedBlock, type LocalDateTime } from '../../scheduler';
import { dayNumber, minuteRelativeTo } from '../../scheduler/time';
import type { CompleteTaskInput, SaveSettingsInput, PlannerDay, PlannerTask, PlannerProject, PlannerEvent, ReorderTasksInput, MoveTaskInput, SaveTaskInput, SaveProjectInput, SaveEventInput, TaskActionInput } from '../../shared/contracts';
import { shiftDate } from '../../shared/task-input';
import { localClock } from '../local-clock';
import type { PlannerDatabase } from './database';
import { FocusStore } from './focus-store';
import { RecurrenceStore } from './recurrence-store';

interface TaskRow {
  id: string; title: string; notes: string; planned_date: string | null; planned_minutes: number;
  project_id: string | null; deadline: string | null;
  recurrence_id: string | null; occurrence_date: string | null;
  completed: number; position: number; created_at: string; updated_at: string; completed_at: string | null; deleted_at: string | null;
}

export { PlannerInputError } from './input';
import { PlannerInputError, object, date, id, action } from './input';

function toTask(row: TaskRow): PlannerTask {
  return {
    id: row.id, title: row.title, notes: row.notes, plannedDate: row.planned_date,
    plannedMinutes: row.planned_minutes, completed: Boolean(row.completed), position: row.position,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    projectId: row.project_id, deadline: row.deadline,
    recurrenceId: row.recurrence_id, occurrenceDate: row.occurrence_date, actualMinutes: 0,
  };
}

export class PlannerRepository {
  private readonly focusStore: FocusStore;
  private readonly recurrenceStore: RecurrenceStore;
  constructor(private readonly database: PlannerDatabase) {
    this.focusStore=new FocusStore(database.connection,database.getStatus().dailyHours.timeZone);
    this.recurrenceStore=new RecurrenceStore(database.connection);
  }
  getMenuBarFocus(now:Date) {
    const focus=this.focusStore.current(now);if(!focus)return null;
    const task=this.connection.prepare('SELECT title,planned_minutes AS plannedMinutes FROM tasks WHERE id=? AND deleted_at IS NULL AND completed=0').get(focus.taskId) as {title:string;plannedMinutes:number}|undefined;
    return task?{...focus,...task}:null;
  }
  recoverFocus(): void { this.focusStore.recover(); }
  checkpointFocus(now: Date): boolean { return this.connection.transaction(()=>this.focusStore.checkpoint(now)).immediate(); }
  pauseForLifecycle(now: Date, reason: 'sleep' | 'quit' | 'paused'): void {
    this.connection.transaction(()=>{ this.focusStore.pause(now,reason); }).immediate();
  }

  private get connection() { return this.database.connection; }
  private tasks(): PlannerTask[] {
    return (this.connection.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY position, created_at, id').all() as TaskRow[]).map(toTask);
  }
  private find(taskId: string, deleted = false): TaskRow {
    const row = this.connection.prepare(`SELECT * FROM tasks WHERE id = ? AND deleted_at IS ${deleted ? 'NOT ' : ''}NULL`).get(taskId) as TaskRow | undefined;
    if (!row) throw new PlannerInputError('This task is no longer available. Refresh the day and try again.', 'NOT_FOUND');
    return row;
  }
  private completedBlocks(): CompletedBlock[] {
    return this.connection.prepare(`SELECT b.id, b.task_id AS taskId, b.date, b.start_minute AS startMinute, b.end_minute AS endMinute
      FROM calendar_blocks b JOIN tasks t ON t.id = b.task_id
      WHERE b.kind = 'completed' AND t.deleted_at IS NULL AND t.completed = 1`).all() as CompletedBlock[];
  }
  private nextPosition(plannedDate: string | null): number {
    const row = this.connection.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM tasks WHERE planned_date IS ? AND deleted_at IS NULL').get(plannedDate) as { position: number };
    return row.position;
  }

  private projects(): PlannerProject[] {
    return this.connection.prepare('SELECT id,title,color,notes,deadline,created_at AS createdAt,updated_at AS updatedAt FROM projects ORDER BY created_at,id').all() as PlannerProject[];
  }
  private events(): PlannerEvent[] {
    const rows = this.connection.prepare('SELECT * FROM fixed_events WHERE deleted_at IS NULL ORDER BY start_date,start_minute,id').all() as {
      id: string; title: string; notes: string; start_date: string; start_minute: number; end_date: string; end_minute: number; created_at: string; updated_at: string;
    }[];
    return rows.map((row) => ({ id: row.id, title: row.title, notes: row.notes, start: { date: row.start_date, minute: row.start_minute }, end: { date: row.end_date, minute: row.end_minute }, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  getDay(requestedDate: unknown, now: Date, materialize=true): PlannerDay {
    const dailyHours = this.database.getStatus().dailyHours;
    const clock = localClock(now, dailyHours.timeZone);
    const selectedDate = requestedDate === undefined ? clock.date : requestedDate;
    date(selectedDate);
    return this.connection.transaction(() => {
      this.focusStore.checkpoint(now);
      const boardDates: string[]=[];
      for(let offset=0;offset<7;offset++) { const candidate=shiftDate(selectedDate,offset); try{date(candidate);}catch{break;} boardDates.push(candidate); }
      const generated=materialize?this.recurrenceStore.ensure([...boardDates,clock.date],now):[];
      const focus=this.focusStore.snapshot(now,selectedDate,boardDates);
      const tasks=this.tasks().map((task)=>({...task,actualMinutes:(focus.actual.get(task.id)??0)/60000}));
      const events=this.events();const completedBlocks=this.completedBlocks();
      const planFor=(date:string)=>scheduleDay({date,clock,hours:{startMinute:dailyHours.startMinute,endMinute:dailyHours.endMinute},tasks,events,completedBlocks,timeEntries:focus.entries,activeTimer:focus.activeTimer});
      const plan=planFor(selectedDate);
      const board=boardDates.map((date)=>({date,tasks:tasks.filter((task)=>task.plannedDate===date),plan:date===selectedDate?plan:planFor(date),actualMinutesOnDate:(focus.actualOnDates.get(date)??0)/60000}));
      for(const date of generated) this.writeBlocks(date,board.find((column)=>column.date===date)?.plan??planFor(date));
      return {date:selectedDate,today:clock.date,clock,dailyHours,
        tasks:tasks.filter((task)=>task.plannedDate===selectedDate),allTasks:tasks,backlog:tasks.filter((task)=>task.plannedDate===null),
        calendarTitles:Object.fromEntries(tasks.map((task)=>[task.id,task.title])),plan,board,projects:this.projects(),events,
        recurrences:this.recurrenceStore.list(),focus:focus.focus,asOf:now.getTime(),actualMinutesOnDate:focus.actualOnDate/60000};
    }).immediate();
  }

  private writeBlocks(selectedDate:string, plan:PlannerDay['plan']) {
    this.connection.prepare("DELETE FROM calendar_blocks WHERE date = ? AND kind = 'scheduled'").run(selectedDate);
    const insert=this.connection.prepare("INSERT INTO calendar_blocks (id, task_id, date, start_minute, end_minute, kind) VALUES (?, ?, ?, ?, ?, 'scheduled')");
    for(const block of plan.scheduledBlocks)insert.run(block.id,block.taskId,block.date,block.startMinute,block.endMinute);
  }

  private persistSchedule(selectedDate: string, now: Date): PlannerDay {
    const snapshot = this.getDay(selectedDate, now);
    this.writeBlocks(selectedDate,snapshot.plan);
    return snapshot;
  }

  saveSettings(input:SaveSettingsInput,now:Date):PlannerDay {
    object(input);date(input.viewDate);
    if(!Number.isInteger(input.startMinute) || !Number.isInteger(input.endMinute) || input.startMinute<0 || input.startMinute>=1440 || input.endMinute<=input.startMinute || input.endMinute>1440)throw new PlannerInputError('Choose daily hours with an end after the start, within the same day.');
    if(typeof input.timeZone!=='string' || input.timeZone.length>128)throw new PlannerInputError('Choose a valid IANA time zone.');
    try {new Intl.DateTimeFormat('en',{timeZone:input.timeZone}).format(now);}catch{throw new PlannerInputError('Choose a valid IANA time zone.');}
    return this.connection.transaction(()=>{
      if(input.timeZone!==this.database.getStatus().dailyHours.timeZone)this.focusStore.pause(now,'paused');
      this.connection.prepare('UPDATE planner_settings SET day_start_minute=?,day_end_minute=?,time_zone=? WHERE id=1').run(input.startMinute,input.endMinute,input.timeZone);
      const next=new PlannerRepository(this.database);
      const dates=this.connection.prepare('SELECT DISTINCT planned_date AS date FROM tasks WHERE planned_date IS NOT NULL AND deleted_at IS NULL').all() as {date:string}[];
      for(const {date} of dates)next.writeBlocks(date,next.getDay(date,now,false).plan);
      return next.getDay(input.viewDate,now);
    }).immediate();
  }

  saveTask(input: SaveTaskInput, now: Date): PlannerDay {
    object(input); if (input.plannedDate !== null) date(input.plannedDate); date(input.viewDate);
    if (input.deadline !== undefined && input.deadline !== null) date(input.deadline);
    if (input.projectId !== undefined && input.projectId !== null) id(input.projectId);
    if (input.id !== undefined) id(input.id);
    if(input.create!==undefined && typeof input.create!=='boolean')throw new PlannerInputError('Invalid creation request.');
    if(input.create && !input.id)throw new PlannerInputError('A creation ID is required.');
    if(input.recurrence !== undefined)this.recurrenceStore.validate(input.recurrence,input.plannedDate);
    if(input.stopRepeats !== undefined && typeof input.stopRepeats !== 'boolean')throw new PlannerInputError('Invalid repeat change.');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) throw new PlannerInputError('Enter a task title of 1–200 characters.');
    if (typeof input.notes !== 'string' || input.notes.length > 20000) throw new PlannerInputError('Task notes must be at most 20,000 characters.');
    if (!Number.isSafeInteger(input.plannedMinutes) || input.plannedMinutes <= 0) throw new PlannerInputError('Enter a positive estimate in whole minutes.');
    return this.connection.transaction(() => {
      const old=input.id?(input.create?this.connection.prepare('SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL').get(input.id) as TaskRow|undefined:this.find(input.id)):undefined;
      const taskId=old?.id??input.id??randomUUID();
      const timestamp = now.toISOString();
      const projectId = input.projectId === undefined ? old?.project_id ?? null : input.projectId;
      const deadline = input.deadline === undefined ? old?.deadline ?? null : input.deadline;
      if (projectId && !this.connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) throw new PlannerInputError('Choose an existing project.');
      if (old) {
        if(old.planned_date!==input.plannedDate)this.focusStore.clearTask(old.id,now);
        this.connection.prepare('UPDATE tasks SET title = ?, notes = ?, planned_date = ?, planned_minutes = ?, position = ?, updated_at = ?, project_id = ?, deadline = ? WHERE id = ?')
          .run(input.title.trim(), input.notes, input.plannedDate, input.plannedMinutes,
            old.planned_date === input.plannedDate ? old.position : this.nextPosition(input.plannedDate), timestamp, projectId, deadline, old.id);
        if (old.planned_date !== input.plannedDate) {
          // History stays on its original date; only flexible blocks move.
          this.connection.prepare("DELETE FROM calendar_blocks WHERE task_id = ? AND kind = 'scheduled'").run(old.id);
          if (old.planned_date) this.persistSchedule(old.planned_date, now);
        }
      } else {
        this.connection.prepare('INSERT INTO tasks (id, title, notes, planned_date, planned_minutes, position, created_at, updated_at, project_id, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(taskId, input.title.trim(), input.notes, input.plannedDate, input.plannedMinutes, this.nextPosition(input.plannedDate), timestamp, timestamp, projectId, deadline);
      }
      if(input.recurrence !== undefined && !(input.create && old?.recurrence_id))this.recurrenceStore.attach(taskId,input.recurrence.weekdays,now);
      if(input.stopRepeats && old?.recurrence_id)for(const affected of this.recurrenceStore.stop(old.recurrence_id,localClock(now,this.database.getStatus().dailyHours.timeZone).date,now))this.persistSchedule(affected,now);
      if (input.plannedDate) this.persistSchedule(input.plannedDate, now);
      return input.viewDate === input.plannedDate ? this.getDay(input.viewDate, now) : this.persistSchedule(input.viewDate, now);
    }).immediate();
  }

  setTaskCompleted(input: CompleteTaskInput, now: Date): PlannerDay {
    action(input);
    if (typeof input.completed !== 'boolean') throw new PlannerInputError('Task completion must be true or false.');
    return this.connection.transaction(() => {
      const task = this.find(input.id);
      const clock = localClock(now, this.database.getStatus().dailyHours.timeZone);
      if(input.completed)this.focusStore.clearTask(task.id,now);
      if (input.completed && !task.completed && !this.focusStore.hasTime(task.id)) this.retainCompletedHistory(task.id, clock);
      if (!input.completed) this.connection.prepare("DELETE FROM calendar_blocks WHERE task_id = ? AND kind = 'completed'").run(task.id);
      this.connection.prepare('UPDATE tasks SET completed = ?, completed_at = ?, updated_at = ? WHERE id = ?')
        .run(input.completed ? 1 : 0, input.completed ? task.completed_at ?? now.toISOString() : null, now.toISOString(), task.id);
      if (task.planned_date) this.persistSchedule(task.planned_date, now);
      return this.getDay(input.viewDate, now);
    }).immediate();
  }

  private retainCompletedHistory(taskId: string, clock: LocalDateTime): void {
    const blocks = this.connection.prepare("SELECT id, date, start_minute AS startMinute, end_minute AS endMinute FROM calendar_blocks WHERE task_id = ? AND kind = 'scheduled'")
      .all(taskId) as { id: string; date: string; startMinute: number; endMinute: number }[];
    const insert = this.connection.prepare("INSERT INTO calendar_blocks (id, task_id, date, start_minute, end_minute, kind) VALUES (?, ?, ?, ?, ?, 'completed')");
    for (const block of blocks) {
      const limit = block.date < clock.date ? 1440 : block.date === clock.date ? clock.minute : 0;
      const end = Math.min(block.endMinute, limit);
      if (end > block.startMinute) insert.run(`completed:${block.id}`, taskId, block.date, block.startMinute, end);
    }
  }

  deleteTask(input: TaskActionInput, now: Date): PlannerDay {
    action(input);
    return this.connection.transaction(() => {
      const task = this.find(input.id);
      this.focusStore.clearTask(task.id,now);
      this.connection.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now.toISOString(), now.toISOString(), task.id);
      if (task.planned_date) this.persistSchedule(task.planned_date, now);
      return this.getDay(input.viewDate, now);
    }).immediate();
  }

  restoreTask(input: TaskActionInput, now: Date): PlannerDay {
    action(input);
    return this.connection.transaction(() => {
      const task = this.find(input.id, true);
      const occupied = this.connection.prepare('SELECT 1 FROM tasks WHERE planned_date IS ? AND position = ? AND deleted_at IS NULL LIMIT 1').get(task.planned_date, task.position);
      if (occupied) {
        this.connection.prepare('UPDATE tasks SET position = position + 1 WHERE planned_date IS ? AND position >= ? AND deleted_at IS NULL').run(task.planned_date, task.position);
      }
      this.connection.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now.toISOString(), task.id);
      if (task.planned_date) this.persistSchedule(task.planned_date, now);
      return this.getDay(input.viewDate, now);
    }).immediate();
  }

  reorderTasks(input: ReorderTasksInput, now: Date): PlannerDay {
    object(input); date(input.date);
    if (!Array.isArray(input.taskIds) || !input.taskIds.every((value) => typeof value === 'string')) throw new PlannerInputError('A complete task order is required.');
    return this.connection.transaction(() => {
      const tasks = this.tasks().filter((task) => task.plannedDate === input.date);
      const expected = new Set(tasks.map((task) => task.id));
      if (input.taskIds.length !== tasks.length || new Set(input.taskIds).size !== tasks.length || input.taskIds.some((id) => !expected.has(id))) {
        throw new PlannerInputError('The task list changed. Refresh the day before reordering.');
      }
      const update = this.connection.prepare('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?');
      for (const [position, taskId] of input.taskIds.entries()) update.run(position, now.toISOString(), taskId);
      return this.persistSchedule(input.date, now);
    }).immediate();
  }

  /** One atomic drop: date, insertion order, timer state and both schedules commit together. */
  moveTask(input: MoveTaskInput, now: Date): PlannerDay {
    action(input);
    if(input.plannedDate!==null)date(input.plannedDate);
    if(input.beforeTaskId!==null)id(input.beforeTaskId);
    if(input.beforeTaskId===input.id)throw new PlannerInputError('Choose a different task as the insertion target.');
    return this.connection.transaction(()=>{
      const task=this.find(input.id);
      const target=input.beforeTaskId===null?undefined:this.find(input.beforeTaskId);
      if(target && target.planned_date!==input.plannedDate)throw new PlannerInputError('The target day changed. Refresh the board and try again.');
      // Completed rows stay after incomplete rows. An incomplete drop before the first
      // completed row means append to the incomplete group; the inverse is ambiguous.
      if(target && task.completed && !target.completed)throw new PlannerInputError('Keep completed tasks after incomplete tasks.');
      const changedDate=task.planned_date!==input.plannedDate;
      if(changedDate) {
        this.focusStore.clearTask(task.id,now);
        this.connection.prepare('UPDATE tasks SET planned_date=?,updated_at=? WHERE id=?').run(input.plannedDate,now.toISOString(),task.id);
        this.connection.prepare("DELETE FROM calendar_blocks WHERE task_id=? AND kind='scheduled'").run(task.id);
      }
      const destination=this.tasks().filter((row)=>row.plannedDate===input.plannedDate && row.id!==task.id);
      const group=destination.filter((row)=>row.completed===Boolean(task.completed));
      const others=destination.filter((row)=>row.completed!==Boolean(task.completed));
      const before=target && target.completed===task.completed?group.findIndex((row)=>row.id===target.id):group.length;
      if(before<0)throw new PlannerInputError('The target task changed. Refresh the board and try again.');
      group.splice(before,0,toTask(this.find(task.id)));
      const ordered=task.completed?[...others,...group]:[...group,...others];
      const update=this.connection.prepare('UPDATE tasks SET position=?,updated_at=? WHERE id=?');
      for(const [position,row] of ordered.entries())update.run(position,now.toISOString(),row.id);
      if(changedDate && task.planned_date!==null)this.persistSchedule(task.planned_date,now);
      if(input.plannedDate!==null)this.persistSchedule(input.plannedDate,now);
      return this.getDay(input.viewDate,now);
    }).immediate();
  }

  startFocus(input: TaskActionInput,now:Date):PlannerDay {
    action(input);
    return this.connection.transaction(()=>{this.focusStore.start(input.id,now);return this.persistSchedule(input.viewDate,now);}).immediate();
  }
  pauseFocus(input: TaskActionInput,now:Date):PlannerDay {
    action(input);
    return this.connection.transaction(()=>{
      if(this.focusStore.snapshot(now,input.viewDate).focus?.taskId!==input.id)throw new PlannerInputError('The focused task has changed. Refresh and try again.');
      this.focusStore.pause(now,'paused');return this.persistSchedule(input.viewDate,now);
    }).immediate();
  }

  saveProject(input: SaveProjectInput, now: Date): PlannerDay {
    object(input); date(input.viewDate);
    if (input.id !== undefined) id(input.id);
    if(input.create!==undefined && typeof input.create!=='boolean')throw new PlannerInputError('Invalid creation request.');
    if(input.create && !input.id)throw new PlannerInputError('A creation ID is required.');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) throw new PlannerInputError('Enter a project title of 1–200 characters.');
    if (typeof input.notes !== 'string' || input.notes.length > 20000) throw new PlannerInputError('Project notes must be at most 20,000 characters.');
    if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new PlannerInputError('Choose a valid project color.');
    if (input.deadline !== null) date(input.deadline);
    return this.connection.transaction(() => {
      const timestamp = now.toISOString();
      if (input.id && (!input.create || this.connection.prepare('SELECT 1 FROM projects WHERE id=?').get(input.id))) {
        if (!this.connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(input.id)) throw new PlannerInputError('This project is no longer available.', 'NOT_FOUND');
        this.connection.prepare('UPDATE projects SET title=?,color=?,notes=?,deadline=?,updated_at=? WHERE id=?')
          .run(input.title.trim(), input.color, input.notes, input.deadline, timestamp, input.id);
      } else this.connection.prepare('INSERT INTO projects (id,title,color,notes,deadline,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(input.id??randomUUID(), input.title.trim(), input.color, input.notes, input.deadline, timestamp, timestamp);
      return this.getDay(input.viewDate, now);
    }).immediate();
  }

  saveEvent(input: SaveEventInput, now: Date): PlannerDay {
    object(input); date(input.viewDate);
    if (input.id !== undefined) id(input.id);
    if(input.create!==undefined && typeof input.create!=='boolean')throw new PlannerInputError('Invalid creation request.');
    if(input.create && !input.id)throw new PlannerInputError('A creation ID is required.');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) throw new PlannerInputError('Enter an event title of 1–200 characters.');
    if (typeof input.notes !== 'string' || input.notes.length > 20000) throw new PlannerInputError('Event notes must be at most 20,000 characters.');
    for (const point of [input.start, input.end]) {
      object(point); date(point.date);
      if (!Number.isInteger(point.minute) || point.minute < 0 || point.minute >= 1440) throw new PlannerInputError('Choose a valid event time.');
    }
    if (minuteRelativeTo(input.end, dayNumber(input.start.date)) <= input.start.minute) throw new PlannerInputError('The event must end after it starts.');
    return this.connection.transaction(() => {
      const old = input.id ? this.events().find((event) => event.id === input.id) : undefined;
      if (input.id && !old && !input.create) throw new PlannerInputError('This event is no longer available.', 'NOT_FOUND');
      const timestamp = now.toISOString();
      if (old) this.connection.prepare('UPDATE fixed_events SET title=?,notes=?,start_date=?,start_minute=?,end_date=?,end_minute=?,updated_at=? WHERE id=?')
        .run(input.title.trim(), input.notes, input.start.date, input.start.minute, input.end.date, input.end.minute, timestamp, old.id);
      else this.connection.prepare('INSERT INTO fixed_events (id,title,notes,start_date,start_minute,end_date,end_minute,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(input.id??randomUUID(), input.title.trim(), input.notes, input.start.date, input.start.minute, input.end.date, input.end.minute, timestamp, timestamp);
      this.replanEventDates([...(old ? [old] : []), input], now);
      return this.getDay(input.viewDate, now);
    }).immediate();
  }

  deleteEvent(input: TaskActionInput, now: Date): PlannerDay {
    action(input);
    return this.connection.transaction(() => {
      const event = this.events().find((event) => event.id === input.id);
      if (!event) throw new PlannerInputError('This event is no longer available.', 'NOT_FOUND');
      this.connection.prepare('UPDATE fixed_events SET deleted_at=?,updated_at=? WHERE id=?').run(now.toISOString(), now.toISOString(), event.id);
      this.replanEventDates([event], now);
      return this.getDay(input.viewDate, now);
    }).immediate();
  }

  private replanEventDates(events: readonly { start: LocalDateTime; end: LocalDateTime }[], now: Date): void {
    const dates = this.connection.prepare('SELECT DISTINCT planned_date AS date FROM tasks WHERE planned_date IS NOT NULL AND deleted_at IS NULL').all() as { date: string }[];
    for (const { date } of dates) {
      if (events.some((event) => date >= event.start.date && date <= event.end.date)) this.persistSchedule(date, now);
    }
  }
}
