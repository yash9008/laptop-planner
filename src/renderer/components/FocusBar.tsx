import type { PlannerDay } from '../../shared/contracts';
import { dateLabel, formatElapsed, formatDuration } from '../../shared/task-input';
import { Icon } from './Icon';

export function FocusBar({day,busy,onStart,onPause,onComplete}:{day:PlannerDay;busy:boolean;onStart(id:string):void;onPause(id:string):void;onComplete(id:string):void}) {
  const focus=day.focus;const task=day.allTasks.find((task)=>task.id===focus?.taskId);
  if(!focus || !task)return null;
  const overrun=focus.actualMilliseconds>task.plannedMinutes*60000;
  const notices={sleep:'Paused for sleep. Resume when you’re ready.',quit:'Paused when you quit. Time while closed was not counted.',interrupted:'Interrupted session recovered. Only saved focus time was kept.',paused:'Paused. Resume when you’re ready.'};
  return <section className={`focus-bar ${focus.running?'is-running':''}`} aria-label="Focus timer" data-reason={focus.reason ?? 'running'}>
    <Icon name={focus.running?'play':'pause'} size={18}/><div className="focus-task"><span>{focus.running?'FOCUSING':'FOCUS PAUSED'}{task.plannedDate!==day.today && task.plannedDate?` · ${dateLabel(task.plannedDate,{month:'short',day:'numeric'})}`:''}</span><strong>{task.title}</strong>{!focus.running && focus.reason && <small role="status">{notices[focus.reason]}</small>}</div>
    <div className="focus-time"><strong data-testid="focus-elapsed">{formatElapsed(focus.actualMilliseconds)}</strong><span>{formatDuration(task.plannedMinutes)} planned{overrun?' · over estimate':''}</span></div>
    <div className="focus-actions">{focus.running?<button className="button secondary" onClick={()=>onPause(task.id)} disabled={busy}><Icon name="pause" size={13}/>Pause focus</button>:<button className="button primary" onClick={()=>onStart(task.id)} disabled={busy}><Icon name="play" size={13}/>Resume focus</button>}<button className="button secondary" onClick={()=>onComplete(task.id)} disabled={busy}><Icon name="check" size={13}/>Complete task</button></div>
  </section>;
}
