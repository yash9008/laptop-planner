import type { LocalDate, LocalDateTime, MinuteInterval } from './types';

export const MINUTES_PER_DAY = 1440;

/** Civil-date arithmetic only: no Date parsing, system clock, timezone, or I/O. */
export function dayNumber(date: LocalDate): number {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError('Local dates must use YYYY-MM-DD.');
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]!) {
    throw new RangeError(`Invalid local date: ${date}.`);
  }
  const previousYear = year - 1;
  const previousYears = 365 * previousYear + Math.floor(previousYear / 4)
    - Math.floor(previousYear / 100) + Math.floor(previousYear / 400);
  return previousYears + monthLengths.slice(0, month - 1).reduce((sum, days) => sum + days, 0) + day - 1;
}

export function checkMinute(minute: number, allowEndOfDay = false): void {
  if (!Number.isFinite(minute) || minute < 0 || (allowEndOfDay ? minute > 1440 : minute >= 1440)) {
    throw new RangeError(`Minutes must be finite and within ${allowEndOfDay ? '0–1440' : '0–1439.999…'}.`);
  }
}

export function minuteRelativeTo(value: LocalDateTime, originDay: number): number {
  checkMinute(value.minute);
  // Keep nearby times close to zero so sub-minute timer precision is not lost
  // by subtracting two large absolute calendar-minute values.
  return (dayNumber(value.date) - originDay) * MINUTES_PER_DAY + value.minute;
}

export function checkInterval(interval: MinuteInterval): void {
  checkMinute(interval.startMinute);
  checkMinute(interval.endMinute, true);
  if (interval.endMinute <= interval.startMinute) throw new RangeError('Intervals must end after they start.');
}

export function intersection(left: MinuteInterval, right: MinuteInterval): MinuteInterval | null {
  const startMinute = Math.max(left.startMinute, right.startMinute);
  const endMinute = Math.min(left.endMinute, right.endMinute);
  return endMinute > startMinute ? { startMinute, endMinute } : null;
}

/** Inputs and output are distinct objects; overlapping and adjacent intervals merge. */
export function mergeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals.map((interval) => ({ ...interval })).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const merged: { startMinute: number; endMinute: number }[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, interval.endMinute);
    else merged.push({ ...interval });
  }
  return merged;
}

export function totalMinutes(intervals: readonly MinuteInterval[]): number {
  return mergeIntervals(intervals).reduce((sum, interval) => sum + interval.endMinute - interval.startMinute, 0);
}

export function freeIntervals(window: MinuteInterval, occupied: readonly MinuteInterval[]): MinuteInterval[] {
  if (window.startMinute >= window.endMinute) return [];
  const clipped = occupied.flatMap((interval) => {
    const overlap = intersection(window, interval);
    return overlap ? [overlap] : [];
  });
  const free: MinuteInterval[] = [];
  let cursor = window.startMinute;
  for (const busy of mergeIntervals(clipped)) {
    if (cursor < busy.startMinute) free.push({ startMinute: cursor, endMinute: busy.startMinute });
    cursor = busy.endMinute;
  }
  if (cursor < window.endMinute) free.push({ startMinute: cursor, endMinute: window.endMinute });
  return free;
}
