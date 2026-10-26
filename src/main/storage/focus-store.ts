import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FocusState } from '../../shared/contracts';
import type { ActiveTimer, TimeEntry } from '../../scheduler';
import { dayNumber } from '../../scheduler/time';
import { localClock } from '../local-clock';
import { PlannerInputError } from './input';

interface Session { id:string;task_id:string;started_at:number;checkpoint_at:number;ended_at:number|null }
type PauseReason=NonNullable<FocusState['reason']>;
const MAX_CHECKPOINT_GAP=15_000;

/** UTC timestamps are authoritative; local intervals are calendar projections only. */
export class FocusStore {
  constructor(private readonly connection: Database.Database, private readonly timeZone:string) {}
  private active(): Session | undefined {return this.connection.prepare('SELECT * FROM focus_sessions WHERE ended_at IS NULL').get() as Session|undefined;}
  private state(): {task_id:string|null;reason:FocusState['reason']} {return this.connection.prepare('SELECT task_id,reason FROM focus_state WHERE id=1').get() as {task_id:string|null;reason:FocusState['reason']};}
  hasTime(taskId:string) {return Boolean(this.connection.prepare('SELECT 1 FROM focus_sessions WHERE task_id=? LIMIT 1').get(taskId));}
  recover() {
    this.connection.transaction(()=>{
      const active=this.active();if(!active)return;
      this.connection.prepare("UPDATE focus_sessions SET ended_at=checkpoint_at,reason='interrupted' WHERE id=?").run(active.id);
      this.connection.prepare("UPDATE focus_state SET task_id=?,reason='interrupted' WHERE id=1").run(active.task_id);
    }).immediate();
  }
  checkpoint(now:Date): boolean {
    const active=this.active();if(!active)return false;
    const at=now.getTime();
    if(at<active.checkpoint_at || at-active.checkpoint_at>MAX_CHECKPOINT_GAP) {
      this.connection.prepare("UPDATE focus_sessions SET ended_at=checkpoint_at,reason='interrupted' WHERE id=?").run(active.id);
      this.connection.prepare("UPDATE focus_state SET reason='interrupted' WHERE id=1").run();
      return true;
    }
    if(at!==active.checkpoint_at)this.connection.prepare('UPDATE focus_sessions SET checkpoint_at=? WHERE id=?').run(at,active.id);
    return false;
  }
  pause(now:Date,reason:PauseReason): boolean {
    const active=this.active();if(!active)return false;
    // Do not invent time when a sleep signal was missed or the system clock jumped.
    const interrupted=now.getTime()<active.checkpoint_at || now.getTime()-active.checkpoint_at>MAX_CHECKPOINT_GAP;
    const at=interrupted?active.checkpoint_at:now.getTime();
    const savedReason=interrupted?'interrupted':reason;
    this.connection.prepare('UPDATE focus_sessions SET ended_at=?,checkpoint_at=?,reason=? WHERE id=?').run(at,at,savedReason,active.id);
    this.connection.prepare('UPDATE focus_state SET reason=? WHERE id=1').run(savedReason);
    return true;
  }
  start(taskId:string,now:Date) {
    const task=this.connection.prepare('SELECT planned_date,completed,deleted_at FROM tasks WHERE id=?').get(taskId) as {planned_date:string|null;completed:number;deleted_at:string|null}|undefined;
    const today=localClock(now,this.timeZone).date;
    if(!task || task.deleted_at || task.completed)throw new PlannerInputError('Choose an incomplete task to focus on.');
    if(!task.planned_date || (task.planned_date!==today && this.state().task_id!==taskId))throw new PlannerInputError('Assign this task to today before starting focus.');
    this.checkpoint(now);
    if(this.active()?.task_id===taskId)return;
    this.pause(now,'paused');
    this.connection.prepare('INSERT INTO focus_sessions (id,task_id,started_at,checkpoint_at) VALUES (?,?,?,?)').run(randomUUID(),taskId,now.getTime(),now.getTime());
    this.connection.prepare('UPDATE focus_state SET task_id=?,reason=NULL WHERE id=1').run(taskId);
  }
  clearTask(taskId:string,now:Date) {
    if(this.state().task_id!==taskId)return;
    this.pause(now,'paused');
    this.connection.prepare('UPDATE focus_state SET task_id=NULL,reason=NULL WHERE id=1').run();
  }
  /** Small read for the native menu bar; no civil-time projections or schedule writes. */
  current(now:Date):FocusState|null {
    const state=this.state();if(!state.task_id)return null;
    const active=this.active();
    const total=this.connection.prepare('SELECT COALESCE(SUM(MAX(0,COALESCE(ended_at,?)-started_at)),0) AS elapsed FROM focus_sessions WHERE task_id=?').get(now.getTime(),state.task_id) as {elapsed:number};
    return {taskId:state.task_id,running:active?.task_id===state.task_id,actualMilliseconds:total.elapsed,sessionStartedAt:active?.task_id===state.task_id?active.started_at:null,reason:state.reason};
  }
  snapshot(now:Date,date:string,dates:readonly string[]=[date]): {focus:FocusState|null;entries:TimeEntry[];activeTimer:ActiveTimer|undefined;actual:Map<string,number>;actualOnDate:number;actualOnDates:Map<string,number>} {
    const sessions=this.connection.prepare('SELECT f.* FROM focus_sessions f JOIN tasks t ON t.id=f.task_id WHERE t.deleted_at IS NULL ORDER BY f.started_at,f.id').all() as Session[];
    const actual=new Map<string,number>(); const entries:TimeEntry[]=[];
    let activeTimer:ActiveTimer|undefined;
    const actualOnDates=new Map([...new Set([date,...dates])].map((date)=>[date,0]));
    for(const session of sessions) {
      const end=session.ended_at??Math.max(session.started_at,now.getTime());
      actual.set(session.task_id,(actual.get(session.task_id)??0)+end-session.started_at);
      if(end>session.started_at) {
        const firstDate=localClock(new Date(session.started_at),this.timeZone).date;
        const lastDate=localClock(new Date(end-1),this.timeZone).date;
        for(const selected of actualOnDates.keys()) {
          if(firstDate<=selected && selected<=lastDate)actualOnDates.set(selected,actualOnDates.get(selected)!+millisecondsOnDate(session.started_at,end,selected,this.timeZone));
        }
      }
      // Civil-time projections can run backwards at a DST transition or after a clock correction.
      // Keep the UTC elapsed value above; only valid visible intervals enter the pure scheduler.
      const clippedEnd=Math.min(end,now.getTime());
      const start=localClock(new Date(session.started_at),this.timeZone);const finish=localClock(new Date(clippedEnd),this.timeZone);
      const civilDuration=(dayNumber(finish.date)-dayNumber(start.date))*1440+finish.minute-start.minute;
      if(civilDuration<=0)continue;
      if(session.ended_at===null)activeTimer={taskId:session.task_id,startedAt:start};
      else entries.push({id:session.id,taskId:session.task_id,start,end:finish});
    }
    const state=this.state();const running=sessions.find((session)=>session.ended_at===null);
    // A just-started timer still gets priority, even before its first elapsed millisecond.
    if(running && !activeTimer)activeTimer={taskId:running.task_id,startedAt:localClock(now,this.timeZone)};
    const focus=state.task_id?{taskId:state.task_id,running:Boolean(running),actualMilliseconds:actual.get(state.task_id)??0,sessionStartedAt:running?.started_at??null,reason:state.reason}:null;
    return {focus,entries,activeTimer,actual,actualOnDate:actualOnDates.get(date)??0,actualOnDates};
  }
}

/** Split real elapsed time at local midnight without assuming every day has 24 hours. */
export function millisecondsOnDate(start:number,end:number,date:string,timeZone:string):number {
  if(end<=start)return 0;
  const at=(instant:number)=>localClock(new Date(instant),timeZone).date;
  if(at(start)>date || at(end-1)<date)return 0;
  function boundary(target:string) {
    let low=start,high=end;
    while(low<high) {const mid=low+Math.floor((high-low)/2);if(at(mid)<target)low=mid+1;else high=mid;}
    return low;
  }
  const from=at(start)===date?start:boundary(date);
  // The first instant whose date is greater than the selected date.
  let low=from,high=end;
  while(low<high) {const mid=low+Math.floor((high-low)/2);if(at(mid)<=date)low=mid+1;else high=mid;}
  return Math.max(0,low-from);
}
