import type { PlannerDay } from '../../shared/contracts';
import { dateLabel, formatDuration, formatElapsed } from '../../shared/task-input';

export function DailyWorkload({ day }: { day: PlannerDay }) {
  const summary = day.plan.summary;
  const overflow = summary.unscheduledMinutes > 0;
  return <section className={`daily-summary${overflow ? ' is-over-capacity' : ''}`} aria-label="Daily summary">
    <div className="summary-date"><span className="summary-label">{day.date === day.today ? 'Today' : dateLabel(day.date, { weekday: 'short' })}</span><strong>{dateLabel(day.date, { month: 'short', day: 'numeric' })}</strong></div>
    <div><span className="summary-label">Planned</span><strong data-testid="planned-total">{formatDuration(summary.plannedMinutes)}</strong></div>
    <div className="summary-actual"><span className="summary-label">{day.date === day.today ? 'Actual today' : 'Actual'}</span><strong data-testid="actual-total">{formatElapsed(day.actualMinutesOnDate * 60000)}</strong></div>
    <div><span className="summary-label">On calendar</span><strong data-testid="scheduled-total">{formatDuration(summary.scheduledMinutes + summary.fixedEventMinutes + summary.recordedMinutes)}</strong></div>
    <div><span className="summary-label">Free time</span><strong data-testid="free-total">{formatDuration(summary.freeMinutes, 'down')}</strong></div>
    <div className={`summary-fit${overflow ? ' summary-warning' : ''}`}><span className="summary-label">Won’t fit</span><strong data-testid="unscheduled-total">{formatDuration(summary.unscheduledMinutes)}</strong></div>
  </section>;
}
