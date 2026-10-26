import type { LocalDateTime } from '../scheduler';

export function localClock(now: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (name: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === name)!.value;
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minute: Number(value('hour')) * 60 + Number(value('minute')) + Number(value('second')) / 60 + now.getUTCMilliseconds() / 60000,
  };
}
