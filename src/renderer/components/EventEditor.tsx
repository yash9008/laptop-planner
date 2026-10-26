import { useState, type FormEvent } from 'react';
import type { PlannerEvent, SaveEventInput } from '../../shared/contracts';
import { shiftLocalTime, timeInput } from '../../shared/task-input';
import { Modal } from './Modal';

export function EventEditor({ event, date, initialMinute, onDismiss, onSave, onDelete }: {
  event: PlannerEvent | null; date: string; initialMinute: number; onDismiss(): void;
  onSave(input: SaveEventInput): Promise<string | null>; onDelete(id: string): Promise<string | null>;
}) {
  const start = event?.start ?? { date, minute: initialMinute };
  const end = event?.end ?? shiftLocalTime(start, 60);
  const [creationId]=useState(()=>crypto.randomUUID());
  const [title, setTitle] = useState(event?.title ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [startDate, setStartDate] = useState(start.date);
  const [endDate, setEndDate] = useState(end.date);
  const [startTime, setStartTime] = useState(timeInput(start.minute));
  const [endTime, setEndTime] = useState(timeInput(end.minute));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (saving) return;
    if (!title.trim() || !startDate || !endDate || !startTime || !endTime) { setError('Enter a title and valid start and end times.'); return; }
    const minute = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return hours! * 60 + minutes!; };
    setSaving(true);
    const message = await onSave({ id: event?.id??creationId, create:!event, title, notes, start: { date: startDate, minute: minute(startTime) }, end: { date: endDate, minute: minute(endTime) }, viewDate: date });
    if (message) { setSaving(false); setError(message); }
  }
  return <Modal title={event ? 'Edit fixed event' : 'New fixed event'} onDismiss={onDismiss} busy={saving}><form className="task-form" onSubmit={(e) => { void submit(e); }}>
    <label>Event title<input aria-label="Event title" autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={saving} /></label>
    <div className="form-row"><label>Start day<input aria-label="Start day" type="date" min="0001-01-01" max="9999-12-31" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} /></label><label>Start time<input aria-label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={saving} /></label></div>
    <div className="form-row"><label>End day<input aria-label="End day" type="date" min="0001-01-01" max="9999-12-31" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={saving} /></label><label>End time<input aria-label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={saving} /></label></div>
    <label>Notes<textarea aria-label="Event notes" rows={2} maxLength={20000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} /></label>
    <p className="form-hint">Fixed events keep their times. Flexible tasks fit around them.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions">{event && <button type="button" className="button danger" disabled={saving} onClick={() => { setSaving(true); void onDelete(event.id).then((message) => { if (message) { setSaving(false); setError(message); } }); }}>Delete event</button>}<button type="button" className="button secondary" onClick={onDismiss} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : event ? 'Save event' : 'Add event'}</button></div>
  </form></Modal>;
}
