import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { PlannerProject } from '../../shared/contracts';
import type { TaskDraft } from '../drafts';
import { Icon } from './Icon';
import { EstimatePopover } from './EstimatePopover';

export function QuickAddComposer({
  draft,
  projects,
  busy,
  onDraftChange,
  onOpenFullDetails,
  onDiscard,
  onDismiss,
  onSubmit,
}: {
  draft: TaskDraft;
  projects: PlannerProject[];
  busy: boolean;
  onDraftChange(draft: TaskDraft): void;
  onOpenFullDetails(): void;
  onDiscard(): void;
  onDismiss(): void;
  onSubmit(): Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const estimateAnchorRef = useRef<HTMLButtonElement>(null);
  const [estimatePopoverOpen, setEstimatePopoverOpen] = useState(false);

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
    // Focus title on mount
    titleInputRef.current?.focus();
  }, []);

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

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    void onSubmit();
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (busy) return;
      void onSubmit();
    }
  }

  function handleEstimateKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (busy) return;
      void onSubmit();
    }
  }

  const isDirty = Boolean(draft.title.trim() || draft.estimate.trim() || draft.notes.trim());

  return (
    <>
      <div
        className="quick-add-backdrop"
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
        className="quick-add-container"
        role="dialog"
        aria-label="New task"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="quick-add-form" onSubmit={handleFormSubmit} noValidate>
          <div className="quick-add-title-row">
            <input
              ref={titleInputRef}
              type="text"
              aria-label="Task title"
              placeholder="What would you like to work on?"
              maxLength={200}
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value, error: null })}
              onKeyDown={handleTitleKeyDown}
              disabled={busy}
              autoFocus
            />
            <button
              type="button"
              className="icon-button quick-add-close-btn"
              aria-label="Close dialog"
              title="Close"
              onClick={() => {
                if (busy) return;
                onDismiss();
              }}
              disabled={busy}
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="quick-add-controls-row">
            <div className="quick-add-estimate-field">
              <input
                type="text"
                aria-label="Estimated time"
                placeholder="45m, 2h..."
                value={draft.estimate}
                onChange={(e) => onDraftChange({ ...draft, estimate: e.target.value, error: null })}
                onKeyDown={handleEstimateKeyDown}
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
                <Icon name="clock" size={14} />
              </button>
            </div>

            <label className="quick-add-day-label">
              <input
                type="date"
                aria-label="Day"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.plannedDate ?? ''}
                disabled={busy || draft.backlog}
                onChange={(e) => onDraftChange({ ...draft, plannedDate: e.target.value, error: null })}
              />
            </label>

            <label className="checkbox-label quick-add-backlog-toggle">
              <input
                type="checkbox"
                aria-label="Keep in backlog"
                checked={draft.backlog}
                disabled={busy}
                onChange={(e) => onDraftChange({ ...draft, backlog: e.target.checked, error: null })}
              />
              <span>Backlog</span>
            </label>

            <label className="quick-add-project-label">
              <select
                aria-label="Project"
                value={draft.projectId}
                disabled={busy}
                onChange={(e) => onDraftChange({ ...draft, projectId: e.target.value, error: null })}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {draft.error && (
            <p className="form-error quick-add-error" role="alert">
              {draft.error}
            </p>
          )}

          <div className="quick-add-actions-row">
            <div className="quick-add-left-actions">
              <button
                type="button"
                className="button tertiary full-details-btn"
                aria-label="Open full details"
                title="Expand full editor details"
                onClick={() => {
                  if (busy) return;
                  onOpenFullDetails();
                }}
                disabled={busy}
              >
                <Icon name="note" size={14} />
                <span>Full details</span>
              </button>
              {isDirty && (
                <button
                  type="button"
                  className="button tertiary discard-btn"
                  aria-label="Discard draft"
                  title="Discard this uncommitted draft"
                  onClick={() => {
                    if (busy) return;
                    onDiscard();
                  }}
                  disabled={busy}
                >
                  Discard
                </button>
              )}
            </div>

            <div className="quick-add-right-actions">
              <button
                type="button"
                className="button secondary"
                aria-label="Cancel"
                onClick={() => {
                  if (busy) return;
                  onDismiss();
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy}
              >
                {busy ? 'Saving…' : draft.backlog ? 'Add to backlog' : 'Add to day'}
              </button>
            </div>
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
