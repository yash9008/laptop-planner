import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerDay, PlannerTask, SaveTaskInput } from '../../shared/contracts';
import { formatDuration, shiftDate } from '../../shared/task-input';
import { Icon } from './Icon';

export function DailyShutdownModal({
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
  const [reflection, setReflection] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const completedToday = day.tasks.filter((task) => task.completed);
  const incompleteToday = day.tasks.filter((task) => !task.completed);
  const totalCompletedMinutes = completedToday.reduce(
    (acc, task) => acc + (task.actualMinutes || task.plannedMinutes || 0),
    0
  );
  const tomorrow = shiftDate(day.date, 1);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    const saved = localStorage.getItem(`laptop_planner_reflection_${day.date}`);
    if (saved) setReflection(saved);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, day.date, onClose]);

  if (!isOpen) return null;

  const handleSaveReflection = () => {
    if (reflection.trim()) {
      localStorage.setItem(`laptop_planner_reflection_${day.date}`, reflection.trim());
    }
  };

  return createPortal(
    <div className="ritual-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="ritual-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Daily shutdown"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ritual-header">
          <div className="ritual-title-group">
            <span className="ritual-icon-badge moon">
              <Icon name="moon" size={20} />
            </span>
            <div>
              <h2>Shut down for the day</h2>
              <p className="ritual-subtitle">{day.date} · Evening ritual</p>
            </div>
          </div>
          <div className="ritual-steps">
            <span className={`step-dot ${step >= 1 ? 'active' : ''}`}>1. Completed</span>
            <span className={`step-dot ${step >= 2 ? 'active' : ''}`}>2. Incomplete</span>
            <span className={`step-dot ${step >= 3 ? 'active' : ''}`}>3. Reflection</span>
            <span className={`step-dot ${step >= 4 ? 'active' : ''}`}>4. Finished</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close daily shutdown">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="ritual-body">
          {step === 1 && (
            <div className="ritual-step-content">
              <h3>Celebrate your accomplishments</h3>
              <p>Take a moment to see what you wrapped up today:</p>

              <div className="ritual-capacity-card">
                <div className="capacity-stat">
                  <span>Tasks completed</span>
                  <strong>{completedToday.length}</strong>
                </div>
                <div className="capacity-stat">
                  <span>Focused time</span>
                  <strong>{formatDuration(totalCompletedMinutes)}</strong>
                </div>
              </div>

              {completedToday.length === 0 ? (
                <div className="ritual-empty">
                  <Icon name="moon" size={32} />
                  <p>No tasks marked completed today. Even a quiet day sets up tomorrow!</p>
                </div>
              ) : (
                <div className="ritual-task-list compact">
                  <h4>Completed today:</h4>
                  {completedToday.map((task) => (
                    <div key={task.id} className="ritual-task-row">
                      <span className="task-title-text done">
                        <Icon name="check" size={14} /> {task.title}
                      </span>
                      <span className="duration-badge">
                        {formatDuration(task.actualMinutes || task.plannedMinutes || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="ritual-step-content">
              <h3>Handle leftover tasks</h3>
              <p>Decide what to do with tasks left unfinished today:</p>

              {incompleteToday.length === 0 ? (
                <div className="ritual-empty">
                  <Icon name="check" size={32} />
                  <p>Inbox zero! All of today’s tasks are completed.</p>
                </div>
              ) : (
                <div className="ritual-task-list">
                  {incompleteToday.map((task) => (
                    <div key={task.id} className="ritual-task-row">
                      <div className="task-info">
                        <strong>{task.title}</strong>
                        <span className="task-subtext">{formatDuration(task.plannedMinutes)}</span>
                      </div>
                      <div className="task-actions">
                        <button
                          className="ritual-action-btn primary"
                          onClick={() => onUpdateTask(task, { plannedDate: tomorrow })}
                        >
                          Move to tomorrow
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

          {step === 3 && (
            <div className="ritual-step-content">
              <h3>Daily reflection</h3>
              <p>How did today go? Note any thoughts, wins, or takeaways:</p>
              <textarea
                className="ritual-textarea"
                rows={5}
                placeholder="Write your reflection for the day..."
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
              />
            </div>
          )}

          {step === 4 && (
            <div className="ritual-step-content">
              <div className="ritual-finish-card">
                <div className="finish-icon moon">
                  <Icon name="moon" size={36} />
                </div>
                <h3>Shutdown complete!</h3>
                <p>
                  You’ve closed out your workday cleanly. Step away, recharge, and rest easy knowing your planner is ready for tomorrow.
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
                onClick={() => {
                  if (step === 3) handleSaveReflection();
                  setStep((s) => (s + 1) as any);
                }}
              >
                Continue
              </button>
            ) : (
              <button
                className="toolbar-button primary-btn"
                onClick={() => {
                  handleSaveReflection();
                  onComplete();
                  onClose();
                }}
              >
                Finish shutdown
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
