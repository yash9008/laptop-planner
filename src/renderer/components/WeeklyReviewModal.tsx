import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerDay } from '../../shared/contracts';
import { formatDuration } from '../../shared/task-input';
import { Icon } from './Icon';

export function WeeklyReviewModal({
  day,
  isOpen,
  onClose,
  onComplete,
}: {
  day: PlannerDay;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reflection, setReflection] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Collect all tasks across the 7-day board
  const allBoardTasks = day.board.flatMap((col) => col.tasks);
  const completedTasks = allBoardTasks.filter((t) => t.completed);
  const totalCompletedMinutes = completedTasks.reduce(
    (acc, t) => acc + (t.actualMinutes || t.plannedMinutes || 0),
    0
  );

  // Group by project
  const projectStats: { id: string; title: string; color: string; count: number; minutes: number }[] = [];
  const projectMap = new Map(day.projects.map((p) => [p.id, p]));

  const uncategorizedTasks = completedTasks.filter((t) => !t.projectId || !projectMap.has(t.projectId));
  if (uncategorizedTasks.length > 0) {
    projectStats.push({
      id: 'uncategorized',
      title: 'General / No Project',
      color: '#8e8e93',
      count: uncategorizedTasks.length,
      minutes: uncategorizedTasks.reduce((acc, t) => acc + (t.actualMinutes || t.plannedMinutes || 0), 0),
    });
  }

  for (const project of day.projects) {
    const tasksForProj = completedTasks.filter((t) => t.projectId === project.id);
    if (tasksForProj.length > 0) {
      projectStats.push({
        id: project.id,
        title: project.title,
        color: project.color,
        count: tasksForProj.length,
        minutes: tasksForProj.reduce((acc, t) => acc + (t.actualMinutes || t.plannedMinutes || 0), 0),
      });
    }
  }

  const weekStartDate = day.board[0]?.date || day.date;

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    const saved = localStorage.getItem(`laptop_planner_weekly_reflection_${weekStartDate}`);
    if (saved) setReflection(saved);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, weekStartDate, onClose]);

  if (!isOpen) return null;

  const handleSaveReflection = () => {
    if (reflection.trim()) {
      localStorage.setItem(`laptop_planner_weekly_reflection_${weekStartDate}`, reflection.trim());
    }
  };

  return createPortal(
    <div className="ritual-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="ritual-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Weekly review"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ritual-header">
          <div className="ritual-title-group">
            <span className="ritual-icon-badge sparkle">
              <Icon name="sparkle" size={20} />
            </span>
            <div>
              <h2>Weekly Review</h2>
              <p className="ritual-subtitle">Week of {weekStartDate} · Reflection ritual</p>
            </div>
          </div>
          <div className="ritual-steps">
            <span className={`step-dot ${step >= 1 ? 'active' : ''}`}>1. Summary</span>
            <span className={`step-dot ${step >= 2 ? 'active' : ''}`}>2. Reflection</span>
            <span className={`step-dot ${step >= 3 ? 'active' : ''}`}>3. Finished</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close weekly review">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="ritual-body">
          {step === 1 && (
            <div className="ritual-step-content">
              <h3>Week at a glance</h3>
              <p>Here is what you accomplished across your board this week:</p>

              <div className="ritual-capacity-card">
                <div className="capacity-stat">
                  <span>Completed tasks</span>
                  <strong>{completedTasks.length}</strong>
                </div>
                <div className="capacity-stat">
                  <span>Total focus time</span>
                  <strong>{formatDuration(totalCompletedMinutes)}</strong>
                </div>
                <div className="capacity-stat">
                  <span>Active projects</span>
                  <strong>{projectStats.length}</strong>
                </div>
              </div>

              {projectStats.length > 0 && (
                <div className="ritual-task-list compact">
                  <h4>Time by project:</h4>
                  {projectStats.map((p) => (
                    <div key={p.id} className="ritual-task-row">
                      <span className="task-title-text">
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: p.color,
                            marginRight: 8,
                          }}
                        />
                        {p.title} ({p.count} tasks)
                      </span>
                      <span className="duration-badge">{formatDuration(p.minutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="ritual-step-content">
              <h3>Reflect on your week</h3>
              <p>What went well? What could have gone better? What are your key priorities for next week?</p>
              <textarea
                className="ritual-textarea"
                rows={6}
                placeholder="Write your weekly review and thoughts..."
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
              />
            </div>
          )}

          {step === 3 && (
            <div className="ritual-step-content">
              <div className="ritual-finish-card">
                <div className="finish-icon sparkle">
                  <Icon name="sparkle" size={36} />
                </div>
                <h3>Weekly review complete!</h3>
                <p>
                  You’ve stepped back, reviewed your progress, and aligned your focus. Have a restful weekend or a productive start to next week!
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
            {step < 3 ? (
              <button
                className="toolbar-button primary-btn"
                onClick={() => {
                  if (step === 2) handleSaveReflection();
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
                Finish review
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
