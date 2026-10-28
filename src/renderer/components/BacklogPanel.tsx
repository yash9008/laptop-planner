import { useEffect, useRef } from 'react';
import type { PlannerDay, PlannerTask } from '../../shared/contracts';
import { formatDuration } from '../../shared/task-input';
import { Icon } from './Icon';
import type { useBoardDrag } from './BoardDrag';

export interface BacklogPanelProps {
  day: PlannerDay | null;
  busy?: boolean;
  dndHandlers?: ReturnType<typeof useBoardDrag>['handlers'];
  onOpenTask(task: PlannerTask, originatingEl?: HTMLElement): void;
  onEstimate(task: PlannerTask, anchor: HTMLElement): void;
  onOpenMenu(task: PlannerTask, anchor: HTMLElement): void;
  onToggleComplete(task: PlannerTask): void;
  onAdd(): void;
  onClose(): void;
  onMoveToBacklog?(taskId: string): void;
  selectedTaskId?: string | null;
  onSelectTask?(id: string): void;
}

export function BacklogPanel({
  day,
  busy = false,
  dndHandlers,
  onOpenTask,
  onEstimate,
  onOpenMenu,
  onToggleComplete,
  onAdd,
  onClose,
  onMoveToBacklog,
  selectedTaskId,
  onSelectTask,
}: BacklogPanelProps) {
  const backlog = day?.backlog ?? [];
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Opening the panel moves focus to the top backlog task, matching the search
  // panel's query focus. This runs on mount only so background refreshes do
  // not pull focus out of whatever the user is doing.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const firstTitle = body.querySelector<HTMLElement>('.task-card .task-title');
    if (firstTitle) {
      firstTitle.focus({ preventScroll: true });
    } else {
      body.focus({ preventScroll: true });
    }
  }, []);

  return (
    <aside
      className="backlog-panel utility-panel"
      data-testid="backlog-panel"
      aria-label="Backlog"
      data-backlog-drop="true"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('text/plain')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData('text/plain');
        if (id && !busy && onMoveToBacklog) {
          onMoveToBacklog(id);
        }
      }}
    >
      <div className="panel-header">
        <div className="panel-title-wrap">
          <Icon name="archive" size={17} />
          <h2>Backlog</h2>
          <span className="panel-count-badge">
            {backlog.length} {backlog.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close backlog panel"
          title="Close backlog panel"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="panel-action-bar">
        <button
          type="button"
          className="task-add-bar panel-add-bar"
          aria-label="Add task to backlog"
          disabled={!day || busy}
          onClick={onAdd}
        >
          <Icon name="plus" size={16} />
          <span>Add to backlog</span>
          <strong>
            {formatDuration(
              backlog.filter((t) => !t.completed).reduce((acc, t) => acc + t.plannedMinutes, 0)
            )}
          </strong>
        </button>
      </div>

      <div
        className="panel-body backlog-panel-body"
        role="list"
        ref={bodyRef}
        tabIndex={-1}
        onPointerDownCapture={dndHandlers?.onPointerDownCapture}
        onDragStartCapture={dndHandlers?.onDragStartCapture}
        onDragEndCapture={dndHandlers?.onDragEndCapture}
      >
        {backlog.length === 0 ? (
          <div className="panel-empty-state">
            <Icon name="archive" size={28} />
            <h3>No tasks in backlog</h3>
            <p>Save tasks for another day here until you are ready to schedule them.</p>
          </div>
        ) : (
          backlog.map((task) => {
            const project = day?.projects.find((p) => p.id === task.projectId);
            const estimateText = `${Math.floor(task.plannedMinutes / 60)}:${String(
              task.plannedMinutes % 60
            ).padStart(2, '0')}`;

            return (
              <article
                key={task.id}
                className={`task-card backlog-panel-card ${task.completed ? 'completed-task' : ''} ${
                  selectedTaskId === task.id ? 'is-selected' : ''
                }`}
                data-testid="backlog-panel-item"
                data-task-id={task.id}
                data-completed={task.completed}
                aria-current={selectedTaskId === task.id ? 'true' : undefined}
                draggable={!busy}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (!target.closest('button, input, textarea, select, [role="button"], [role="checkbox"]')) {
                    onSelectTask?.(task.id);
                  }
                }}
                onFocus={() => {
                  onSelectTask?.(task.id);
                }}
              >
                <div className="card-topline">
                  <span className="task-time">{project ? project.title : 'Backlog'}</span>
                  <button
                    type="button"
                    className="duration-badge"
                    aria-label={`Edit duration for ${task.title}`}
                    title={`${formatDuration(task.plannedMinutes)} planned`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEstimate(task, e.currentTarget);
                    }}
                    disabled={busy}
                  >
                    {estimateText}
                  </button>
                </div>

                <div className="task-main-row">
                  <button
                    type="button"
                    className="task-title"
                    onClick={(e) => onOpenTask(task, e.currentTarget)}
                    disabled={busy}
                  >
                    {task.title}
                  </button>
                  <button
                    type="button"
                    className="drag-handle icon-button"
                    draggable={!busy}
                    aria-label={`Drag ${task.title} to a day`}
                    title="Drag to a day"
                  >
                    <Icon name="grip" size={15} />
                  </button>
                </div>

                {task.notes && <p className="task-notes">{task.notes}</p>}

                <div className="card-footer">
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={task.completed}
                    aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`}
                    disabled={busy}
                    onChange={() => onToggleComplete(task)}
                  />
                  <div className="task-tools">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`More actions for ${task.title}`}
                      title="More actions"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenMenu(task, e.currentTarget);
                      }}
                    >
                      <Icon name="dots" size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
