import { useEffect, useMemo, useRef } from 'react';
import type { PlannerDay, PlannerTask } from '../../shared/contracts';
import { dateLabel, formatDuration } from '../../shared/task-input';
import { Icon } from './Icon';

export interface SearchPanelProps {
  day: PlannerDay | null;
  query: string;
  onQueryChange(query: string): void;
  onOpenTask(task: PlannerTask, originatingEl?: HTMLElement): void;
  onToggleComplete(task: PlannerTask): void;
  onClose(): void;
  busy?: boolean;
}

export function SearchPanel({
  day,
  query,
  onQueryChange,
  onOpenTask,
  onToggleComplete,
  onClose,
  busy = false,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!day || !trimmed) return [];
    const all = day.allTasks ?? [];
    const projectMap = new Map((day.projects ?? []).map((p) => [p.id, p.title.toLowerCase()]));

    const matches = all.filter((task) => {
      const projTitle = task.projectId ? projectMap.get(task.projectId) ?? '' : '';
      const text = `${task.title} ${task.notes || ''} ${projTitle}`.toLowerCase();
      return text.includes(trimmed);
    });

    // Deterministic sorting:
    // 1. Incomplete first, completed second
    // 2. Dated tasks sorted by plannedDate ascending, then backlog (null)
    // 3. Tie-break by title, then task ID
    return matches.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      if (a.plannedDate !== b.plannedDate) {
        if (a.plannedDate === null) return 1;
        if (b.plannedDate === null) return -1;
        return a.plannedDate.localeCompare(b.plannedDate);
      }
      const titleCompare = a.title.localeCompare(b.title);
      if (titleCompare !== 0) return titleCompare;
      return a.id.localeCompare(b.id);
    });
  }, [day, trimmed]);

  return (
    <aside className="search-panel utility-panel" data-testid="search-panel" aria-label="Search">
      <div className="panel-header">
        <div className="panel-title-wrap">
          <Icon name="search" size={17} />
          <h2>Search</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close search panel"
          title="Close search panel"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="panel-scope-badge">
        <span>All tasks · ignores view filters</span>
      </div>

      <div className="search-panel-input-wrap">
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search all tasks"
          placeholder="Search all tasks across days and backlog…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search query"
            title="Clear query"
            onClick={() => onQueryChange('')}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      <div className="search-result-count" role="status" aria-live="polite">
        {trimmed ? `${results.length} ${results.length === 1 ? 'task found' : 'tasks found'}` : 'Type to search tasks'}
      </div>

      <div className="panel-body search-panel-body" role="list">
        {!trimmed ? (
          <div className="panel-empty-state">
            <Icon name="search" size={28} />
            <h3>Search across your planner</h3>
            <p>Find tasks by title, notes, or project name from any day or your backlog.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="panel-empty-state">
            <h3>No tasks match “{query.trim()}”</h3>
            <p>Check the spelling or try searching for another keyword.</p>
          </div>
        ) : (
          results.map((task) => {
            const project = day?.projects.find((p) => p.id === task.projectId);
            const dateText = task.plannedDate
              ? task.plannedDate === day?.today
                ? 'Today'
                : dateLabel(task.plannedDate, { month: 'short', day: 'numeric' })
              : 'Backlog';

            return (
              <article
                key={task.id}
                className={`search-result-item ${task.completed ? 'completed-task' : ''}`}
                data-task-id={task.id}
                data-testid="search-result-item"
              >
                <input
                  type="checkbox"
                  className="task-checkbox"
                  checked={task.completed}
                  aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`}
                  disabled={busy}
                  onChange={() => onToggleComplete(task)}
                />
                <button
                  type="button"
                  className="search-result-main"
                  aria-label={`Open ${task.title}`}
                  onClick={(e) => onOpenTask(task, e.currentTarget)}
                  disabled={busy}
                >
                  <div className="search-result-headline">
                    <span className="search-result-title">{task.title}</span>
                  </div>
                  <div className="search-result-meta">
                    <span className={`search-result-date ${task.plannedDate ? 'dated' : 'backlog'}`}>
                      {dateText}
                    </span>
                    {project && (
                      <span className="search-result-project" title={`Project: ${project.title}`}>
                        {project.title}
                      </span>
                    )}
                    {task.plannedMinutes > 0 && (
                      <span className="search-result-estimate">{formatDuration(task.plannedMinutes)}</span>
                    )}
                  </div>
                  {task.notes && (
                    <p className="search-result-notes" title={task.notes}>
                      {task.notes}
                    </p>
                  )}
                </button>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
