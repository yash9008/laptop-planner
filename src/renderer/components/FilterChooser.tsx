import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerProject } from '../../shared/contracts';
import { Icon } from './Icon';

export interface FilterChooserProps {
  anchor: HTMLElement | null;
  filterQuery: string;
  onQueryChange(query: string): void;
  filterStatus: 'all' | 'incomplete' | 'completed';
  onStatusChange(status: 'all' | 'incomplete' | 'completed'): void;
  filterProjectId: string;
  onProjectChange(projectId: string): void;
  projects: PlannerProject[];
  isFilterActive: boolean;
  onClear(): void;
  onDismiss(): void;
}

export function FilterChooser({
  anchor,
  filterQuery,
  onQueryChange,
  filterStatus,
  onStatusChange,
  filterProjectId,
  onProjectChange,
  projects,
  isFilterActive,
  onClear,
  onDismiss,
}: FilterChooserProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const hasFocused = useRef(false);

  useLayoutEffect(() => {
    if (!anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const panelEl = panelRef.current;
      const width = panelEl?.offsetWidth || 280;
      const height = panelEl?.offsetHeight || 260;

      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - 8 && rect.top - height > 8) {
        top = Math.max(8, rect.top - height - 6);
      } else if (top + height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - height - 8);
      }

      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
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
    if (coords && !hasFocused.current) {
      hasFocused.current = true;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [coords]);

  // Outside click handling
  useEffect(() => {
    function onPointerDown(event: globalThis.PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target) && !anchor?.contains(target)) {
        onDismiss();
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchor, onDismiss]);

  // Escape handling & Focus containment
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onDismiss]);

  function handleTrapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const elements = Array.from(focusable);
    if (!elements.length) return;

    const first = elements[0];
    const last = elements[elements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  const content = (
    <div
      ref={panelRef}
      className="filter-chooser-popover"
      data-testid="filter-chooser"
      role="dialog"
      aria-label="Filter tasks"
      style={{
        position: 'fixed',
        top: coords ? `${coords.top}px` : '-9999px',
        left: coords ? `${coords.left}px` : '-9999px',
        zIndex: 900,
      }}
      onKeyDown={handleTrapKeyDown}
    >
      <div className="filter-chooser-header">
        <span className="filter-chooser-title">Filter tasks</span>
        {isFilterActive && <span className="filter-active-pill">Active</span>}
      </div>

      <div className="filter-chooser-section">
        <label htmlFor="filter-search-input" className="filter-chooser-label">
          Keyword
        </label>
        <div className="filter-input-wrap">
          <Icon name="search" size={14} />
          <input
            id="filter-search-input"
            ref={inputRef}
            type="search"
            aria-label="Search tasks"
            placeholder="Filter by task, notes, or project…"
            value={filterQuery}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {filterQuery && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear keyword input"
              onClick={() => onQueryChange('')}
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="filter-chooser-section">
        <span className="filter-chooser-label" id="filter-status-label">
          Status
        </span>
        <div className="filter-segmented" role="group" aria-labelledby="filter-status-label">
          <button
            type="button"
            className={`filter-segment ${filterStatus === 'all' ? 'active' : ''}`}
            aria-pressed={filterStatus === 'all'}
            onClick={() => onStatusChange('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-segment ${filterStatus === 'incomplete' ? 'active' : ''}`}
            aria-pressed={filterStatus === 'incomplete'}
            onClick={() => onStatusChange('incomplete')}
          >
            Incomplete
          </button>
          <button
            type="button"
            className={`filter-segment ${filterStatus === 'completed' ? 'active' : ''}`}
            aria-pressed={filterStatus === 'completed'}
            onClick={() => onStatusChange('completed')}
          >
            Completed
          </button>
        </div>
      </div>

      <div className="filter-chooser-section">
        <label htmlFor="filter-project-select" className="filter-chooser-label">
          Project
        </label>
        <select
          id="filter-project-select"
          className="filter-select"
          aria-label="Filter by project"
          value={filterProjectId}
          onChange={(e) => onProjectChange(e.target.value)}
        >
          <option value="all">All projects</option>
          <option value="none">No project</option>
          {projects.map((proj) => (
            <option key={proj.id} value={proj.id}>
              {proj.title}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-chooser-footer">
        <button
          type="button"
          className="button secondary filter-clear-button"
          aria-label="Clear task filter"
          disabled={!isFilterActive}
          onClick={onClear}
        >
          Clear filters
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label="Done with filters"
          onClick={onDismiss}
        >
          Done
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
