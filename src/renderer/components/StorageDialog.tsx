import { useEffect, useState } from 'react';
import type { FoundationStatus,SaveSettingsInput } from '../../shared/contracts';
import { formatTime,timeInput } from '../../shared/task-input';
import { Modal } from './Modal';
export function StorageDialog({onDismiss,title='Local storage',viewDate,onSaveSettings,onRestored}:{
  onDismiss():void;title?:string;viewDate:string;onSaveSettings(input:SaveSettingsInput):Promise<string|null>;onRestored():Promise<void>;
}) {
  const [status,setStatus]=useState<FoundationStatus|null>(null);
  const [error,setError]=useState<string|null>(null);const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(true);const [operation,setOperation]=useState('');
  const [start,setStart]=useState('06:00');const [end,setEnd]=useState('22:00');const [zone,setZone]=useState('');
  async function refresh(reset=false){
    setLoading(true);
    try {
      const result=await window.planner.getFoundationStatus();
      if(result.ok){setStatus(result.value);if(reset){const hours=result.value.storage.dailyHours;setStart(timeInput(hours.startMinute));setEnd(hours.endMinute===1440?'00:00':timeInput(hours.endMinute));setZone(hours.timeZone);}setError(null);}
      else {setStatus(null);setError(result.error.message);}
    }catch{setError('The local storage bridge is unavailable. Close and reopen the app to try again.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh(true);},[]);
  async function save(){
    setOperation('Saving settings…');setMessage('');setError(null);
    try {
      const minute=(value:string)=>{const parts=value.split(':').map(Number);return parts[0]!*60+parts[1]!;};
      const result=await onSaveSettings({startMinute:minute(start),endMinute:end==='00:00'?1440:minute(end),timeZone:zone.trim(),viewDate});
      if(result)setError(result);else{await refresh(true);setMessage('Settings saved. Your schedule has been updated.');}
    }catch{setError('Settings could not be confirmed. Your entries have been kept; refresh the day before retrying.');}
    finally{setOperation('');}
  }
  async function backup(restore:boolean){
    setOperation(restore?'Restoring backup…':'Creating backup…');setError(null);setMessage('');
    try {
      const result=await (restore?window.planner.restoreBackup():window.planner.createBackup());
      if(!result.ok)setError(result.error.message);
      else if(result.value.canceled)setMessage('Canceled. Your planner was not replaced.');
      else {
        if(restore){await onRestored();await refresh(true);}
        setMessage(restore?`Backup restored. Previous planner saved to ${result.value.safetyBackupPath}`:`Backup saved to ${result.value.path}`);
      }
    }catch{setError('The backup operation could not be confirmed. Refresh the planner before retrying.');}
    finally{setOperation('');}
  }
  const disabled=Boolean(operation)||loading;
  const zones=Intl.supportedValuesOf('timeZone');
  return <Modal title={title} onDismiss={onDismiss} busy={Boolean(operation)}><div className="storage-dialog">
    <span className="privacy-label"><span className="status-dot"/>Everything stays on this Mac</span><p className="muted">Your planner has its own local database. No account, cloud connection, or external integration is used.</p>
    {status && <form className="task-form settings-form" onSubmit={(event)=>{event.preventDefault();void save();}}>
      <h3>Planning hours</h3><div className="form-row"><label>Start time<input aria-label="Daily start time" type="time" value={start} onChange={(event)=>setStart(event.target.value)} required disabled={disabled}/></label><label>End time<input aria-label="Daily end time" type="time" value={end} onChange={(event)=>setEnd(event.target.value)} required disabled={disabled}/></label></div>
      <label>Time zone<input aria-label="Time zone" list="planner-time-zones" value={zone} onChange={(event)=>setZone(event.target.value)} required disabled={disabled}/><datalist id="planner-time-zones">{zones.map((zone)=><option key={zone} value={zone}/>)}</datalist></label>
      <p className="form-hint">End time 00:00 means midnight at the end of the day. Changing time zone pauses focus; task and event dates stay as entered. Recorded focus time keeps its real elapsed duration.</p>
      <button className="button primary" disabled={disabled}>Save settings</button>
    </form>}
    <section className="backup-settings" aria-label="Backup and restore"><h3>Backup and restore</h3><p className="muted">Save a complete copy to a local file. Restore replaces this planner after confirmation and keeps a safety backup. Restored timers stay paused.</p><div className="backup-actions"><button className="button secondary" onClick={()=>{void backup(false);}} disabled={disabled || !status}>Create backup</button><button className="button secondary" onClick={()=>{void backup(true);}} disabled={disabled}>Restore backup</button></div></section>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="backup-message" role="status">{message}</p>}
    <details className="storage-details"><summary>Storage details</summary>{status && <dl><dt>Database location</dt><dd><code data-testid="database-path">{status.storage.databasePath}</code></dd><dt>Database version</dt><dd data-testid="database-version">Schema {status.storage.schemaVersion} · SQLite {status.storage.sqliteVersion}</dd><dt>Daily planning hours</dt><dd>{formatTime(status.storage.dailyHours.startMinute)} – {formatTime(status.storage.dailyHours.endMinute)}</dd><dt>Timezone</dt><dd>{status.storage.dailyHours.timeZone}</dd></dl>}</details>
    <div className="storage-dialog-footer"><span role="status">{operation || (loading?'Checking…':error?'NEEDS ATTENTION':'CONNECTED')}</span><button className="button secondary" onClick={()=>{void refresh();}} disabled={disabled}>Refresh status</button></div>
  </div></Modal>;
}
