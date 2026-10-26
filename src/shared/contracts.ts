import type { DayPlan, LocalDateTime } from '../scheduler';

export const FOUNDATION_STATUS_CHANNEL = 'planner:foundation-status';
export const PLANNER_CHANNELS = {
  getDay: 'planner:get-day',
  saveTask: 'planner:save-task',
  setTaskCompleted: 'planner:complete-task',
  deleteTask: 'planner:delete-task',
  restoreTask: 'planner:restore-task',
  reorderTasks: 'planner:reorder-tasks',
  moveTask: 'planner:move-task',
  saveEvent: 'planner:save-event',
  deleteEvent: 'planner:delete-event',
  saveProject: 'planner:save-project',
  startFocus: 'planner:start-focus',
  pauseFocus: 'planner:pause-focus',
  saveSettings: 'planner:save-settings',
  createBackup: 'planner:create-backup',
  restoreBackup: 'planner:restore-backup',
  changed: 'planner:changed',
} as const;

export interface DailyHours {
  startMinute: number;
  endMinute: number;
  timeZone: string;
}

export interface SaveSettingsInput extends DailyHours { viewDate:string }
export interface BackupOutcome { canceled:boolean; path?:string; safetyBackupPath?:string }

export interface FoundationStatus {
  app: { name: string; version: string; platform: string; architecture: string };
  storage: {
    databasePath: string;
    schemaVersion: number;
    sqliteVersion: string;
    journalMode: string;
    dailyHours: DailyHours;
  };
}

export type PlannerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: 'STORAGE_UNAVAILABLE' | 'SAVE_FAILED' | 'VALIDATION_ERROR' | 'NOT_FOUND'; message: string } };

export interface PlannerTask {
  id: string;
  title: string;
  notes: string;
  plannedDate: string | null;
  projectId: string | null;
  deadline: string | null;
  plannedMinutes: number;
  completed: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  recurrenceId: string | null;
  occurrenceDate: string | null;
  actualMinutes: number;
}

export interface PlannerDay {
  date: string;
  today: string;
  clock: LocalDateTime;
  dailyHours: DailyHours;
  tasks: PlannerTask[];
  calendarTitles: Record<string, string>;
  plan: DayPlan;
  allTasks: PlannerTask[];
  backlog: PlannerTask[];
  projects: PlannerProject[];
  events: PlannerEvent[];
  recurrences: RecurringTemplate[];
  focus: FocusState | null;
  asOf: number;
  actualMinutesOnDate: number;
  board: { date: string; tasks: PlannerTask[]; plan: DayPlan; actualMinutesOnDate: number }[];
}

export interface PlannerProject {
  id: string; title: string; color: string; notes: string; deadline: string | null;
  createdAt: string; updatedAt: string;
}
export interface PlannerEvent {
  id: string; title: string; notes: string; start: LocalDateTime; end: LocalDateTime;
  createdAt: string; updatedAt: string;
}
export interface SaveProjectInput {
  id?: string; create?:boolean; title: string; color: string; notes: string; deadline: string | null; viewDate: string;
}
export interface SaveEventInput {
  id?: string; create?:boolean; title: string; notes: string; start: LocalDateTime; end: LocalDateTime; viewDate: string;
}

export interface RecurringTemplate {
  id: string; title: string; weekdays: number[]; startDate: string; stoppedOn: string | null;
}
export interface FocusState {
  taskId: string; running: boolean; actualMilliseconds: number; sessionStartedAt: number | null;
  reason: 'paused' | 'sleep' | 'quit' | 'interrupted' | null;
}

export interface SaveTaskInput {
  id?: string;
  create?:boolean;
  title: string;
  notes: string;
  plannedDate: string | null;
  projectId?: string | null;
  recurrence?: { weekdays: number[] };
  stopRepeats?: boolean;
  deadline?: string | null;
  plannedMinutes: number;
  viewDate: string;
}

export interface TaskActionInput { id: string; viewDate: string }
export interface CompleteTaskInput extends TaskActionInput { completed: boolean }
export interface ReorderTasksInput { date: string; taskIds: string[] }
export interface MoveTaskInput { id: string; plannedDate: string | null; beforeTaskId: string | null; viewDate: string }

export interface PlannerBridge {
  getFoundationStatus(): Promise<PlannerResult<FoundationStatus>>;
  saveSettings(input:SaveSettingsInput):Promise<PlannerResult<PlannerDay>>;
  createBackup():Promise<PlannerResult<BackupOutcome>>;
  restoreBackup():Promise<PlannerResult<BackupOutcome>>;
  getDay(date?: string): Promise<PlannerResult<PlannerDay>>;
  saveTask(input: SaveTaskInput): Promise<PlannerResult<PlannerDay>>;
  setTaskCompleted(input: CompleteTaskInput): Promise<PlannerResult<PlannerDay>>;
  deleteTask(input: TaskActionInput): Promise<PlannerResult<PlannerDay>>;
  restoreTask(input: TaskActionInput): Promise<PlannerResult<PlannerDay>>;
  reorderTasks(input: ReorderTasksInput): Promise<PlannerResult<PlannerDay>>;
  moveTask(input: MoveTaskInput): Promise<PlannerResult<PlannerDay>>;
  saveEvent(input: SaveEventInput): Promise<PlannerResult<PlannerDay>>;
  deleteEvent(input: TaskActionInput): Promise<PlannerResult<PlannerDay>>;
  saveProject(input: SaveProjectInput): Promise<PlannerResult<PlannerDay>>;
  startFocus(input: TaskActionInput): Promise<PlannerResult<PlannerDay>>;
  pauseFocus(input: TaskActionInput): Promise<PlannerResult<PlannerDay>>;
  onPlannerChanged(listener: () => void): () => void;
}
