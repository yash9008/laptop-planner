import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerTask } from '../../shared/contracts';
import { Icon } from './Icon';

export function TaskMenu({
  task,
  anchor,
  busy = false,
  onEdit,
  onMoveToBacklog,
  onDelete,
  onDismiss,
}: {
  task: PlannerTask;
  anchor: HTMLElement | null;
  busy?: boolean;
  onEdit(task: PlannerTask): void;
  onMoveToBacklog(task: PlannerTask): void;
  onDelete(task: PlannerTask): void;
  onDismiss(): void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const panelEl = menuRef.current;
      const menuWidth = panelEl?.offsetWidth || 170;
      const menuHeight = panelEl?.offsetHeight || 120;

      let top = rect.bottom + 4;
      if (top + menuHeight > window.innerHeight - 8 && rect.top - menuHeight > 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
      } else if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuHeight - 8);
      }

      let left = rect.right - menuWidth;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuWidth - 8);
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

  useEffect(() => {
    // Focus first enabled item
    const firstEnabled = itemsRef.current.find((item) => item && !item.disabled);
    firstEnabled?.focus();
  }, [coords]);

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
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [busy, onDismiss]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (busy) return;
    const enabledItems = itemsRef.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled));
    if (!enabledItems.length) return;
    const currentIndex = enabledItems.findIndex((item) => item === document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % enabledItems.length;
      enabledItems[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
      enabledItems[prevIndex]?.focus();
    } else if (event.key === 'Tab') {
      onDismiss();
    }
  }

  const inBacklog = task.plannedDate === null;

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
        ref={menuRef}
        className="task-actions-menu dropdown-panel"
        role="menu"
        aria-label={`Actions for ${task.title}`}
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
        onKeyDown={handleKeyDown}
      >
        <button
          ref={(el) => {
            itemsRef.current[0] = el;
          }}
          type="button"
          role="menuitem"
          className="menu-item"
          aria-label="Edit task"
          onClick={() => {
            if (busy) return;
            onDismiss();
            onEdit(task);
          }}
          disabled={busy}
        >
          <Icon name="note" size={14} />
          <span>Edit task</span>
        </button>
        <button
          ref={(el) => {
            itemsRef.current[1] = el;
          }}
          type="button"
          role="menuitem"
          className="menu-item"
          aria-label="Move to backlog"
          onClick={() => {
            if (busy) return;
            onDismiss();
            onMoveToBacklog(task);
          }}
          disabled={busy || inBacklog}
          title={inBacklog ? 'Already in backlog' : 'Move to backlog'}
        >
          <Icon name="archive" size={14} />
          <span>Move to backlog</span>
        </button>
        <div className="menu-divider" />
        <button
          ref={(el) => {
            itemsRef.current[2] = el;
          }}
          type="button"
          role="menuitem"
          className="menu-item menu-item-danger"
          aria-label="Delete"
          title={`Delete ${task.title}`}
          onClick={() => {
            if (busy) return;
            onDismiss();
            onDelete(task);
          }}
          disabled={busy}
        >
          <Icon name="trash" size={14} />
          <span>Delete</span>
        </button>
      </div>
    </>,
    document.body
  );
}
