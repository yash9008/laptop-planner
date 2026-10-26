import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const WIDTH_KEY = 'laptop-planner.calendar-width.v1';
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;

export function readCalendarWidth(): number | null {
  try {
    const stored = localStorage.getItem(WIDTH_KEY);
    const width = stored === null ? NaN : Number(stored);
    return Number.isFinite(width) && width >= MIN_WIDTH && width <= MAX_WIDTH ? width : null;
  } catch { return null; }
}

function rememberWidth(width: number | null) {
  try {
    if (width === null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(width));
  } catch { /* A display preference must never prevent planning. */ }
}

export function CalendarDock({ width, onResize, children }: {
  width: number | null;
  onResize(width: number | null): void;
  children: ReactNode;
}) {
  const dock = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; start: number; original: number | null; latest: number } | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(300);
  const [maximum, setMaximum] = useState(MAX_WIDTH);
  const [resizing, setResizing] = useState(false);

  useLayoutEffect(() => {
    const element = dock.current!;
    const workspace = element.closest<HTMLElement>('.workspace')!;
    const measure = () => {
      const rail = workspace.querySelector('.utility-rail')?.getBoundingClientRect().width ?? 44;
      setMaximum(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, workspace.clientWidth - rail - 280)));
      setMeasuredWidth(Math.round(element.getBoundingClientRect().width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  function finish(cancel: boolean) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    setResizing(false);
    const next = cancel ? current.original : current.latest;
    onResize(next);
    if (!cancel) rememberWidth(next);
    if (handle.current?.hasPointerCapture(current.pointerId)) handle.current.releasePointerCapture(current.pointerId);
  }

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) {
        event.preventDefault();
        finish(true);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  });

  return <div ref={dock} className={`calendar-dock${resizing ? ' is-resizing' : ''}`}>
    <div ref={handle} className="calendar-divider" role="separator" tabIndex={0}
      aria-label="Resize calendar" aria-orientation="vertical" aria-controls="day-calendar-panel"
      aria-valuemin={MIN_WIDTH} aria-valuemax={Math.floor(maximum)} aria-valuenow={measuredWidth}
      aria-valuetext={`${measuredWidth} pixels wide`}
      title="Drag to resize · Arrow keys adjust · Double-click to reset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = dock.current!.getBoundingClientRect().width;
        gesture.current = { pointerId: event.pointerId, x: event.clientX, start, original: width, latest: start };
        setResizing(true);
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.latest = Math.round(Math.max(MIN_WIDTH, Math.min(maximum, current.start + current.x - event.clientX)));
        onResize(current.latest);
      }}
      onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
      onDoubleClick={() => { onResize(null); rememberWidth(null); }}
      onKeyDown={(event) => {
        if (gesture.current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? maximum : measuredWidth + (event.key === 'ArrowLeft' ? 24 : -24);
        const bounded = Math.round(Math.max(MIN_WIDTH, Math.min(maximum, next)));
        onResize(bounded);
        rememberWidth(bounded);
      }}><span /></div>
    <div className="calendar-dock-content" id="day-calendar-panel">{children}</div>
  </div>;
}
