import { contextBridge, ipcRenderer } from 'electron';
import { FOUNDATION_STATUS_CHANNEL, PLANNER_CHANNELS, type PlannerBridge } from '../shared/contracts';

const bridge = Object.freeze<PlannerBridge>({
  getFoundationStatus: () => ipcRenderer.invoke(FOUNDATION_STATUS_CHANNEL),
  saveSettings: (input)=>ipcRenderer.invoke(PLANNER_CHANNELS.saveSettings,input),
  createBackup: ()=>ipcRenderer.invoke(PLANNER_CHANNELS.createBackup),
  restoreBackup: ()=>ipcRenderer.invoke(PLANNER_CHANNELS.restoreBackup),
  getDay: (date) => ipcRenderer.invoke(PLANNER_CHANNELS.getDay, date),
  saveTask: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.saveTask, input),
  setTaskCompleted: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.setTaskCompleted, input),
  deleteTask: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.deleteTask, input),
  restoreTask: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.restoreTask, input),
  reorderTasks: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.reorderTasks, input),
  moveTask: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.moveTask, input),
  saveEvent: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.saveEvent, input),
  deleteEvent: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.deleteEvent, input),
  saveProject: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.saveProject, input),
  startFocus: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.startFocus, input),
  pauseFocus: (input) => ipcRenderer.invoke(PLANNER_CHANNELS.pauseFocus, input),
  onPlannerChanged: (listener) => {
    const notify=()=>listener();
    ipcRenderer.on(PLANNER_CHANNELS.changed,notify);
    return ()=>ipcRenderer.removeListener(PLANNER_CHANNELS.changed,notify);
  },
});

contextBridge.exposeInMainWorld('planner', bridge);
