import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PlannerTask, PlannerProject, RecurringTemplate } from '../../shared/contracts';
import { WEEKDAYS } from '../../shared/task-input';
import type { TaskDraft } from '../drafts';
import { Icon } from './Icon';
import { EstimatePopover } from './EstimatePopover';

export function TaskEditor({
  task,
  draft,
  projects = [],
  template,
  busy = false,
  isDirty = false,
  onDraftChange,
  onDismiss,
  onDiscard,
  onSave,
}: {
  task: PlannerTask | null;
  draft: TaskDraft;
  projects?: PlannerProject[];
  template?: RecurringTemplate;
  busy?: boolean;
  isDirty?: boolean;
  onDraftChange(updated: TaskDraft): void;
  onDismiss(): void;
  onDiscard(): void;
  onSave(): Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [estimatePopoverOpen, setEstimatePopoverOpen] = useState(false);
  const estimateAnchorRef = useRef<HTMLButtonElement>(null);

  function closeEstimatePopover() {
    setEstimatePopoverOpen(false);
    estimateAnchorRef.current?.focus({ preventScroll: true });
  }

  const prevEstimatePopoverOpen = useRef(false);
  useEffect(() => {
    if (prevEstimatePopoverOpen.current && !estimatePopoverOpen) {
      estimateAnchorRef.current?.focus({ preventScroll: true });
    }
    prevEstimatePopoverOpen.current = estimatePopoverOpen;
  }, [estimatePopoverOpen]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (busy) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (estimatePopoverOpen) {
          event.preventDefault();
          event.stopPropagation();
          closeEstimatePopover();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
        return;
      }

      if (event.key === 'Tab' && !estimatePopoverOpen) {
        const container = containerRef.current;
        if (!container) return;
        const focusableSelector = [
          'button:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
        ].join(', ');
        const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          (el) => el.offsetParent !== null || el.getClientRects().length > 0
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }

        if (event.shiftKey) {
          if (document.activeElement === first || !container.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !container.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [busy, estimatePopoverOpen, onDismiss]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    await onSave();
  }

  return (
    <>
      <div
        className="task-editor-backdrop"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          if (estimatePopoverOpen) {
            closeEstimatePopover();
            return;
          }
          onDismiss();
        }}
      />
      <div
        ref={containerRef}
        className="task-editor-container"
        role="dialog"
        aria-label={task ? 'Edit task' : 'New task'}
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="task-editor-header">
          <h2>{task ? 'Edit task' : 'New task'}</h2>
          <div className="task-editor-header-actions">
            {isDirty && (
              <button
                type="button"
                className="button tertiary discard-btn"
                aria-label={task ? 'Discard changes' : 'Discard draft'}
                title="Discard uncommitted changes"
                onClick={() => {
                  if (busy) return;
                  onDiscard();
                }}
                disabled={busy}
              >
                {task ? 'Discard changes' : 'Discard draft'}
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Close dialog"
              title="Close"
              onClick={() => {
                if (busy) return;
                onDismiss();
              }}
              disabled={busy}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        </div>

        <form className="task-form task-editor-form" onSubmit={handleSubmit} noValidate>
          <label>
            Task title
            <input
              aria-label="Task title"
              autoFocus
              maxLength={200}
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value, error: null })}
              placeholder="What would you like to work on?"
              disabled={busy}
            />
          </label>

          <div className="form-row">
            <label className="estimate-label">
              Estimated time
              <div className="estimate-input-wrapper">
                <input
                  aria-label="Estimated time"
                  value={draft.estimate}
                  onChange={(e) => onDraftChange({ ...draft, estimate: e.target.value, error: null })}
                  placeholder="45m, 2h, or 1h 30m"
                  disabled={busy}
                />
                <button
                  ref={estimateAnchorRef}
                  type="button"
                  className="icon-button estimate-trigger-btn"
                  aria-label="Choose estimate preset"
                  title="Planned time presets"
                  onClick={() => {
                    if (busy) return;
                    setEstimatePopoverOpen(!estimatePopoverOpen);
                  }}
                  disabled={busy}
                >
                  <Icon name="clock" size={15} />
                </button>
              </div>
              <small>Bare numbers mean minutes.</small>
            </label>

            <label>
              Day
              <input
                aria-label="Day"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.plannedDate ?? ''}
                onChange={(e) => onDraftChange({ ...draft, plannedDate: e.target.value, error: null })}
                disabled={busy || draft.backlog}
              />
            </label>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              aria-label="Keep in backlog"
              checked={draft.backlog}
              onChange={(e) => onDraftChange({ ...draft, backlog: e.target.checked, error: null })}
              disabled={busy}
            />
            Keep in backlog <small>Unscheduled until you choose a day.</small>
          </label>

          <div className="form-row">
            <label>
              Project
              <select
                aria-label="Project"
                value={draft.projectId}
                onChange={(e) => onDraftChange({ ...draft, projectId: e.target.value, error: null })}
                disabled={busy}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Deadline <span className="optional">optional</span>
              <input
                aria-label="Task deadline"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.deadline}
                onChange={(e) => onDraftChange({ ...draft, deadline: e.target.value, error: null })}
                disabled={busy}
              />
            </label>
          </div>

          {template ? (
            <div className="repeat-details">
              <p>
                <Icon name="repeat" size={13} />
                {template.stoppedOn
                  ? 'Future repeats stopped.'
                  : template.weekdays.length === 7
                  ? 'Repeats daily.'
                  : `Repeats ${template.weekdays.map((day) => WEEKDAYS[day]).join(', ')}.`}{' '}
                Changes here affect only this occurrence.
              </p>
              {!template.stoppedOn && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    aria-label="Stop future repeats"
                    checked={draft.stopRepeats}
                    onChange={(e) => onDraftChange({ ...draft, stopRepeats: e.target.checked, error: null })}
                    disabled={busy}
                  />
                  Stop future repeats<small>Keep today, past, moved, and worked occurrences.</small>
                </label>
              )}
            </div>
          ) : (
            <>
              <label>
                Repeat
                <select
                  aria-label="Repeat task"
                  value={draft.repeat}
                  onChange={(e) => onDraftChange({ ...draft, repeat: e.target.value, error: null })}
                  disabled={busy || draft.backlog}
                >
                  <option value="never">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Selected weekdays</option>
                </select>
                <small>Each date gets its own task and focus time. Choose a day to enable repeats.</small>
              </label>
              {draft.repeat === 'weekdays' && (
                <fieldset className="weekday-picker">
                  <legend>Repeat on</legend>
                  {WEEKDAYS.map((label, index) => (
                    <label key={label}>
                      <input
                        aria-label={`Repeat on ${label}`}
                        type="checkbox"
                        checked={draft.weekdays.includes(index)}
                        onChange={(e) =>
                          onDraftChange({
                            ...draft,
                            weekdays: e.target.checked
                              ? [...draft.weekdays, index]
                              : draft.weekdays.filter((d) => d !== index),
                            error: null,
                          })
                        }
                        disabled={busy}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}

          <label>
            Notes <span className="optional">optional</span>
            <textarea
              aria-label="Notes"
              rows={4}
              maxLength={20000}
              value={draft.notes}
              onChange={(e) => onDraftChange({ ...draft, notes: e.target.value, error: null })}
              placeholder="A few details, a link, or your next step…"
              disabled={busy}
            />
          </label>

          {draft.error && (
            <p className="form-error" role="alert">
              {draft.error}
            </p>
          )}

          <div className="modal-actions task-editor-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                if (busy) return;
                onDismiss();
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Saving…' : task ? 'Save changes' : draft.backlog ? 'Add to backlog' : 'Add to day'}
            </button>
          </div>
        </form>

        {estimatePopoverOpen && (
          <EstimatePopover
            anchor={estimateAnchorRef.current}
            initialValue={draft.estimate}
            busy={busy}
            onSelect={(_minutes, formatted) => {
              onDraftChange({ ...draft, estimate: formatted, error: null });
              closeEstimatePopover();
            }}
            onDismiss={closeEstimatePopover}
          />
        )}
      </div>
    </>
  );
}
