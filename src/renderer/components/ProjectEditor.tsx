import { useState, type FormEvent } from 'react';
import type { PlannerProject, SaveProjectInput } from '../../shared/contracts';
import { Modal } from './Modal';

export function ProjectEditor({ project, date, onDismiss, onSave }: {
  project: PlannerProject | null; date: string; onDismiss(): void; onSave(input: SaveProjectInput): Promise<string | null>;
}) {
  const [creationId]=useState(()=>crypto.randomUUID());
  const [title, setTitle] = useState(project?.title ?? '');
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [color, setColor] = useState(project?.color ?? '#b4d38b');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    if (!title.trim()) { setError('Give this project a title.'); return; }
    setSaving(true);
    const message = await onSave({ id: project?.id??creationId, create:!project, title, notes, color, deadline: deadline || null, viewDate: date });
    if (message) { setSaving(false); setError(message); }
  }
  return <Modal title={project ? 'Edit project' : 'New project'} onDismiss={onDismiss} busy={saving}><form className="task-form" onSubmit={(event) => { void submit(event); }}>
    <label>Project title<input aria-label="Project title" autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} disabled={saving} /></label>
    <div className="form-row"><label>Color<input type="color" aria-label="Project color" value={color} onChange={(event) => setColor(event.target.value)} disabled={saving} /></label><label>Deadline <span className="optional">optional</span><input aria-label="Project deadline" type="date" min="0001-01-01" max="9999-12-31" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={saving} /></label></div>
    <label>Notes<textarea aria-label="Project notes" rows={4} value={notes} maxLength={20000} onChange={(event) => setNotes(event.target.value)} disabled={saving} placeholder="What are you working toward?" /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onDismiss} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : project ? 'Save project' : 'Create project'}</button></div>
  </form></Modal>;
}
