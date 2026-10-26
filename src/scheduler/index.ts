import type {
  DayPlan, DayPlanningInput, EventConflict, MinuteInterval,
  RecordedBlock, ScheduledBlock, TaskPlanningSummary,
} from './types';
import { checkInterval, dayNumber, freeIntervals, intersection, MINUTES_PER_DAY, minuteRelativeTo, totalMinutes } from './time';

export type * from './types';

function requireId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('Identifiers must be non-empty strings.');
}

function uniqueIds(items: readonly { readonly id: string }[], name: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    requireId(item.id);
    if (ids.has(item.id)) throw new TypeError(`Duplicate ${name} identifier: ${item.id}.`);
    ids.add(item.id);
  }
}

/**
 * Deterministic day planning. Local date/clock and actual-work records are explicit
 * inputs. No runtime dependencies, mutation, persistence, or recurrence generation.
 * Every call recomputes flexible blocks; pass history, never the old flexible plan.
 */
export function scheduleDay(input: DayPlanningInput): DayPlan {
  const planningDay = dayNumber(input.date);
  const clock = minuteRelativeTo(input.clock, planningDay);
  const clockDay = dayNumber(input.clock.date);
  checkInterval(input.hours);
  const events = input.events ?? [];
  const entries = input.timeEntries ?? [];
  const completedBlocks = input.completedBlocks ?? [];
  uniqueIds(input.tasks, 'task');
  uniqueIds(events, 'event');
  uniqueIds(entries, 'time-entry');
  uniqueIds(completedBlocks, 'completed-block');

  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  let totalEstimate = 0;
  for (const task of input.tasks) {
    if (!Number.isSafeInteger(task.plannedMinutes) || task.plannedMinutes <= 0) {
      throw new RangeError('Task estimates must be positive whole minutes.');
    }
    if (task.actualMinutes !== undefined && (!Number.isFinite(task.actualMinutes) || task.actualMinutes < 0 || task.actualMinutes > Number.MAX_SAFE_INTEGER)) throw new RangeError('Actual minutes must be finite and non-negative.');
    totalEstimate += task.plannedMinutes;
    if (!Number.isSafeInteger(totalEstimate)) throw new RangeError('Total task estimates exceed safe minute precision.');
    if (typeof task.completed !== 'boolean') throw new TypeError('Task completion must be a boolean.');
    if (task.plannedDate !== null) dayNumber(task.plannedDate);
  }

  const day = { startMinute: 0, endMinute: MINUTES_PER_DAY };
  const recordedBlocks: RecordedBlock[] = [];
  const actualByTask = new Map<string, MinuteInterval[]>();

  function recordWork(id: string, taskId: string, start: number, end: number, source: RecordedBlock['source']): void {
    if (!tasksById.has(taskId)) throw new TypeError(`Unknown task in work record: ${taskId}.`);
    if (end < start) throw new RangeError('Work intervals cannot end before they start.');
    if (end > clock) throw new RangeError('Recorded work cannot extend beyond the supplied clock.');
    if (end === start) return;
    const work = { startMinute: start, endMinute: end };
    const prior = actualByTask.get(taskId) ?? [];
    prior.push(work);
    actualByTask.set(taskId, prior);
    const clipped = intersection(day, work);
    if (clipped) recordedBlocks.push({
      id, taskId, date: input.date, source,
      startMinute: clipped.startMinute,
      endMinute: clipped.endMinute,
    });
  }

  for (const entry of entries) {
    const start = minuteRelativeTo(entry.start, planningDay);
    const end = minuteRelativeTo(entry.end, planningDay);
    if (end <= start) throw new RangeError('Time entries must end after they start.');
    recordWork(`recorded:${encodeURIComponent(entry.id)}:${input.date}`, entry.taskId, start, end, 'time-entry');
  }

  if (input.activeTimer) {
    const task = tasksById.get(input.activeTimer.taskId);
    if (!task || task.completed) throw new TypeError('The active timer must reference an existing incomplete task.');
    recordWork(`active:${encodeURIComponent(task.id)}:${input.date}`, task.id,
      minuteRelativeTo(input.activeTimer.startedAt, planningDay), clock, 'active-timer');
  }

  for (const block of completedBlocks) {
    checkInterval(block);
    const blockStart = (dayNumber(block.date) - planningDay) * MINUTES_PER_DAY;
    if (!tasksById.get(block.taskId)?.completed) throw new TypeError('Completed blocks must reference completed tasks.');
    if (blockStart + block.endMinute > clock) throw new RangeError('Completed history cannot extend beyond the supplied clock.');
  }
  const retainedCompletedBlocks = completedBlocks.filter((block) => block.date === input.date).map((block) => ({ ...block }));

  const dayEvents = events.flatMap((event) => {
    const start = minuteRelativeTo(event.start, planningDay);
    const end = minuteRelativeTo(event.end, planningDay);
    if (end <= start) throw new RangeError('Fixed events must end after they start.');
    const clipped = intersection(day, { startMinute: start, endMinute: end });
    return clipped ? [{ id: event.id, title: event.title, ...clipped }] : [];
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const eventConflicts: EventConflict[] = [];
  for (let leftIndex = 0; leftIndex < dayEvents.length; leftIndex++) {
    const left = dayEvents[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < dayEvents.length; rightIndex++) {
      const right = dayEvents[rightIndex]!;
      if (right.startMinute >= left.endMinute) break;
      const overlap = intersection(left, right);
      if (overlap) eventConflicts.push({ eventIds: [left.id, right.id], ...overlap });
    }
  }

  const planningStartMinute = planningDay < clockDay
    ? input.hours.endMinute
    : planningDay === clockDay
      ? Math.min(input.hours.endMinute, Math.max(input.hours.startMinute, input.clock.minute))
      : input.hours.startMinute;
  const occupied = [...dayEvents, ...recordedBlocks, ...retainedCompletedBlocks];
  const gaps = freeIntervals({ startMinute: planningStartMinute, endMinute: input.hours.endMinute }, occupied);
  const availableMinutes = gaps.reduce((sum, gap) => sum + gap.endMinute - gap.startMinute, 0);
  const datedTasks = input.tasks.filter((task) => task.plannedDate === input.date);
  const summaries = new Map<string, TaskPlanningSummary>();
  for (const task of datedTasks) {
    const actual = actualByTask.get(task.id) ?? [];
    const actualMinutes = task.actualMinutes ?? totalMinutes(actual);
    const actualMinutesOnDate = totalMinutes(actual.flatMap((work) => {
      const clipped = intersection(day, work);
      return clipped ? [clipped] : [];
    }));
    const remainingMinutes = task.completed ? 0 : Math.max(0, task.plannedMinutes - actualMinutes);
    summaries.set(task.id, {
      taskId: task.id, completed: task.completed, active: task.id === input.activeTimer?.taskId,
      plannedMinutes: task.plannedMinutes, actualMinutes, actualMinutesOnDate,
      remainingMinutes, scheduledMinutes: 0, unscheduledMinutes: remainingMinutes,
    });
  }

  const active = datedTasks.find((task) => task.id === input.activeTimer?.taskId);
  const prioritizedTasks = active ? [active, ...datedTasks.filter((task) => task.id !== active.id)] : datedTasks;
  const scheduledBlocks: ScheduledBlock[] = [];
  let gapIndex = 0;
  let cursor = gaps[0]?.startMinute ?? input.hours.endMinute;
  for (const task of prioritizedTasks) {
    const summary = summaries.get(task.id)!;
    let remaining = summary.remainingMinutes;
    let scheduledMinutes = 0;
    while (remaining > 0 && gapIndex < gaps.length) {
      const gap = gaps[gapIndex]!;
      const duration = Math.min(remaining, gap.endMinute - cursor);
      const endMinute = cursor + duration;
      scheduledBlocks.push({
        id: `scheduled:${encodeURIComponent(task.id)}:${input.date}:${cursor}:${endMinute}`,
        taskId: task.id, date: input.date, startMinute: cursor, endMinute,
      });
      scheduledMinutes += duration;
      remaining = Math.max(0, remaining - duration);
      cursor = endMinute;
      if (cursor >= gap.endMinute) {
        gapIndex++;
        cursor = gaps[gapIndex]?.startMinute ?? input.hours.endMinute;
      }
    }
    summaries.set(task.id, { ...summary, scheduledMinutes, unscheduledMinutes: remaining });
  }

  const taskSummaries = datedTasks.map((task) => summaries.get(task.id)!);
  const sum = (field: 'plannedMinutes' | 'remainingMinutes' | 'scheduledMinutes' | 'unscheduledMinutes') =>
    taskSummaries.reduce((minutes, task) => minutes + task[field], 0);
  const scheduledMinutes = sum('scheduledMinutes');

  return {
    date: input.date,
    hours: { ...input.hours },
    planningStartMinute,
    scheduledBlocks,
    recordedBlocks: recordedBlocks.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute),
    completedBlocks: retainedCompletedBlocks,
    events: dayEvents,
    eventConflicts,
    tasks: taskSummaries,
    activeTimer: input.activeTimer ? { taskId: input.activeTimer.taskId, startedAt: { ...input.activeTimer.startedAt } } : null,
    summary: {
      taskCount: datedTasks.length,
      completedTaskCount: datedTasks.filter((task) => task.completed).length,
      plannedMinutes: sum('plannedMinutes'),
      remainingWorkMinutes: sum('remainingMinutes'),
      recordedMinutes: totalMinutes(recordedBlocks),
      fixedEventMinutes: totalMinutes(dayEvents.flatMap((event) => {
        const clipped = intersection(input.hours, event);
        return clipped ? [clipped] : [];
      })),
      availableMinutes,
      scheduledMinutes,
      freeMinutes: Math.max(0, availableMinutes - scheduledMinutes),
      unscheduledMinutes: sum('unscheduledMinutes'),
    },
  };
}
