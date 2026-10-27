import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function KeyboardHelpDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length <= 1) {
          event.preventDefault();
          closeButtonRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { key: '⌘K / Ctrl+K', description: 'Open command palette' },
    { key: 'A', description: 'Quick-add new task' },
    { key: 'F', description: 'Enter single-task Focus view' },
    { key: '/', description: 'Open Search panel' },
    { key: '← / →', description: 'Navigate board dates / columns' },
    { key: 'Esc', description: 'Dismiss active popup, editor, palette, or exit Focus' },
    { key: 'Tab / Shift+Tab', description: 'Navigate controls inside dialogs and forms' },
  ];

  return (
    <div
      className="keyboard-help-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="keyboard-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        ref={dialogRef}
      >
        <div className="keyboard-help-header">
          <h2>Keyboard shortcuts</h2>
          <button
            ref={closeButtonRef}
            className="icon-button"
            aria-label="Close shortcuts dialog"
            title="Close · Esc"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="keyboard-help-content">
          <table className="keyboard-help-table">
            <tbody>
              {shortcuts.map((sc) => (
                <tr key={sc.key}>
                  <td className="keyboard-help-key">
                    <kbd>{sc.key}</kbd>
                  </td>
                  <td className="keyboard-help-desc">{sc.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
