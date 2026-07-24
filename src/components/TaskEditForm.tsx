import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { TaskEditDraft, TurnpointTypeOption, XcTask } from '../lib/types';
import { applyTaskEditDraft, createTaskEditDraft, taskEditDraftEquals } from '../lib/xctask';
import { IconButtonContent } from './Icon';

interface TaskEditFormProps { task: XcTask; onApply: (task: XcTask) => void; onError: (message: string) => void; }

function updateTurnpointRow(draft: TaskEditDraft, index: number, field: keyof TaskEditDraft['turnpoints'][number], value: string): TaskEditDraft {
  return { ...draft, turnpoints: draft.turnpoints.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) };
}

export function TaskEditForm({ task, onApply, onError }: TaskEditFormProps) {
  const [draft, setDraft] = useState(() => createTaskEditDraft(task));
  const isDirty = useMemo(() => !taskEditDraftEquals(task, draft), [task, draft]);
  useEffect(() => { setDraft(createTaskEditDraft(task)); }, [task]);
  const handleApply = () => { try { onApply(applyTaskEditDraft(task, draft)); } catch (err) { onError(err instanceof Error ? err.message : 'Invalid task edits'); } };
  return (
    <div className="welcome-task-edit">
      <div className="welcome-task-edit-table-wrap">
        <table className="welcome-task-edit-table">
          <thead><tr><th>#</th><th>Name</th><th>Lat</th><th>Lon</th><th>Radius (m)</th><th>Type</th></tr></thead>
          <tbody>
            {draft.turnpoints.map((row, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td><input type="text" value={row.name} aria-label={`Turnpoint ${index + 1} name`} onChange={(e) => setDraft((c) => updateTurnpointRow(c, index, 'name', e.target.value))} /></td>
                <td><input type="text" inputMode="decimal" value={row.lat} aria-label={`Turnpoint ${index + 1} latitude`} onChange={(e) => setDraft((c) => updateTurnpointRow(c, index, 'lat', e.target.value))} /></td>
                <td><input type="text" inputMode="decimal" value={row.lon} aria-label={`Turnpoint ${index + 1} longitude`} onChange={(e) => setDraft((c) => updateTurnpointRow(c, index, 'lon', e.target.value))} /></td>
                <td><input type="text" inputMode="numeric" value={row.radius} aria-label={`Turnpoint ${index + 1} radius`} onChange={(e) => setDraft((c) => updateTurnpointRow(c, index, 'radius', e.target.value))} /></td>
                <td><select value={row.type} aria-label={`Turnpoint ${index + 1} type`} onChange={(e) => setDraft((c) => updateTurnpointRow(c, index, 'type', e.target.value as TurnpointTypeOption))}><option value="">—</option><option value="SSS">SSS</option><option value="ESS">ESS</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="welcome-task-edit-start"><span>Start time</span><input type="text" value={draft.startTime} placeholder="HH:MM or HH:MM:SS" aria-label="Task start time" onChange={(e) => setDraft((c) => ({ ...c, startTime: e.target.value }))} /></label>
      <div className="welcome-task-edit-actions"><button type="button" className="welcome-inline-button" disabled={!isDirty} onClick={handleApply}><IconButtonContent icon={Check}>Apply changes</IconButtonContent></button></div>
    </div>
  );
}
