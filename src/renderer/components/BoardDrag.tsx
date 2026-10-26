import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MoveTaskInput, PlannerTask } from '../../shared/contracts';

export interface BoardDropSpot { date: string | null; beforeTaskId: string | null }
interface CardDrag {
  task: PlannerTask; baseline: PlannerTask[]; original: BoardDropSpot; target: BoardDropSpot;
  html: string; width: number; height: number; margin: number; offsetX: number; offsetY: number;
  phase: 'dragging' | 'settling';
}
const grouped=(tasks:PlannerTask[])=>[...tasks.filter((task)=>!task.completed),...tasks.filter((task)=>task.completed)];
function reducedMotion() {return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}

/** Retain the native source node until dragend; only a visual placeholder changes columns. */
export function useBoardDrag({ panel, tasks, busy, viewDate, onMove }:{
  panel:React.RefObject<HTMLElement|null>;tasks:PlannerTask[];busy:boolean;viewDate:string;
  onMove(input:MoveTaskInput):Promise<string|null>;
}) {
  const [drag,setDrag]=useState<CardDrag|null>(null);
  const current=useRef<CardDrag|null>(null);
  const pointer=useRef({x:0,y:0});
  const ghost=useRef<HTMLDivElement>(null);
  const allowed=useRef(true);
  const handled=useRef(false);
  const pending=useRef<Promise<string|null>>(Promise.resolve(null));
  const externalDestination=useRef<DOMRect|null>(null);
  const mounted=useRef(true);
  const suppressClick=useRef(false);
  const nativeImage=useRef<HTMLElement|null>(null);
  const publish=(next:CardDrag|null)=>{current.current=next;setDrag(next);};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;nativeImage.current?.remove();document.body.classList.remove('is-task-dragging');};},[]);

  function begin(event:ReactDragEvent<HTMLElement>) {
    const source=(event.target as Element).closest<HTMLElement>('[data-testid="board-task"][data-task-id]');
    const task=tasks.find((row)=>row.id===source?.dataset.taskId);
    if(busy || !allowed.current || !source || !task){event.preventDefault();return;}
    event.stopPropagation();
    const rect=source.getBoundingClientRect();
    const clone=source.cloneNode(true) as HTMLElement;
    for(const element of [clone,...clone.querySelectorAll<HTMLElement>('*')]) {
      for(const attribute of ['id','data-testid','data-task-id','aria-label'])element.removeAttribute(attribute);
      element.removeAttribute('draggable');
    }
    clone.classList.remove('is-dragging');clone.style.margin='0';
    const html=clone.outerHTML;
    Object.assign(clone.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,zIndex:'10000',pointerEvents:'none',boxShadow:'0 10px 28px #0008',borderColor:'#77777d',opacity:'1'});
    clone.setAttribute('aria-hidden','true');clone.inert=true;document.body.appendChild(clone);nativeImage.current=clone;
    const offsetX=Math.max(0,Math.min(rect.width,event.clientX-rect.left));
    const offsetY=Math.max(0,Math.min(rect.height,event.clientY-rect.top));
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',task.id);
    event.dataTransfer.setData('application/x-laptop-planner-task',task.id);
    event.dataTransfer.setDragImage(clone,offsetX,offsetY);
    requestAnimationFrame(()=>{clone.remove();if(nativeImage.current===clone)nativeImage.current=null;});
    const originalRows=grouped(tasks.filter((row)=>row.plannedDate===task.plannedDate));
    const original={date:task.plannedDate,beforeTaskId:originalRows[originalRows.findIndex((row)=>row.id===task.id)+1]?.id??null};
    pointer.current={x:event.clientX,y:event.clientY};handled.current=false;externalDestination.current=null;
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    document.body.classList.add('is-task-dragging');
    publish({task,baseline:tasks,original,target:original,html,width:rect.width,height:rect.height,margin:parseFloat(getComputedStyle(source).marginBottom)||8,offsetX,offsetY,phase:'dragging'});
  }
  function spotAt(x:number,y:number):BoardDropSpot|null {
    const active=current.current;const host=panel.current;if(!active || !host)return null;
    const under=document.elementFromPoint(x,y);
    const column=under?.closest<HTMLElement>('[data-board-date]');
    if(!column || !host.contains(column))return null;
    const date=column.dataset.boardDate==='backlog'?null:column.dataset.boardDate!;
    const placeholder=column.querySelector<HTMLElement>('[data-drag-placeholder]');
    if(placeholder){const rect=placeholder.getBoundingClientRect();if(y>=rect.top && y<=rect.bottom && active.target.date===date)return active.target;}
    const candidates=[...column.querySelectorAll<HTMLElement>('[data-row-task]')].filter((node)=>{
      const row=active.baseline.find((task)=>task.id===node.dataset.rowTask);
      return row && row.id!==active.task.id && row.completed===active.task.completed;
    });
    const before=candidates.find((node)=>{const rect=node.getBoundingClientRect();return y<rect.top+rect.height/2;});
    return {date,beforeTaskId:before?.dataset.rowTask??null};
  }
  function over(event:ReactDragEvent<HTMLElement>) {
    if(!current.current || current.current.phase!=='dragging')return;
    event.preventDefault();event.dataTransfer.dropEffect='move';pointer.current={x:event.clientX,y:event.clientY};
    const target=spotAt(event.clientX,event.clientY);
    if(target && (target.date!==current.current.target.date || target.beforeTaskId!==current.current.target.beforeTaskId))publish({...current.current,target});
  }
  function settle(target:BoardDropSpot,save:boolean,destination:DOMRect|null=null) {
    const active=current.current;if(!active || active.phase==='settling')return;
    handled.current=true;externalDestination.current=destination;suppressClick.current=true;
    pending.current=save?Promise.resolve(onMove({id:active.task.id,plannedDate:target.date,beforeTaskId:target.beforeTaskId,viewDate})).catch(()=> 'Unable to save this move.'):Promise.resolve(null);
    publish({...active,target,phase:'settling'});
  }
  function drop(event:ReactDragEvent<HTMLElement>) {
    if(!current.current)return;
    event.preventDefault();event.stopPropagation();pointer.current={x:event.clientX,y:event.clientY};
    const target=spotAt(event.clientX,event.clientY)??current.current.target;
    settle(target,true);
  }
  function end() {
    if(current.current?.phase==='dragging' && !handled.current)settle(current.current.original,false);
  }
  useEffect(()=>{
    const track=(event:DragEvent)=>{if(current.current?.phase==='dragging' && (event.clientX || event.clientY))pointer.current={x:event.clientX,y:event.clientY};};
    const outsideDrop=(event:DragEvent)=>{
      const active=current.current;if(!active || active.phase!=='dragging' || panel.current?.contains(event.target as Node))return;
      const target=(event.target as Element).closest<HTMLElement>('[data-backlog-drop]');if(!target)return;
      event.preventDefault();event.stopImmediatePropagation();pointer.current={x:event.clientX,y:event.clientY};
      settle({date:null,beforeTaskId:null},true,target.getBoundingClientRect());
    };
    const click=(event:MouseEvent)=>{if(suppressClick.current){event.preventDefault();event.stopImmediatePropagation();suppressClick.current=false;}};
    document.addEventListener('dragover',track,true);document.addEventListener('drop',outsideDrop,true);document.addEventListener('click',click,true);
    return()=>{document.removeEventListener('dragover',track,true);document.removeEventListener('drop',outsideDrop,true);document.removeEventListener('click',click,true);};
  });
  useLayoutEffect(()=>{
    if(drag?.phase!=='settling' || !ghost.current)return;
    const node=ghost.current;const from=pointer.current;
    const startX=from.x-drag.offsetX;const startY=from.y-drag.offsetY;
    node.style.left=`${startX}px`;node.style.top=`${startY}px`;
    const target=externalDestination.current??panel.current?.querySelector<HTMLElement>('[data-drag-placeholder]')?.getBoundingClientRect();
    const animation=node.animate([{transform:'translate(0,0)',opacity:.86},{transform:`translate(${(target?.left??startX)-startX}px,${(target?.top??startY)-startY}px)`,opacity:externalDestination.current?0:1}],{duration:reducedMotion()?0:180,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    let cancelled=false;
    void Promise.all([animation.finished.catch(()=>{}),pending.current]).then(()=>{
      if(cancelled || !mounted.current)return;
      document.body.classList.remove('is-task-dragging');publish(null);
      window.setTimeout(()=>{suppressClick.current=false;},0);
    });
    return()=>{cancelled=true;animation.cancel();};
  },[drag?.phase]);

  function rows(date:string|null,render:(task:PlannerTask,index:number)=>ReactNode,matches:(task:PlannerTask)=>boolean) {
    const active=drag;
    const baseline=active?.baseline??tasks;
    const original=grouped(baseline.filter((task)=>task.plannedDate===date)).filter(matches);
    const layoutKey=active?`${active.task.id}:${active.target.date}:${active.target.beforeTaskId}:${active.phase}`:'rest';
    const moving=active?.task;
    const items:({key:string;task:PlannerTask}|{key:string;placeholder:true})[]=original.filter((task)=>task.id!==moving?.id).map((task)=>({key:task.id,task}));
    if(active && active.target.date===date) {
      let index=active.target.beforeTaskId?items.findIndex((item)=>'task' in item && item.task.id===active.target.beforeTaskId):-1;
      if(index<0)index=active.task.completed?items.length:items.findIndex((item)=>'task' in item && item.task.completed);
      if(index<0)index=items.length;
      items.splice(index,0,{key:'placeholder',placeholder:true});
    }
    if(active && active.task.plannedDate===date)items.splice(Math.min(original.findIndex((task)=>task.id===active.task.id),items.length),0,{key:active.task.id,task:active.task});
    return items.map((item,index)=>'placeholder' in item?<div key="placeholder" className="board-drop-placeholder" data-testid="board-drop-placeholder" data-drag-placeholder="true" data-target-date={date??'backlog'} style={{height:active!.height+active!.margin}} aria-hidden="true"><div className="placeholder-card" inert dangerouslySetInnerHTML={{__html:active!.html}}/></div>:<MotionSlot key={item.key} id={item.task.id} collapsed={item.task.id===moving?.id} layoutKey={layoutKey}>{render(item.task,index)}</MotionSlot>);
  }
  return {
    drag,rows,rescan:()=>{const active=current.current;if(active?.phase!=='dragging')return;const target=spotAt(pointer.current.x,pointer.current.y);if(target && (target.date!==active.target.date || target.beforeTaskId!==active.target.beforeTaskId))publish({...active,target});},handlers:{
      onPointerDownCapture:(event:ReactPointerEvent<HTMLElement>)=>{
        const control=(event.target as Element).closest('button,input,textarea,select,a');
        allowed.current=!control || control.matches('.task-title,.drag-handle');
      },
      onDragStartCapture:begin,onDragOver:over,onDragEnter:over,onDrop:drop,onDragEndCapture:end,
    },
    overlay:drag?.phase==='settling'?createPortal(<div ref={ghost} className="board-drop-ghost" data-testid="board-drop-ghost" aria-hidden="true" inert style={{width:drag.width,height:drag.height}} dangerouslySetInnerHTML={{__html:drag.html}}/>,document.body):null,
  };
}

function MotionSlot({id,collapsed,layoutKey,children}:{id:string;collapsed:boolean;layoutKey:string;children:ReactNode}) {
  const element=useRef<HTMLDivElement>(null);
  const previous=useRef<DOMRect|null>(null);
  const wasCollapsed=useRef(collapsed);
  const animation=useRef<Animation|null>(null);
  useLayoutEffect(()=>{
    const node=element.current;if(!node)return;
    animation.current?.cancel();
    const next=node.getBoundingClientRect();const prior=previous.current;previous.current=next;const returning=wasCollapsed.current;wasCollapsed.current=collapsed;
    if(prior && !collapsed && !returning && !reducedMotion() && Math.abs(prior.top-next.top)>.5)animation.current=node.animate([{transform:`translateY(${prior.top-next.top}px)`},{transform:'translateY(0)'}],{duration:170,easing:'cubic-bezier(.2,.8,.2,1)'});
  },[layoutKey,collapsed]);
  useEffect(()=>()=>animation.current?.cancel(),[]);
  return <div ref={element} className={`board-task-slot ${collapsed?'is-source-anchor':''}`} data-row-task={collapsed?undefined:id} aria-hidden={collapsed||undefined}>{children}</div>;
}
