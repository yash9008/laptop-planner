import { useEffect,useLayoutEffect,useRef,useState,type ReactNode,type DragEvent,type PointerEvent as ReactPointerEvent } from 'react';
import type { MoveTaskInput,PlannerDay,PlannerTask } from '../../shared/contracts';
import { dateLabel,formatDuration } from '../../shared/task-input';
import { Icon } from './Icon';
import { useBoardDrag } from './BoardDrag';

export function PlanningBoard({active=true,panelRef: externalPanelRef,dnd: externalDnd,day,selectedDate,busy,navigationKey,onMove,onAdd,onOpenDay,onActiveDay,renderTask,matches}:{
  active?: boolean;
  panelRef?: React.RefObject<HTMLElement | null>;
  dnd?: ReturnType<typeof useBoardDrag>;
  day:PlannerDay;selectedDate:string;busy:boolean;navigationKey:number;onMove(input:MoveTaskInput):Promise<string|null>;onAdd(date:string|null):void;
  onOpenDay(date:string):void;onActiveDay(date:string):void;renderTask(task:PlannerTask,index:number):ReactNode;matches(task:PlannerTask):boolean;
}) {
  const internalPanel=useRef<HTMLElement>(null);
  const panel = externalPanelRef ?? internalPanel;
  const internalDnd=useBoardDrag({panel,tasks:day.allTasks,busy,viewDate:day.date,onMove});
  const dnd = externalDnd ?? internalDnd;
  const animation=useRef<number|null>(null);const velocity=useRef(0);
  const scrollFrame=useRef<number|null>(null);
  const activeDate=useRef('');
  const activeRef=useRef(active);activeRef.current=active;
  const activeCallback=useRef(onActiveDay);activeCallback.current=onActiveDay;
  const pan=useRef<{pointerId:number;button:number;x:number;scroll:number;active:boolean}|null>(null);
  const [panning,setPanning]=useState(false);
  const swallowClick=useRef(false);
  const stopScroll=()=>{velocity.current=0;if(animation.current!==null)cancelAnimationFrame(animation.current);animation.current=null;};
  function selectNearestDay() {
    if(!activeRef.current)return;
    const host=panel.current;if(!host)return;
    const edge=host.getBoundingClientRect().left+(parseFloat(getComputedStyle(host).paddingLeft)||0);
    const columns=[...host.querySelectorAll<HTMLElement>('[data-testid="board-day"]')];
    let nearest:HTMLElement|undefined;let distance=Infinity;
    for(const column of columns){const current=Math.abs(column.getBoundingClientRect().left-edge);if(current<distance){nearest=column;distance=current;}}
    const date=nearest?.dataset.date;
    if(date && date!==activeDate.current){activeDate.current=date;activeCallback.current(date);}
  }
  function queueSelection() {
    if(!activeRef.current)return;
    if(scrollFrame.current!==null)return;
    scrollFrame.current=requestAnimationFrame(()=>{scrollFrame.current=null;selectNearestDay();});
  }
  useLayoutEffect(()=>{if(panel.current)panel.current.scrollLeft=0;activeDate.current='';queueSelection();},[day.board[0]?.date,navigationKey]);
  useLayoutEffect(()=>{if(active)queueSelection();},[active]);
  useEffect(()=>{
    const observer=new ResizeObserver(queueSelection);if(panel.current)observer.observe(panel.current);
    return()=>{observer.disconnect();stopScroll();if(scrollFrame.current!==null)cancelAnimationFrame(scrollFrame.current);};
  },[]);
  const autoScroll=(host:HTMLElement,amount:number)=>{
    velocity.current=amount;
    if(!amount){stopScroll();return;}
    if(animation.current!==null)return;
    const step=()=>{host.scrollLeft+=velocity.current;dnd.rescan();animation.current=requestAnimationFrame(step);};
    animation.current=requestAnimationFrame(step);
  };
  const edgeScroll=(event:DragEvent<HTMLElement>)=>{
    dnd.handlers.onDragOver(event);
    if(busy || !event.dataTransfer.types.includes('text/plain'))return;
    const host=event.currentTarget;const bounds=host.getBoundingClientRect();
    autoScroll(host,event.clientX>bounds.right-48?16:event.clientX<bounds.left+48?-16:0);
  };
  function beginPan(event:ReactPointerEvent<HTMLElement>) {
    dnd.handlers.onPointerDownCapture(event);
    if(busy || dnd.drag || ![0,2].includes(event.button))return;
    const target=event.target as Element;
    if(target.closest('input,textarea,select,a') || (event.button===0 && target.closest('button,.task-card')))return;
    if(event.button===2)event.preventDefault();
    pan.current={pointerId:event.pointerId,button:event.button,x:event.clientX,scroll:event.currentTarget.scrollLeft,active:false};
  }
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      const current=pan.current;const host=panel.current;if(!current || !host || current.pointerId!==event.pointerId)return;
      if(!current.active && Math.abs(event.clientX-current.x)<4)return;
      if(!current.active){current.active=true;setPanning(true);host.setPointerCapture(event.pointerId);}
      event.preventDefault();host.scrollLeft=current.scroll-(event.clientX-current.x);
    };
    const finish=(event:PointerEvent)=>{
      const current=pan.current;if(!current || current.pointerId!==event.pointerId)return;
      pan.current=null;setPanning(false);
      if(panel.current?.hasPointerCapture(event.pointerId))panel.current.releasePointerCapture(event.pointerId);
      if(current.active){event.preventDefault();event.stopPropagation();swallowClick.current=true;window.setTimeout(()=>{swallowClick.current=false;},0);}
    };
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape' && pan.current){if(panel.current)panel.current.scrollLeft=pan.current.scroll;pan.current=null;setPanning(false);}};
    window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);window.addEventListener('keydown',cancel,true);
    return()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',finish,true);window.removeEventListener('keydown',cancel,true);};
  },[]);
  return <><section ref={panel} className={`planning-board ${panning?'is-panning':''} ${dnd.drag?'has-card-drag':''}`} aria-label="Multi-day board" tabIndex={0}
    onScroll={queueSelection} onPointerDownCapture={beginPan} onContextMenu={(event)=>event.preventDefault()}
    onClickCapture={(event)=>{if(swallowClick.current){event.preventDefault();event.stopPropagation();}}}
    onKeyDown={(event)=>{if(event.target===event.currentTarget && ['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.currentTarget.scrollBy({left:event.key==='ArrowRight'?272:-272,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}}
    onDragStartCapture={dnd.handlers.onDragStartCapture} onDragEnter={edgeScroll} onDragOver={edgeScroll}
    onDrop={(event)=>{stopScroll();dnd.handlers.onDrop(event);}} onDragEndCapture={()=>{stopScroll();dnd.handlers.onDragEndCapture();}}
    onDragLeave={(event)=>{const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left || event.clientX>=bounds.right || event.clientY<bounds.top || event.clientY>=bounds.bottom)stopScroll();}}>
    {day.board.map((column)=><div key={column.date} className={`board-column ${column.date===day.today?'board-today':''} ${column.date===selectedDate?'board-selected':''}`} data-testid="board-day" data-date={column.date} data-board-date={column.date}>
      <div className="board-column-heading"><button onClick={()=>onOpenDay(column.date)} aria-label={`Open ${column.date}`} aria-current={column.date===day.today?'date':undefined}><strong>{dateLabel(column.date,{weekday:'long'})}</strong><span>{dateLabel(column.date,{month:'long',day:'numeric'})}</span></button>{column.date===day.today && <span className="today-label">Today</span>}</div>
      <div className="completion-track" role="progressbar" aria-label={`${dateLabel(column.date,{weekday:'long'})} progress`} aria-valuemin={0} aria-valuemax={column.tasks.length || 1} aria-valuenow={column.tasks.filter((task)=>task.completed).length} aria-valuetext={`${column.tasks.filter((task)=>task.completed).length} of ${column.tasks.length} done`}><div style={{width:`${column.tasks.length?column.tasks.filter((task)=>task.completed).length/column.tasks.length*100:0}%`}}/></div>
      <button className="task-add-bar" onClick={()=>onAdd(column.date)} aria-label={`Add task for ${column.date}`} disabled={busy}><Icon name="plus" size={18}/><span>Add task</span><strong>{formatDuration(column.plan.summary.remainingWorkMinutes)}</strong></button>
      <div className="board-task-list">{dnd.rows(column.date,renderTask,matches)}</div>
      {column.plan.summary.unscheduledMinutes>0 && <div className="board-capacity overdue">{formatDuration(column.plan.summary.unscheduledMinutes)} won’t fit</div>}
    </div>)}
    <div className="board-column backlog-column" data-testid="board-backlog" data-board-date="backlog"><div className="board-column-heading"><h2>Backlog</h2><p>For another day</p></div><div className="completion-track"/><button className="task-add-bar" onClick={()=>onAdd(null)} disabled={busy}><Icon name="plus" size={18}/><span>Add to backlog</span><strong>{day.backlog.length}</strong></button><div className="board-task-list">{dnd.rows(null,renderTask,matches)}</div></div>
  </section>{dnd.overlay}<div className="sr-only" role="status" aria-live="polite">{dnd.drag?.phase==='dragging'?`Moving ${dnd.drag.task.title}. Drop between tasks, or press Escape to cancel.`:''}</div></>;
}
