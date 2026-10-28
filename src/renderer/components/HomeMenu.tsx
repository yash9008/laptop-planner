import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export interface HomeMenuItem {
  id: string;
  label: string;
  ariaLabel?: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  onSelect(): void;
}

export function HomeMenu({ anchor, label, items, align = 'left', onDismiss }: {
  anchor: HTMLElement;
  label: string;
  items: HomeMenuItem[];
  align?: 'left' | 'right';
  onDismiss(): void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const dismiss = () => {
    onDismiss();
    anchor.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const menu = menuRef.current;
      const width = menu?.offsetWidth || 170;
      const height = menu?.offsetHeight || 100;
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - 8 && rect.top - height > 8) top = rect.top - height - 4;
      top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
      const preferredLeft = align === 'right' ? rect.right - width : rect.left;
      const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - width - 8));
      setCoords({ top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor, align]);

  useEffect(() => {
    const selected = items.findIndex((item) => item.selected && !item.disabled);
    const first = items.findIndex((item) => !item.disabled);
    itemsRef.current[selected >= 0 ? selected : first]?.focus({ preventScroll: true });
  }, [coords]);

  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    window.addEventListener('keydown', escape, { capture: true });
    return () => window.removeEventListener('keydown', escape, { capture: true });
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = itemsRef.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled));
    if (!enabled.length) return;
    const current = enabled.findIndex((item) => item === document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      enabled[(current + direction + enabled.length) % enabled.length]?.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      dismiss();
    }
  }

  return createPortal(
    <>
      <div className="popover-backdrop" onClick={dismiss} />
      <div
        ref={menuRef}
        className="task-actions-menu dropdown-panel home-menu"
        role="menu"
        aria-label={label}
        style={coords
          ? { position: 'fixed', top: coords.top, left: coords.left, zIndex: 1050 }
          : { visibility: 'hidden', position: 'fixed', zIndex: 1050 }}
        onKeyDown={onKeyDown}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => { itemsRef.current[index] = element; }}
            type="button"
            role="menuitem"
            className="menu-item"
            aria-label={item.ariaLabel ?? item.label}
            aria-current={item.selected ? 'true' : undefined}
            disabled={item.disabled}
            onClick={() => {
              onDismiss();
              item.onSelect();
            }}
          >
            {item.icon && <Icon name={item.icon} size={14} />}
            <span>{item.label}</span>
            {item.selected && <Icon name="check" size={13} />}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}
