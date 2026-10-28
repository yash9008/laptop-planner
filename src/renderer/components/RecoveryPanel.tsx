import { useEffect, useRef } from 'react';
import type { PlannerDay, PlannerTask } from '../../shared/contracts';
import { formatElapsed } from '../../shared/task-input';
import { Icon } from './Icon';

export interface RecoveryPanelProps {
  day: PlannerDay | null;
  error: string | null;
  busy?: boolean;
  onRefresh(): void;
  onResumeFocus(taskId: string): void;
  onOpenTask(task: PlannerTask, originatingEl?: HTMLElement): void;
  onOpenStorage(): void;
  onClose(): void;
}

export function RecoveryPanel({
  day,
  error,
  busy = false,
  onRefresh,
  onResumeFocus,
  onOpenTask,
  onOpenStorage,
  onClose,
}: RecoveryPanelProps) {
  const focus = day?.focus;
  const isFocusRecovered = Boolean(
    focus && !focus.running && focus.reason && ['sleep', 'quit', 'interrupted'].includes(focus.reason)
  );
  const isFocusPaused = Boolean(focus && !focus.running && focus.taskId);
  const hasFocusSession = Boolean(focus?.taskId && (isFocusRecovered || isFocusPaused || focus?.running));
  const focusedTask = hasFocusSession && focus?.taskId
    ? day?.allTasks.find((t) => t.id === focus.taskId) ?? null
    : null;

  const isHealthy = !error && !isFocusRecovered && !isFocusPaused && day !== null;

  const panelRef = useRef<HTMLElement | null>(null);

  // Focus the panel on mount so palette and rail entry do not leave focus on
  // BODY once the trigger unmounts or the palette closes.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      className="recovery-panel utility-panel"
      data-testid="recovery-panel"
      aria-label="Recovery and storage"
      ref={(node) => {
        panelRef.current = node;
      }}
      tabIndex={-1}
    >
      <div className="panel-header">
        <div className="panel-title-wrap">
          <Icon name="storage" size={17} />
          <h2>Recovery & Storage</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close recovery panel"
          title="Close recovery panel"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="panel-body recovery-panel-body">
        {/* Error / Read-Write Storage Alert */}
        {error && (
          <div className="recovery-section recovery-error-card" role="alert">
            <div className="recovery-section-header">
              <span className="status-dot warning" />
              <h3>Storage needs attention</h3>
            </div>
            <p className="recovery-error-message">{error}</p>
            <div className="recovery-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={onRefresh}
              >
                Refresh day
              </button>
            </div>
          </div>
        )}

        {/* Day snapshot missing on startup */}
        {!day && !error && (
          <div className="recovery-section recovery-loading-card">
            <h3>Loading snapshot</h3>
            <p>Waiting for the local database to respond…</p>
            <div className="recovery-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={onRefresh}
              >
                Refresh planner
              </button>
            </div>
          </div>
        )}

        {/* Focus Timer Session (Paused or Recovered) */}
        {focus && (isFocusRecovered || isFocusPaused) && (
          <div className="recovery-section recovery-focus-card">
            <div className="recovery-section-header">
              <Icon name="focus" size={16} />
              <h3>{isFocusRecovered ? 'Recovered focus session' : 'Paused focus session'}</h3>
            </div>
            <div className="recovery-focus-details">
              {focusedTask ? (
                <div className="recovery-focus-task">
                  <strong className="recovery-focus-title">{focusedTask.title}</strong>
                  <span className="recovery-focus-elapsed">
                    Elapsed: {formatElapsed(focus.actualMilliseconds)}
                  </span>
                </div>
              ) : (
                <p className="recovery-focus-missing">Focused task record</p>
              )}
              {focus.reason && (
                <p className="recovery-focus-reason">
                  Status reason: <em>{focus.reason}</em>
                </p>
              )}
            </div>
            <div className="recovery-actions">
              {focus.taskId && (
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => onResumeFocus(focus.taskId)}
                >
                  Resume timer
                </button>
              )}
              {focusedTask && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={(e) => onOpenTask(focusedTask, e.currentTarget)}
                >
                  Open task
                </button>
              )}
            </div>
          </div>
        )}

        {/* Healthy State */}
        {isHealthy && (
          <div className="recovery-section recovery-healthy-card">
            <div className="recovery-section-header">
              <span className="status-dot" />
              <h3>Everything is healthy</h3>
            </div>
            <p>
              No recovered focus sessions or storage errors. All planner data is stored locally in
              SQLite on this Mac.
            </p>
          </div>
        )}

        {/* Storage and Backup Management */}
        <div className="recovery-section recovery-tools-card">
          <div className="recovery-section-header">
            <Icon name="settings" size={16} />
            <h3>Database & Backups</h3>
          </div>
          <p className="recovery-tools-intro">
            Manage local database files, export safety copies, or restore from a validated local
            backup.
          </p>
          <div className="recovery-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onOpenStorage}
            >
              <Icon name="storage" size={14} />
              <span>Open storage tools</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
