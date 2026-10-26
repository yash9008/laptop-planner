/** Calendar date in YYYY-MM-DD form, interpreted in the user's local timezone. */
export type LocalDate = string;

/** Explicit local wall-clock value. minute may include fractions for timer precision. */
export interface LocalDateTime {
  readonly date: LocalDate;
  readonly minute: number;
}

export interface MinuteInterval {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface PlanningHours extends MinuteInterval {}

/** Array order is scheduling priority. A null date means an unscheduled backlog task. */
export interface PlanningTask {
  readonly id: string;
  readonly title: string;
  readonly plannedDate: LocalDate | null;
  readonly plannedMinutes: number;
  readonly completed: boolean;
  /** Optional elapsed-clock total from the adapter, independent of DST/wall-clock projections. */
  readonly actualMinutes?: number;
}

export interface FixedEvent {
  readonly id: string;
  readonly title: string;
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
}

/** A closed actual-work interval, not an automatically generated calendar block. */
export interface TimeEntry {
  readonly id: string;
  readonly taskId: string;
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
}

export interface ActiveTimer {
  readonly taskId: string;
  readonly startedAt: LocalDateTime;
}

/** A completed task's historical calendar block that must survive replanning. */
export interface CompletedBlock extends MinuteInterval {
  readonly id: string;
  readonly taskId: string;
  readonly date: LocalDate;
}

export interface DayPlanningInput {
  readonly date: LocalDate;
  readonly clock: LocalDateTime;
  readonly hours: PlanningHours;
  readonly tasks: readonly PlanningTask[];
  readonly events?: readonly FixedEvent[];
  readonly timeEntries?: readonly TimeEntry[];
  readonly activeTimer?: ActiveTimer;
  readonly completedBlocks?: readonly CompletedBlock[];
}

export interface ScheduledBlock extends MinuteInterval {
  readonly id: string;
  readonly taskId: string;
  readonly date: LocalDate;
}

export interface RecordedBlock extends MinuteInterval {
  readonly id: string;
  readonly taskId: string;
  readonly date: LocalDate;
  readonly source: 'time-entry' | 'active-timer';
}

export interface DayEvent extends MinuteInterval {
  readonly id: string;
  readonly title: string;
}

export interface EventConflict extends MinuteInterval {
  readonly eventIds: readonly [string, string];
}

export interface TaskPlanningSummary {
  readonly taskId: string;
  readonly completed: boolean;
  readonly active: boolean;
  readonly plannedMinutes: number;
  readonly actualMinutes: number;
  readonly actualMinutesOnDate: number;
  readonly remainingMinutes: number;
  readonly scheduledMinutes: number;
  readonly unscheduledMinutes: number;
}

export interface DayPlanningSummary {
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly plannedMinutes: number;
  readonly remainingWorkMinutes: number;
  /** Actual occupied wall-clock time on this date, including outside daily hours. */
  readonly recordedMinutes: number;
  /** Union of fixed-event time within daily hours (overlaps count once). */
  readonly fixedEventMinutes: number;
  /** Free capacity from the planning start, before allocating remaining tasks. */
  readonly availableMinutes: number;
  readonly scheduledMinutes: number;
  readonly freeMinutes: number;
  readonly unscheduledMinutes: number;
}

export interface DayPlan {
  readonly date: LocalDate;
  readonly hours: PlanningHours;
  readonly planningStartMinute: number;
  readonly scheduledBlocks: readonly ScheduledBlock[];
  readonly recordedBlocks: readonly RecordedBlock[];
  readonly completedBlocks: readonly CompletedBlock[];
  readonly events: readonly DayEvent[];
  readonly eventConflicts: readonly EventConflict[];
  /** Kept in the original task-list order, even when an active task schedules first. */
  readonly tasks: readonly TaskPlanningSummary[];
  readonly activeTimer: ActiveTimer | null;
  readonly summary: DayPlanningSummary;
}
