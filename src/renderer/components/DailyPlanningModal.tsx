import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerDay, PlannerTask, SaveTaskInput } from '../../shared/contracts';
import { formatDuration } from '../../shared/task-input';
import { Icon } from './Icon';

export function DailyPlanningModal({
  day,
  isOpen,
  onClose,
  onUpdateTask,
  onComplete,
}: {
  day: PlannerDay;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTask: (task: PlannerTask, patch: Partial<SaveTaskInput> & { completed?: boolean }) => Promise<void>;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [newTitle, setNewTitle] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const leftoverTasks = day.allTasks.filter(
    (task) => task.plannedDate && task.plannedDate < day.date && !task.completed
  );
  const backlogTasks = day.backlog.slice(0, 12);
  const todayTasks = day.tasks.filter((task) => !task.completed);
  const plannedMinutes = todayTasks.reduce((acc, task) => acc + (task.plannedMinutes || 0), 0);
  const workdayMinutes = Math.max(0, day.dailyHours.endMinute - day.dailyHours.startMinute);

  useEffect(() => {
    if (!isOpen) return;
    setStep(leftoverTasks.length > 0 ? 1 : 2);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, leftoverTasks.length, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="ritual-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="ritual-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Daily planning"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ritual-header">
          <div className="ritual-title-group">
            <span className="ritual-icon-badge sun">
              <Icon name="sun" size={20} />
            </span>
            <div>
              <h2>Plan your day</h2>
              <p className="ritual-subtitle">{day.date} · Morning ritual</p>
            </div>
          </div>
          <div className="ritual-steps">
            <span className={`step-dot ${step >= 1 ? 'active' : ''}`}>1. Leftovers</span>
            <span className={`step-dot ${step >= 2 ? 'active' : ''}`}>2. Select tasks</span>
            <span className={`step-dot ${step >= 3 ? 'active' : ''}`}>3. Capacity</span>
            <span className={`step-dot ${step >= 4 ? 'active' : ''}`}>4. Timeline</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close daily planning">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="ritual-body">
          {step === 1 && (
            <div className="ritual-step-content">
              <h3>Review leftover tasks</h3>
              <p>These tasks were planned for previous days but not completed. Decide what to do with them:</p>
              {leftoverTasks.length === 0 ? (
                <div className="ritual-empty">
                  <Icon name="sun" size={32} />
                  <p>No leftover tasks from yesterday. You are starting today with a fresh board!</p>
                </div>
              ) : (
                <div className="ritual-task-list">
                  {leftoverTasks.map((task) => (
                    <div key={task.id} className="ritual-task-row">
                      <div className="task-info">
                        <strong>{task.title}</strong>
                        <span className="task-subtext">Planned for {task.plannedDate} · {formatDuration(task.plannedMinutes)}</span>
                      </div>
                      <div className="task-actions">
                        <button
                          className="ritual-action-btn primary"
                          onClick={() => onUpdateTask(task, { plannedDate: day.date })}
                        >
                          Plan for today
                        </button>
                        <button
                          className="ritual-action-btn"
                          onClick={() => onUpdateTask(task, { plannedDate: null })}
                        >
                          To backlog
                        </button>
                        <button
                          className="ritual-action-btn"
                          onClick={() => onUpdateTask(task, { completed: true })}
                        >
                          Mark done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="ritual-step-content">
              <h3>Select tasks for today</h3>
              <p>Pull high-priority tasks from your backlog or add new ones for today:</p>
              
              <div className="ritual-inline-add">
                <input
                  type="text"
                  placeholder="Add a new task for today (press Enter)..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newTitle.trim()) {
                      await window.planner.saveTask({
                        id: crypto.randomUUID(),
                        create: true,
                        title: newTitle.trim(),
                        notes: '',
                        plannedDate: day.date,
                        plannedMinutes: 45,
                        projectId: null,
                        viewDate: day.date,
                      });
                      setNewTitle('');
                    }
                  }}
                />
              </div>

              <div className="ritual-task-list">
                <h4>Backlog candidates:</h4>
                {backlogTasks.length === 0 ? (
                  <p className="ritual-subtext">Backlog is empty.</p>
                ) : (
                  backlogTasks.map((task) => (
                    <div key={task.id} className="ritual-task-row">
                      <div className="task-info">
                        <strong>{task.title}</strong>
                        <span className="task-subtext">{formatDuration(task.plannedMinutes)}</span>
                      </div>
                      <button
                        className="ritual-action-btn primary"
                        onClick={() => onUpdateTask(task, { plannedDate: day.date })}
                      >
                        + Add to today
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="ritual-step-content">
              <h3>Check workload capacity</h3>
              <p>Compare planned work with your available daily hours:</p>
              
              <div className="ritual-capacity-card">
                <div className="capacity-stat">
                  <span>Planned work</span>
                  <strong>{formatDuration(plannedMinutes)}</strong>
                </div>
                <div className="capacity-stat">
                  <span>Workday hours</span>
                  <strong>{formatDuration(workdayMinutes)}</strong>
                </div>
                <div className="capacity-stat">
                  <span>Remaining room</span>
                  <strong>{formatDuration(Math.max(0, workdayMinutes - plannedMinutes))}</strong>
                </div>
              </div>

              <div className="ritual-progress-track">
                <div
                  className={`track-fill ${plannedMinutes > workdayMinutes ? 'overdue' : ''}`}
                  style={{ width: `${Math.min(100, (plannedMinutes / (workdayMinutes || 1)) * 100)}%` }}
                />
              </div>

              {plannedMinutes > workdayMinutes && (
                <div className="ritual-warning-banner">
                  <Icon name="clock" size={16} />
                  <span>You have planned {formatDuration(plannedMinutes - workdayMinutes)} more than your workday hours. Consider moving less critical tasks to tomorrow.</span>
                </div>
              )}

              <div className="ritual-task-list compact">
                <h4>Today’s planned tasks ({todayTasks.length}):</h4>
                {todayTasks.map((task) => (
                  <div key={task.id} className="ritual-task-row">
                    <span className="task-title-text">{task.title}</span>
                    <span className="duration-badge">{formatDuration(task.plannedMinutes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="ritual-step-content">
              <div className="ritual-finish-card">
                <div className="finish-icon sun">
                  <Icon name="sun" size={36} />
                </div>
                <h3>Your day is planned!</h3>
                <p>
                  You have {todayTasks.length} tasks ready totaling {formatDuration(plannedMinutes)}. Focus on one task at a time.
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="ritual-footer">
          {step > 1 && (
            <button className="toolbar-button" onClick={() => setStep((s) => (s - 1) as any)}>
              Back
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {step < 4 ? (
              <button
                className="toolbar-button primary-btn"
                onClick={() => setStep((s) => (s + 1) as any)}
              >
                Continue
              </button>
            ) : (
              <button
                className="toolbar-button primary-btn"
                onClick={() => {
                  onComplete();
                  onClose();
                }}
              >
                Complete planning
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
