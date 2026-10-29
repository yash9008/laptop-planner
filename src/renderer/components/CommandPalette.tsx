import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface CommandItem {
  id: string;
  category: 'Task' | 'Navigation' | 'Actions' | 'Panels' | 'Settings' | 'Rituals';
  title: string;
  description?: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  run: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
}: {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      const matchTitle = cmd.title.toLowerCase().includes(q);
      const matchDesc = Boolean(cmd.description && cmd.description.toLowerCase().includes(q));
      const matchCategory = cmd.category.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchCategory;
    });
  }, [commands, query]);

  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const el = document.getElementById(`command-item-${selectedIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;

      const isCmdK =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k';
      if (isCmdK) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => (filteredCommands.length ? (prev + 1) % filteredCommands.length : 0));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommands.length ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0
        );
        return;
      }

      if (event.key === 'Enter') {
        const target = event.target as HTMLElement | null;
        if (target && target.closest('button')) {
          // Preserve native button activation (e.g. Close command palette or Clear query)
          return;
        }
        event.preventDefault();
        const activeItem = filteredCommands[selectedIndex];
        if (activeItem && !activeItem.disabled) {
          activeItem.run();
        }
        return;
      }

      if (event.key === 'Tab') {
        // Tab / Shift+Tab focus trap inside dialog
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length <= 1) {
          event.preventDefault();
          inputRef.current?.focus();
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
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="command-palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        ref={dialogRef}
      >
        <div className="command-palette-header">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            role="combobox"
            aria-expanded={filteredCommands.length > 0}
            aria-controls="command-palette-results"
            aria-autocomplete="list"
            aria-activedescendant={
              filteredCommands[selectedIndex] ? `command-item-${selectedIndex}` : undefined
            }
            placeholder="Type a command or search…"
            aria-label="Command search query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Clear command query"
              title="Clear"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Close command palette"
            title="Close · Esc"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div
          id="command-palette-results"
          className="command-palette-results"
          role="listbox"
          aria-label="Commands"
          ref={listRef}
        >
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty" role="status">
              No matching commands
            </div>
          ) : (
            filteredCommands.map((item, idx) => (
              <div
                key={item.id}
                id={`command-item-${idx}`}
                role="option"
                aria-selected={selectedIndex === idx}
                aria-disabled={item.disabled}
                className={`command-palette-item ${selectedIndex === idx ? 'is-selected' : ''} ${
                  item.disabled ? 'is-disabled' : ''
                }`}
                onClick={() => {
                  if (!item.disabled) {
                    item.run();
                  }
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="command-item-left">
                  <span className="command-item-category">{item.category}</span>
                  <span className="command-item-title">{item.title}</span>
                  {item.disabled && item.disabledReason && (
                    <span className="command-item-reason">({item.disabledReason})</span>
                  )}
                </div>
                {item.shortcut && <kbd className="command-item-shortcut">{item.shortcut}</kbd>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
