import { useEffect, useRef, useState, type DragEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { TaskEditDraft, TurnpointTypeOption, XcTask } from '../lib/types';
import {
  createEmptyTurnpointRow,
  createTaskEditDraft,
  taskEffectivelyEquals,
  tryApplyTaskEditDraft,
} from '../lib/xctask';
import { Icon, IconButtonContent } from './Icon';

interface TaskEditFormProps {
  task: XcTask;
  onChange: (task: XcTask) => void;
}

type EditableTurnpointField = 'name' | 'lat' | 'lon' | 'radius' | 'type';

function updateTurnpointRow(
  draft: TaskEditDraft,
  index: number,
  field: EditableTurnpointField,
  value: string,
): TaskEditDraft {
  return {
    ...draft,
    turnpoints: draft.turnpoints.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row,
    ),
  };
}

function reorderTurnpoints(draft: TaskEditDraft, fromIndex: number, toIndex: number): TaskEditDraft {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return draft;
  if (fromIndex >= draft.turnpoints.length || toIndex >= draft.turnpoints.length) return draft;

  const turnpoints = [...draft.turnpoints];
  const [moved] = turnpoints.splice(fromIndex, 1);
  turnpoints.splice(toIndex, 0, moved);
  return { ...draft, turnpoints };
}

export function TaskEditForm({ task, onChange }: TaskEditFormProps) {
  const [draft, setDraft] = useState(() => createTaskEditDraft(task));
  const skipSyncRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setDraft(createTaskEditDraft(task));
  }, [task]);

  const commitDraft = (next: TaskEditDraft) => {
    setDraft(next);
    const applied = tryApplyTaskEditDraft(task, next);
    if (!applied || taskEffectivelyEquals(task, applied)) return;
    skipSyncRef.current = true;
    onChange(applied);
  };

  const handleAddTurnpoint = () => {
    const template = draft.turnpoints[draft.turnpoints.length - 1];
    commitDraft({
      ...draft,
      turnpoints: [...draft.turnpoints, createEmptyTurnpointRow(template)],
    });
  };

  const handleRemoveTurnpoint = (index: number) => {
    if (draft.turnpoints.length <= 1) return;
    commitDraft({
      ...draft,
      turnpoints: draft.turnpoints.filter((_, rowIndex) => rowIndex !== index),
    });
  };

  const handleDragStart = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    const fromHandle = (event.target as HTMLElement).closest('.welcome-task-edit-drag-handle');
    if (!fromHandle) {
      event.preventDefault();
      return;
    }
    dragIndexRef.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    event.currentTarget.classList.add('is-dragging');
  };

  const handleDragEnd = (event: DragEvent<HTMLTableRowElement>) => {
    event.currentTarget.classList.remove('is-dragging');
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDragOver = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === index) return;
    commitDraft(reorderTurnpoints(draft, fromIndex, index));
  };

  return (
    <div className="welcome-task-edit">
      <div className="welcome-task-edit-table-wrap">
        <table className="welcome-task-edit-table">
          <thead>
            <tr>
              <th className="welcome-task-edit-drag-col" aria-label="Reorder" />
              <th>#</th>
              <th>Name</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Radius (m)</th>
              <th>Type</th>
              <th className="welcome-task-edit-actions-col" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {draft.turnpoints.map((row, index) => (
              <tr
                key={row.key}
                draggable
                onDragStart={handleDragStart(index)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver(index)}
                onDrop={handleDrop(index)}
                className={dragOverIndex === index ? 'drag-over' : undefined}
              >
                <td className="welcome-task-edit-drag-col">
                  <span className="welcome-task-edit-drag-handle" title="Drag to reorder" aria-hidden="true">
                    <Icon icon={GripVertical} size="sm" />
                  </span>
                </td>
                <td>{index + 1}</td>
                <td>
                  <input
                    type="text"
                    value={row.name}
                    aria-label={`Turnpoint ${index + 1} name`}
                    onChange={(e) => commitDraft(updateTurnpointRow(draft, index, 'name', e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.lat}
                    aria-label={`Turnpoint ${index + 1} latitude`}
                    onChange={(e) => commitDraft(updateTurnpointRow(draft, index, 'lat', e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.lon}
                    aria-label={`Turnpoint ${index + 1} longitude`}
                    onChange={(e) => commitDraft(updateTurnpointRow(draft, index, 'lon', e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.radius}
                    aria-label={`Turnpoint ${index + 1} radius`}
                    onChange={(e) => commitDraft(updateTurnpointRow(draft, index, 'radius', e.target.value))}
                  />
                </td>
                <td>
                  <select
                    value={row.type}
                    aria-label={`Turnpoint ${index + 1} type`}
                    onChange={(e) =>
                      commitDraft(
                        updateTurnpointRow(draft, index, 'type', e.target.value as TurnpointTypeOption),
                      )
                    }
                  >
                    <option value="">—</option>
                    <option value="SSS">SSS</option>
                    <option value="ESS">ESS</option>
                  </select>
                </td>
                <td className="welcome-task-edit-actions-col">
                  <button
                    type="button"
                    className="welcome-icon-button"
                    aria-label={`Remove turnpoint ${index + 1}`}
                    disabled={draft.turnpoints.length <= 1}
                    onClick={() => handleRemoveTurnpoint(index)}
                  >
                    <Icon icon={Trash2} size="sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="welcome-task-edit-toolbar">
        <button type="button" className="welcome-text-button" onClick={handleAddTurnpoint}>
          <IconButtonContent icon={Plus}>Add turnpoint</IconButtonContent>
        </button>
        <label className="welcome-task-edit-start">
          <span>Start time</span>
          <input
            type="text"
            value={draft.startTime}
            placeholder="HH:MM or HH:MM:SS"
            aria-label="Task start time"
            onChange={(e) => commitDraft({ ...draft, startTime: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
