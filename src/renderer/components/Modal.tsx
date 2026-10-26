import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
export function Modal({ title, onDismiss, busy = false, children }: { title: string; onDismiss(): void; busy?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; if (!element.open) element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="modal" aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onDismiss(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onDismiss(); }}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onDismiss} disabled={busy}><Icon name="close" /></button></div>{children}
  </dialog>;
}
