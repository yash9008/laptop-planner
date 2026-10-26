import { Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import type { FocusState } from '../shared/contracts';
import { formatDuration, formatElapsed } from '../shared/task-input';

export interface MenuBarFocus extends FocusState { title:string;plannedMinutes:number }

/** Native presentation only. SQLite's focus sessions remain the authoritative clock. */
export class FocusMenuBar {
  private tray:Tray|null=null;
  private menu:Menu|null=null;
  private signature='';
  constructor(private readonly actions:{open():void;toggle(taskId:string,running:boolean):void;quit():void}) {}
  update(focus:MenuBarFocus|null) {
    if(!focus){this.destroy();return;}
    if(!this.tray) {
      const icon=nativeImage.createFromPath(join(__dirname,'assets/focusTemplate.png')).resize({width:16,height:16});
      icon.setTemplateImage(true);
      this.tray=new Tray(icon);
    }
    const elapsed=formatElapsed(focus.actualMilliseconds);
    this.tray.setTitle(`${focus.running?'':'Ⅱ '}${elapsed}`,{fontType:'monospacedDigit'});
    this.tray.setToolTip(`Laptop Planner · ${focus.title}\n${focus.running?'Focusing':'Paused'} · ${elapsed}`);
    const signature=JSON.stringify([focus.taskId,focus.title,focus.plannedMinutes,focus.running,focus.reason]);
    if(signature!==this.signature) {
      this.signature=signature;
      const reason=focus.reason==='sleep'?'Paused for sleep':focus.reason==='quit'?'Paused when you quit':focus.reason==='interrupted'?'Interrupted session recovered':focus.running?'Focusing':'Paused';
      this.menu=Menu.buildFromTemplate([
        {id:'focus-task',label:focus.title.replaceAll('&','&&'),enabled:false},
        {id:'focus-elapsed',label:'',enabled:false},
        {id:'focus-state',label:reason,enabled:false},
        {type:'separator'},
        {id:'focus-toggle',label:focus.running?'Pause timer':'Resume timer',click:()=>this.actions.toggle(focus.taskId,focus.running)},
        {id:'focus-open',label:'Open Laptop Planner',click:()=>this.actions.open()},
        {type:'separator'},
        {id:'focus-quit',label:'Quit Laptop Planner',click:()=>this.actions.quit()},
      ]);
      this.tray.setContextMenu(this.menu);
    }
    const item=this.menu?.getMenuItemById('focus-elapsed');
    if(item)item.label=`${elapsed} elapsed · ${formatDuration(focus.plannedMinutes)} planned`;
    const toggle=this.menu?.getMenuItemById('focus-toggle');if(toggle)toggle.enabled=true;
  }
  unavailable() {
    if(!this.tray)return;
    this.signature='';
    this.tray.setTitle('!');this.tray.setToolTip('Laptop Planner · Timer status could not be read. Open the planner to check storage.');
    const toggle=this.menu?.getMenuItemById('focus-toggle');if(toggle)toggle.enabled=false;
    const state=this.menu?.getMenuItemById('focus-state');if(state)state.label='Timer status unavailable';
  }
  destroy() {this.tray?.destroy();this.tray=null;this.menu=null;this.signature='';}
}
