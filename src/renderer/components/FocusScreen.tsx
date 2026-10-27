import type { PlannerDay, PlannerTask } from '../../shared/contracts';
import { dateLabel, formatDuration, formatElapsed } from '../../shared/task-input';
import { Icon } from './Icon';

export function FocusScreen({
  day,
  task,
  busy,
  error,
  eligibleTasks,
  onSelectTask,
  onStart,
  onPause,
  onComplete,
  onEdit,
  onExit,
  onAddTask,
}: {
  day: PlannerDay;
  task: PlannerTask | null;
  busy: boolean;
  error: string | null;
  eligibleTasks: PlannerTask[];
  onSelectTask: (taskId: string) => void;
  onStart: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onComplete: (taskId: string, completed: boolean) => void;
  onEdit: (task: PlannerTask, originatingEl?: HTMLElement) => void;
  onExit: () => void;
  onAddTask: () => void;
}) {
  if (!task) {
    return (
      <main className="focus-screen is-empty" data-testid="focus-screen" aria-label="Focus view">
        <header className="focus-screen-header">
          <button
            className="button secondary focus-exit-btn"
            aria-label="Exit Focus view"
            title="Exit Focus · Esc"
            onClick={onExit}
          >
            <Icon name="left" size={15} />
            <span>Exit Focus</span>
          </button>
        </header>

        <div className="focus-empty-state" data-testid="focus-empty-state">
          <Icon name="focus" size={48} />
          <h2>No tasks for focus</h2>
          <p>All tasks for today are completed, or no tasks are scheduled.</p>
          <div className="focus-empty-actions">
            <button className="button primary" onClick={onAddTask} disabled={busy}>
              <Icon name="plus" size={16} />
              <span>Add task</span>
            </button>
            <button className="button secondary" onClick={onExit}>
              <span>Return to workspace</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isThisTaskFocused = day.focus?.taskId === task.id;
  const isRunning = Boolean(isThisTaskFocused && day.focus?.running);
  const actualMs = isThisTaskFocused
    ? day.focus!.actualMilliseconds
    : task.actualMinutes * 60_000;
  const overrun = actualMs > task.plannedMinutes * 60_000;
  const canFocus = task.plannedDate === day.today && !task.completed;

  const runningElsewhereTask =
    day.focus?.running && day.focus.taskId !== task.id
      ? day.allTasks.find((t) => t.id === day.focus?.taskId)
      : null;

  const currentIndex = eligibleTasks.findIndex((t) => t.id === task.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < eligibleTasks.length - 1;

  const project = day.projects.find((p) => p.id === task.projectId);
  const repeat = day.recurrences.find((r) => r.id === task.recurrenceId);

  const notices: Record<string, string> = {
    sleep: 'Paused for sleep. Resume when you’re ready.',
    quit: 'Paused when you quit. Time while closed was not counted.',
    interrupted: 'Interrupted session recovered. Only saved focus time was kept.',
    paused: 'Paused. Resume when you’re ready.',
  };

  return (
    <main
      className={`focus-screen ${isRunning ? 'is-running' : ''}`}
      data-testid="focus-screen"
      aria-label="Focus view"
    >
      <header className="focus-screen-header">
        <button
          className="button secondary focus-exit-btn"
          aria-label="Exit Focus view"
          title="Exit Focus · Esc"
          onClick={onExit}
        >
          <Icon name="left" size={15} />
          <span>Exit Focus</span>
        </button>

        {eligibleTasks.length > 1 && (
          <div className="focus-task-navigation" aria-label="Focus task switcher">
            <button
              className="icon-button"
              aria-label="Previous focus task"
              title="Previous task"
              disabled={!hasPrev || busy}
              onClick={() => {
                const prevTask = eligibleTasks[currentIndex - 1];
                if (hasPrev && prevTask) onSelectTask(prevTask.id);
              }}
            >
              <Icon name="up" size={16} />
            </button>
            <span className="focus-task-counter">
              Task {currentIndex + 1} of {eligibleTasks.length}
            </span>
            <button
              className="icon-button"
              aria-label="Next focus task"
              title="Next task"
              disabled={!hasNext || busy}
              onClick={() => {
                const nextTask = eligibleTasks[currentIndex + 1];
                if (hasNext && nextTask) onSelectTask(nextTask.id);
              }}
            >
              <Icon name="down" size={16} />
            </button>
          </div>
        )}
      </header>

      <div className="focus-screen-container">
        <div className="focus-screen-tags">
          <span className="focus-date-tag">
            <Icon name="calendar" size={13} />
            <span>
              {task.plannedDate === day.today
                ? 'Today'
                : task.plannedDate
                ? dateLabel(task.plannedDate, { month: 'short', day: 'numeric' })
                : 'Backlog'}
            </span>
          </span>

          {project && (
            <span className="focus-project-tag" title={project.title}>
              <i style={{ color: project.color }}>#</i>
              <span>{project.title}</span>
            </span>
          )}

          {task.deadline && (
            <span className={`focus-deadline-tag ${task.deadline < day.today && !task.completed ? 'overdue' : ''}`}>
              <Icon name="clock" size={13} />
              <span>
                {task.deadline < day.today && !task.completed ? 'Overdue · ' : 'Due '}
                {dateLabel(task.deadline, { month: 'short', day: 'numeric' })}
              </span>
            </span>
          )}

          {repeat && (
            <span className="focus-repeat-tag" title="Recurring task">
              <Icon name="repeat" size={13} />
            </span>
          )}
        </div>

        <h1 className="focus-screen-title">{task.title}</h1>

        <div className="focus-screen-notes">
          {task.notes ? (
            <p className="focus-notes-text">{task.notes}</p>
          ) : (
            <p className="focus-notes-placeholder">No notes for this task.</p>
          )}
        </div>

        <div className="focus-screen-timer-card">
          <div className="focus-timer-display-row">
            <div className="focus-elapsed-block">
              <span className="focus-time-label">
                {isRunning ? 'FOCUSING' : isThisTaskFocused ? 'FOCUS PAUSED' : 'ELAPSED TIME'}
              </span>
              <strong data-testid="focus-elapsed" className="focus-elapsed-value">
                {formatElapsed(actualMs)}
              </strong>
            </div>

            <div className="focus-planned-block">
              <span className="focus-time-label">PLANNED DURATION</span>
              <span className="focus-planned-value">
                {formatDuration(task.plannedMinutes)}
                {overrun && <span className="focus-overrun-label"> · over estimate</span>}
              </span>
            </div>
          </div>

          {!isRunning && isThisTaskFocused && day.focus?.reason && (
            <div className="focus-status-notice" role="status">
              {notices[day.focus.reason] ?? 'Paused. Resume when you’re ready.'}
            </div>
          )}

          {runningElsewhereTask && (
            <div className="focus-running-notice" role="status">
              Another task (<strong>{runningElsewhereTask.title}</strong>) is currently focusing.
              Starting focus here will switch to this task.
            </div>
          )}
        </div>

        <div className="focus-screen-controls">
          {isRunning ? (
            <button
              className="button secondary focus-action-btn"
              onClick={() => onPause(task.id)}
              disabled={busy}
            >
              <Icon name="pause" size={15} />
              <span>Pause focus</span>
            </button>
          ) : isThisTaskFocused ? (
            <button
              className="button primary focus-action-btn"
              onClick={() => onStart(task.id)}
              disabled={busy}
            >
              <Icon name="play" size={15} />
              <span>Resume focus</span>
            </button>
          ) : (
            <button
              className="button primary focus-action-btn"
              onClick={() => onStart(task.id)}
              disabled={busy || !canFocus}
              title={
                !canFocus
                  ? !task.plannedDate || task.plannedDate !== day.today
                    ? 'Assign this task to today to start focus'
                    : 'Completed tasks cannot be focused'
                  : 'Start focus timer'
              }
            >
              <Icon name="play" size={15} />
              <span>Start focus</span>
            </button>
          )}

          <button
            className="button secondary focus-action-btn"
            onClick={() => onComplete(task.id, !task.completed)}
            disabled={busy}
          >
            <Icon name="check" size={15} />
            <span>{task.completed ? 'Reopen task' : 'Complete task'}</span>
          </button>

          <button
            className="button secondary focus-action-btn"
            onClick={(e) => onEdit(task, e.currentTarget)}
            disabled={busy}
          >
            <Icon name="note" size={15} />
            <span>Edit task</span>
          </button>
        </div>

        {!canFocus && !isThisTaskFocused && (
          <div className="focus-ineligible-hint">
            {!task.plannedDate || task.plannedDate !== day.today
              ? 'Assign this task to today before starting focus.'
              : task.completed
              ? 'Choose an incomplete task to focus on.'
              : 'This task cannot be focused.'}
          </div>
        )}

        {error && (
          <div className="focus-screen-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
