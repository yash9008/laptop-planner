import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type CSSProperties } from 'react';
import type { PlannerDay, PlannerTask, PlannerEvent } from '../../shared/contracts';
import { dayNumber, minuteRelativeTo } from '../../scheduler/time';
import { dateLabel, formatDuration, formatTime, shiftLocalTime } from '../../shared/task-input';
import { Icon } from './Icon';

const BASE_HOUR_HEIGHT = 48;

export function DayCalendar({ day, busy, onEdit, onAddEvent, onEditEvent, onChangeEvent }: {
  day: PlannerDay; busy: boolean; onEdit(task: PlannerTask): void;
  onAddEvent(minute?: number): void; onEditEvent(event: PlannerEvent): void;
  onChangeEvent(event: PlannerEvent): Promise<string | null>;
}) {
  const [zoom,setZoom]=useState(1);
  const HOUR_HEIGHT=BASE_HOUR_HEIGHT*zoom;
  const scale=HOUR_HEIGHT/60;
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ event: PlannerEvent; mode: 'move' | 'resize'; y: number; delta: number } | null>(null);
  const [preview, setPreview] = useState<PlannerEvent | null>(null);
  const tasks = new Map(day.allTasks.map((task) => [task.id, task]));
  const blocks = [...day.plan.scheduledBlocks.map((block) => ({ ...block, completed: false, recorded: false })), ...day.plan.completedBlocks.map((block) => ({ ...block, completed: true, recorded: false })), ...day.plan.recordedBlocks.map((block)=>({...block,completed:false,recorded:true}))];
  useEffect(() => {
    const target = day.date === day.today ? Math.max(day.dailyHours.startMinute, Math.min(day.clock.minute, day.dailyHours.endMinute - 60)) : day.dailyHours.startMinute;
    if (scroll.current) scroll.current.scrollTop = Math.max(0, (target - 40) * scale);
  }, [day.date,zoom]);

  function shifted(event: PlannerEvent, mode: 'move' | 'resize', requested: number): PlannerEvent {
    const origin = dayNumber(day.date);
    const start = minuteRelativeTo(event.start, origin); const end = minuteRelativeTo(event.end, origin);
    const delta = mode === 'move' ? Math.max(-Math.max(0, start), Math.min(requested, 1440 - Math.min(1440, end))) : Math.max(requested, start + 1 - end);
    return { ...event, start: mode === 'move' ? shiftLocalTime(event.start, delta) : { ...event.start }, end: shiftLocalTime(event.end, delta) };
  }
  function begin(e: PointerEvent<HTMLButtonElement>, event: PlannerEvent, mode: 'move' | 'resize') {
    if (busy || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { event, mode, y: e.clientY, delta: 0 };
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current) return;
    current.delta = Math.round((e.clientY - current.y) / scale / 15) * 15;
    setPreview(shifted(current.event, current.mode, current.delta));
  }
  function end(e: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current) return;
    drag.current = null; setPreview(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (current.delta !== 0) void onChangeEvent(shifted(current.event, current.mode, current.delta));
  }
  function keyboard(e: KeyboardEvent<HTMLButtonElement>, event: PlannerEvent, mode: 'move' | 'resize') {
    if (busy || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); void onChangeEvent(shifted(event, mode, e.key === 'ArrowUp' ? -15 : 15));
  }
  const cancelDrag = () => { drag.current = null; setPreview(null); };

  const visualEvents = day.plan.events.map((entry) => {
    const source = preview?.id === entry.id ? preview : day.events.find((event) => event.id === entry.id)!;
    return { ...entry, startMinute: Math.max(0, minuteRelativeTo(source.start, dayNumber(day.date))), endMinute: Math.min(1440, minuteRelativeTo(source.end, dayNumber(day.date))), lane: 0, lanes: 1 };
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  // Allocate side-by-side lanes to each connected group of overlapping events.
  let group: typeof visualEvents = []; let groupEnd = -1; let laneEnds: number[] = [];
  const finishGroup = () => { for (const entry of group) entry.lanes = laneEnds.length; group = []; laneEnds = []; };
  for (const entry of visualEvents) {
    if (entry.startMinute >= groupEnd) finishGroup();
    let lane = laneEnds.findIndex((end) => end <= entry.startMinute);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = entry.endMinute; entry.lane = lane; group.push(entry); groupEnd = Math.max(group.length === 1 ? -1 : groupEnd, entry.endMinute);
  }
  finishGroup();
  return <aside className="calendar-panel" aria-label="Day calendar">
    <div className="calendar-heading">
      <div className="calendar-zoom"><button className="icon-button" aria-label="Zoom calendar in" title="Zoom in" disabled={zoom>=2} onClick={()=>setZoom(Math.min(2,zoom+.25))}><Icon name="plus" size={13}/></button><span>{zoom}x</span><button className="icon-button" aria-label="Zoom calendar out" title="Zoom out" disabled={zoom<=.5} onClick={()=>setZoom(Math.max(.5,zoom-.25))}><span aria-hidden="true">−</span></button></div>
      <div className="calendar-date"><span className="calendar-weekday">{dateLabel(day.date,{weekday:'short'})}</span><span className="calendar-day-number">{dateLabel(day.date, { day: '2-digit' })}</span></div>
      <button className="icon-button" aria-label="Add fixed event" title="Add fixed event" onClick={() => onAddEvent()} disabled={busy}><Icon name="plus" size={17} /></button>
    </div>
    {day.plan.eventConflicts.length > 0 && <div className="event-conflict" role="status">Fixed events overlap. Check their times.</div>}
    <div className="calendar-scroll" ref={scroll} data-testid="calendar-scroll"><div className="calendar-canvas" style={{ height: 24 * HOUR_HEIGHT }} onDoubleClick={(e) => {
      if ((e.target as Element).closest('button') || busy) return;
      const minute = Math.max(0, Math.min(1425, Math.round((e.clientY - e.currentTarget.getBoundingClientRect().top) / scale / 15) * 15));
      onAddEvent(minute);
    }}>
      <div className="off-hours" style={{ top: 0, height: day.dailyHours.startMinute * scale }} /><div className="off-hours" style={{ top: day.dailyHours.endMinute * scale, bottom: 0 }} />
      {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="calendar-hour" style={{ top: hour * HOUR_HEIGHT }}><span>{hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : `${hour % 12} ${hour < 12 ? 'AM' : 'PM'}`}</span><i /></div>)}
      {blocks.map((block) => {
        const task = tasks.get(block.taskId); const project = day.projects.find((project) => project.id === task?.projectId);
        const title = task?.title ?? day.calendarTitles[block.taskId] ?? 'Completed task';
        return <button key={block.id} className={`calendar-block ${block.completed ? 'is-completed' : ''} ${block.recorded?'is-recorded':''} ${block.endMinute - block.startMinute < 35 ? 'is-short' : ''}`}
          style={{ top: block.startMinute * scale, height: (block.endMinute - block.startMinute) * scale, '--block-color': project?.color ?? '#c9a15e' } as CSSProperties} data-testid={block.recorded?'recorded-block':'calendar-block'} data-task-id={block.taskId} data-completed={block.completed}
          aria-label={`${title}, ${formatTime(block.startMinute)} to ${formatTime(block.endMinute)}${block.recorded?', actual focus time':block.completed ? ', completed' : ''}`}
          title={`${title} · ${formatTime(block.startMinute)} – ${formatTime(block.endMinute)} · ${formatDuration(block.endMinute - block.startMinute)}`}
          onClick={() => { if (task) onEdit(task); }} disabled={!task || busy}><strong>{block.completed && <Icon name="check" size={12} />}{title}</strong><span>{formatTime(block.startMinute)} – {formatTime(block.endMinute)}</span></button>;
      })}
      {visualEvents.map((entry) => {
        const event = day.events.find((event) => event.id === entry.id)!;
        const conflict = day.plan.eventConflicts.some((item) => item.eventIds.includes(entry.id));
        const gesture = { onPointerMove: move, onPointerUp: end, onPointerCancel: cancelDrag, disabled: busy };
        return <div key={entry.id} className={`fixed-event ${conflict ? 'has-conflict' : ''} ${entry.endMinute - entry.startMinute < 35 ? 'is-short' : ''}`} data-testid="fixed-event" data-event-id={entry.id}
          title={`${event.title} · ${event.start.date} ${formatTime(event.start.minute)} – ${event.end.date} ${formatTime(event.end.minute)}`}
          style={{ top: entry.startMinute * scale, height: (entry.endMinute - entry.startMinute) * scale, left: `calc(47px + (100% - 49px) * ${entry.lane / entry.lanes})`, width: `calc((100% - 49px) / ${entry.lanes} - 2px)` }}>
          <button className="event-drag" aria-label={`Move event ${event.title}`} title="Drag to move · arrow keys move 15 minutes" onPointerDown={(e) => begin(e, event, 'move')} onKeyDown={(e) => keyboard(e, event, 'move')} {...gesture}><i /><i /><i /></button>
          <button className="event-content" aria-label={`Edit event ${event.title}`} onClick={() => onEditEvent(event)} disabled={busy}><strong>{event.title}</strong><span>{formatTime(entry.startMinute)} – {formatTime(entry.endMinute)}</span></button>
          {minuteRelativeTo(event.end, dayNumber(day.date)) <= 1440 && <button className="event-resize" aria-label={`Resize event ${event.title}`} title="Drag to resize · arrow keys change 15 minutes" onPointerDown={(e) => begin(e, event, 'resize')} onKeyDown={(e) => keyboard(e, event, 'resize')} {...gesture}><i /></button>}
        </div>;
      })}
      {day.date === day.today && <div className="now-line" style={{ top: day.clock.minute * scale }}><span>{formatTime(day.clock.minute)}</span><i /></div>}
    </div></div>
    <div className="calendar-footer"><span className="legend-dot" />Task<span className="legend-dot event-legend" />Fixed event<span className="legend-dot actual-legend" />Actual<span className="calendar-hours">{formatTime(day.dailyHours.startMinute)}–{formatTime(day.dailyHours.endMinute)}</span></div>
  </aside>;
}
