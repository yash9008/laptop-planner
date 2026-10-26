import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { formatDuration, parseDuration } from '../../shared/task-input';
import { Icon } from './Icon';

export interface EstimatePreset {
  label: string;
  minutes: number;
}

export const ESTIMATE_PRESETS: EstimatePreset[] = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
  { label: '25 min', minutes: 25 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hr', minutes: 60 },
  { label: '1.5 hr', minutes: 90 },
  { label: '2 hr', minutes: 120 },
  { label: '2.5 hr', minutes: 150 },
  { label: '3 hr', minutes: 180 },
  { label: '4 hr', minutes: 240 },
  { label: '5 hr', minutes: 300 },
  { label: '6 hr', minutes: 360 },
  { label: '7 hr', minutes: 420 },
  { label: '8 hr', minutes: 480 },
];

export function EstimatePopover({
  anchor,
  initialValue = '',
  busy = false,
  error: externalError = null,
  onSelect,
  onDismiss,
}: {
  anchor: HTMLElement | null;
  initialValue?: string;
  busy?: boolean;
  error?: string | null;
  onSelect(minutes: number, formatted: string): void;
  onDismiss(): void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [customText, setCustomText] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const hasFocused = useRef(false);

  useEffect(() => {
    setCustomText(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (coords && !hasFocused.current) {
      hasFocused.current = true;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [coords]);

  useLayoutEffect(() => {
    if (!anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const panelEl = panelRef.current;
      const panelWidth = panelEl?.offsetWidth || 160;
      const panelHeight = panelEl?.offsetHeight || 380;

      let top = rect.bottom + 4;
      if (top + panelHeight > window.innerHeight - 8 && rect.top - panelHeight > 8) {
        top = Math.max(8, rect.top - panelHeight - 4);
      } else if (top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - panelHeight - 8);
      }

      let left = rect.left;
      if (left + panelWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - panelWidth - 8);
      }
      if (left < 8) left = 8;

      setCoords({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor]);

  // Focus trap and Escape handling inside EstimatePopover
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (busy) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
        return;
      }

      if (event.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusableSelector = [
          'button:not([disabled])',
          'input:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
        ].join(', ');
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
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
          if (document.activeElement === first || !panel.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !panel.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [busy, onDismiss]);

  function handlePresetClick(preset: EstimatePreset) {
    if (busy) return;
    onSelect(preset.minutes, formatDuration(preset.minutes));
  }

  function handleCustomSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = parseDuration(customText);
    if (parsed === null) {
      setLocalError('Enter a positive duration, like 45m or 1h 30m.');
      return;
    }
    setLocalError(null);
    onSelect(parsed, formatDuration(parsed));
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (busy) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    }
  }

  const displayError = localError || externalError;

  return createPortal(
    <>
      <div
        className="popover-backdrop"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          onDismiss();
        }}
      />
      <div
        ref={panelRef}
        className="estimate-popover dropdown-panel"
        role="dialog"
        aria-label="Planned time presets"
        style={
          coords
            ? {
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                zIndex: 1050,
              }
            : { visibility: 'hidden', position: 'fixed', zIndex: 1050 }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="estimate-popover-header">Planned time:</div>
        <form className="estimate-custom-form" onSubmit={handleCustomSubmit} noValidate>
          <div className="estimate-custom-row">
            <input
              ref={inputRef}
              type="text"
              aria-label="Custom duration"
              placeholder="e.g. 45m"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                if (localError) setLocalError(null);
              }}
              onKeyDown={handleInputKeyDown}
              disabled={busy}
            />
            <button
              type="submit"
              className="icon-button estimate-submit-btn"
              aria-label="Apply custom duration"
              title="Apply"
              disabled={busy}
            >
              <Icon name="check" size={13} />
            </button>
          </div>
          {displayError && (
            <p className="form-error popover-error" role="alert">
              {displayError}
            </p>
          )}
        </form>
        <div className="estimate-presets-list" role="list">
          {ESTIMATE_PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              className="estimate-preset-item"
              onClick={() => handlePresetClick(preset)}
              disabled={busy}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}
