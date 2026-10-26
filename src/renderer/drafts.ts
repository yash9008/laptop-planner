import type { PlannerTask } from '../shared/contracts';
import { formatDuration } from '../shared/task-input';

export interface TaskDraft {
  creationId: string;
  title: string;
  estimate: string;
  notes: string;
  plannedDate: string | null;
  backlog: boolean;
  projectId: string;
  deadline: string;
  repeat: string; // 'never' | 'daily' | 'weekdays'
  weekdays: number[];
  stopRepeats: boolean;
  error: string | null;
}

export function creationDraftKey(targetDate: string | null, projectId: string | null): string {
  return `${targetDate ?? 'backlog'}::${projectId ?? ''}`;
}

export function newCreationDraft(targetDate: string | null, projectId: string | null, creationId?: string): TaskDraft {
  return {
    creationId: creationId ?? crypto.randomUUID(),
    title: '',
    estimate: '',
    notes: '',
    plannedDate: targetDate,
    backlog: targetDate === null,
    projectId: projectId ?? '',
    deadline: '',
    repeat: 'never',
    weekdays: [1, 2, 3, 4, 5],
    stopRepeats: false,
    error: null,
  };
}

export function taskToDraft(task: PlannerTask, defaultDate: string): TaskDraft {
  return {
    creationId: task.id,
    title: task.title,
    estimate: formatDuration(task.plannedMinutes),
    notes: task.notes ?? '',
    plannedDate: task.plannedDate ?? defaultDate,
    backlog: task.plannedDate === null,
    projectId: task.projectId ?? '',
    deadline: task.deadline ?? '',
    repeat: 'never',
    weekdays: [1, 2, 3, 4, 5],
    stopRepeats: false,
    error: null,
  };
}

export function sameWeekdays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

export function isDraftDirty(draft: TaskDraft, initial: TaskDraft): boolean {
  return (
    draft.title !== initial.title ||
    draft.estimate !== initial.estimate ||
    draft.notes !== initial.notes ||
    draft.plannedDate !== initial.plannedDate ||
    draft.backlog !== initial.backlog ||
    draft.projectId !== initial.projectId ||
    draft.deadline !== initial.deadline ||
    draft.repeat !== initial.repeat ||
    draft.stopRepeats !== initial.stopRepeats ||
    !sameWeekdays(draft.weekdays, initial.weekdays)
  );
}

export function reconcileTaskDraft(
  cachedDraft: TaskDraft,
  cachedInitial: TaskDraft,
  freshTaskDraft: TaskDraft
): { draft: TaskDraft; initial: TaskDraft } {
  // If field in cachedDraft was unmodified compared to cachedInitial (pristine),
  // refresh it from freshTaskDraft (latest committed state).
  // If field in cachedDraft was modified (dirty user edit), preserve the user's edit.
  const title = cachedDraft.title === cachedInitial.title ? freshTaskDraft.title : cachedDraft.title;
  const estimate = cachedDraft.estimate === cachedInitial.estimate ? freshTaskDraft.estimate : cachedDraft.estimate;
  const notes = cachedDraft.notes === cachedInitial.notes ? freshTaskDraft.notes : cachedDraft.notes;
  const plannedDate = cachedDraft.plannedDate === cachedInitial.plannedDate ? freshTaskDraft.plannedDate : cachedDraft.plannedDate;
  const backlog = cachedDraft.backlog === cachedInitial.backlog ? freshTaskDraft.backlog : cachedDraft.backlog;
  const projectId = cachedDraft.projectId === cachedInitial.projectId ? freshTaskDraft.projectId : cachedDraft.projectId;
  const deadline = cachedDraft.deadline === cachedInitial.deadline ? freshTaskDraft.deadline : cachedDraft.deadline;
  const repeat = cachedDraft.repeat === cachedInitial.repeat ? freshTaskDraft.repeat : cachedDraft.repeat;
  const weekdays = sameWeekdays(cachedDraft.weekdays, cachedInitial.weekdays) ? freshTaskDraft.weekdays : cachedDraft.weekdays;
  const stopRepeats = cachedDraft.stopRepeats === cachedInitial.stopRepeats ? freshTaskDraft.stopRepeats : cachedDraft.stopRepeats;

  const draft: TaskDraft = {
    ...freshTaskDraft,
    title,
    estimate,
    notes,
    plannedDate,
    backlog,
    projectId,
    deadline,
    repeat,
    weekdays,
    stopRepeats,
    error: cachedDraft.error,
  };

  const initial: TaskDraft = {
    ...freshTaskDraft,
  };

  return { draft, initial };
}
