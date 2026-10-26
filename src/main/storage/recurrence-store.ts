import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { RecurringTemplate } from '../../shared/contracts';
import { dayNumber } from '../../scheduler/time';
import { PlannerInputError, object } from './input';

export class RecurrenceStore {
  constructor(private readonly connection: Database.Database) {}
  validate(value: unknown, plannedDate: string | null) {
    object(value);
    if (!plannedDate) throw new PlannerInputError('Choose a day before repeating this task.');
    if (!Array.isArray(value.weekdays) || !value.weekdays.length || value.weekdays.length > 7 ||
      value.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(value.weekdays).size !== value.weekdays.length) {
      throw new PlannerInputError('Choose at least one distinct weekday for this repeat.');
    }
    if (!value.weekdays.includes((dayNumber(plannedDate) + 1) % 7)) throw new PlannerInputError('The first day must match one of the selected weekdays.');
  }
  list(): RecurringTemplate[] {
    const rows = this.connection.prepare('SELECT id,title,weekdays,start_date AS startDate,stopped_on AS stoppedOn FROM recurring_templates ORDER BY created_at,id').all() as (Omit<RecurringTemplate,'weekdays'> & {weekdays:string})[];
    return rows.map((row) => ({...row,weekdays:JSON.parse(row.weekdays) as number[]}));
  }
  attach(taskId: string, weekdays: number[], now: Date) {
    const task = this.connection.prepare('SELECT title,notes,planned_minutes,project_id,planned_date,recurrence_id FROM tasks WHERE id=?').get(taskId) as {
      title:string;notes:string;planned_minutes:number;project_id:string|null;planned_date:string;recurrence_id:string|null;
    };
    if(task.recurrence_id) throw new PlannerInputError('This task already belongs to a repeat. Edit this occurrence or stop its future repeats.');
    const id=randomUUID();
    this.connection.prepare('INSERT INTO recurring_templates (id,title,notes,planned_minutes,project_id,weekdays,start_date,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id,task.title,task.notes,task.planned_minutes,task.project_id,JSON.stringify([...weekdays].sort()),task.planned_date,now.toISOString());
    this.connection.prepare('UPDATE tasks SET recurrence_id=?,occurrence_date=? WHERE id=?').run(id,task.planned_date,taskId);
  }
  stop(recurrenceId: string, today: string, now: Date) {
    const affected=(this.connection.prepare('SELECT DISTINCT planned_date AS date FROM tasks WHERE recurrence_id=? AND planned_date IS NOT NULL').all(recurrenceId) as {date:string}[]).map((row)=>row.date);
    this.connection.prepare('UPDATE recurring_templates SET stopped_on=COALESCE(stopped_on,?) WHERE id=?').run(today,recurrenceId);
    // Keep worked/completed/moved occurrences. Reserve the identities of removed future instances.
    this.connection.prepare(`UPDATE tasks SET deleted_at=?,updated_at=? WHERE recurrence_id=? AND occurrence_date>? AND planned_date=occurrence_date AND completed=0 AND deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM focus_sessions WHERE task_id=tasks.id)`)
      .run(now.toISOString(),now.toISOString(),recurrenceId,today);
    this.connection.prepare("DELETE FROM calendar_blocks WHERE kind='scheduled' AND task_id IN (SELECT id FROM tasks WHERE recurrence_id=? AND deleted_at IS NOT NULL)").run(recurrenceId);
    return affected;
  }
  ensure(dates: readonly string[], now: Date): string[] {
    const templates=this.connection.prepare('SELECT * FROM recurring_templates').all() as {
      id:string;title:string;notes:string;planned_minutes:number;project_id:string|null;weekdays:string;start_date:string;stopped_on:string|null;
    }[];
    const insert=this.connection.prepare(`INSERT INTO tasks (id,title,notes,planned_date,planned_minutes,position,created_at,updated_at,project_id,recurrence_id,occurrence_date)
      VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM tasks WHERE planned_date=? AND deleted_at IS NULL),?,?,?,?,?) ON CONFLICT (recurrence_id,occurrence_date) WHERE recurrence_id IS NOT NULL DO NOTHING`);
    const changed=new Set<string>();
    for(const template of templates) {
      const weekdays=JSON.parse(template.weekdays) as number[];
      for(const date of new Set(dates)) {
        if(date<template.start_date || (template.stopped_on && date>template.stopped_on) || !weekdays.includes((dayNumber(date)+1)%7))continue;
        const result=insert.run(randomUUID(),template.title,template.notes,date,template.planned_minutes,date,now.toISOString(),now.toISOString(),template.project_id,template.id,date);
        if(result.changes) changed.add(date);
      }
    }
    return [...changed];
  }
}
