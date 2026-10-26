import type { LocalDateTime } from '../scheduler';

/** User-facing duration syntax. Bare numbers mean minutes. No rounding or guessing. */
export function parseDuration(text: string): number | null {
  const value = text.trim().toLowerCase();
  let minutes: number;
  if (/^\d+$/.test(value)) minutes = Number(value);
  else if (/^\d+:\d{2}$/.test(value)) {
    const [hours, remainder] = value.split(':').map(Number);
    if (remainder! >= 60) return null;
    minutes = hours! * 60 + remainder!;
  } else {
    const match = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/.exec(value);
    if (!match || (!match[1] && !match[2])) return null;
    minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  }
  return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : null;
}

export function formatDuration(minutes: number, round: 'up' | 'down' = 'up'): string {
  const whole = Math.max(0, round === 'up' ? Math.ceil(minutes - 1e-7) : Math.floor(minutes + 1e-7));
  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
}

export function formatTime(minute: number): string {
  const whole = Math.floor(minute + 1e-7);
  const hour = Math.floor(whole / 60) % 24;
  return `${hour % 12 || 12}:${String(whole % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00.000Z`));
}
export function shiftLocalTime(point: LocalDateTime, minutes: number): LocalDateTime {
  const total = point.minute + minutes;
  return { date: shiftDate(point.date, Math.floor(total / 1440)), minute: ((total % 1440) + 1440) % 1440 };
}

export function timeInput(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export const WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const;
export function formatElapsed(milliseconds:number):string {
  const total=Math.max(0,Math.floor(milliseconds/1000));
  const hours=Math.floor(total/3600);const minutes=Math.floor(total/60)%60;const seconds=total%60;
  return `${hours?`${hours}:`:''}${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
