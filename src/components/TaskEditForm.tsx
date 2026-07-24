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

const TURNPOINT_DRAG_MIME = 'application/x-xctask-turnpoint-index';

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

function readDragIndex(event: DragEvent): number | null {
  const raw =
    event.dataTransfer.getData(TURNPOINT_DRAG_MIME) || event.dataTransfer.getData('text/plain');
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function TaskEditForm({ task, onChange }: TaskEditFormProps) {
  const [draft, setDraft] = useState(() => createTaskEditDraft(task));
  const skipSyncRef = useRef(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setDraft(createTaskEditDraft(task));
  }, [task]);

  const commitDraft = (next: TaskEditDraft | ((prev: TaskEditDraft) => TaskEditDraft)) => {
    setDraft((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const applied = tryApplyTaskEditDraft(task, resolved);
      if (applied && !taskEffectivelyEquals(task, applied)) {
        skipSyncRef.current = true;
        onChange(applied);
      }
      return resolved;
    });
  };

  const handleAddTurnpoint = () => {
    commitDraft((prev) => {
      const template = prev.turnpoints[prev.turnpoints.length - 1];
      return {
        ...prev,
        turnpoints: [...prev.turnpoints, createEmptyTurnpointRow(template)],
      };
    });
  };

  const handleRemoveTurnpoint = (index: number) => {
    commitDraft((prev) => {
      if (prev.turnpoints.length <= 1) return prev;
      return {
        ...prev,
        turnpoints: prev.turnpoints.filter((_, rowIndex) => rowIndex !== index),
      };
    });
  };

  const handleDragStart = (index: number) => (event: DragEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    setDraggingIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(TURNPOINT_DRAG_MIME, String(index));
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragEnd = (event: DragEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleRowDragOver = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    if (draggingIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleRowDragLeave = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    if (dragOverIndex !== index) return;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverIndex(null);
  };

  const handleRowDrop = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const fromIndex = draggingIndex ?? readDragIndex(event);
    setDraggingIndex(null);
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === index) return;
    commitDraft((prev) => reorderTurnpoints(prev, fromIndex, index));
  };

  const stopDragBubble = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="welcome-task-edit">
      <div
        className="welcome-task-edit-table-wrap"
        onDragEnter={stopDragBubble}
        onDragOver={stopDragBubble}
        onDrop={stopDragBubble}
      >
        <table className="welcome-task-edit-table">
          <thead>
            <tr>
              <th className="welcome-task-edit-drag-col" aria-label="Reorder" />
              <th>#</th>
              <th>Name</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Radius (m)</th>
              <th className="welcome-task-edit-type-col">Type</th>
              <th className="welcome-task-edit-actions-col" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {draft.turnpoints.map((row, index) => (
              <tr
                key={row.key}
                onDragOver={handleRowDragOver(index)}
                onDragLeave={handleRowDragLeave(index)}
                onDrop={handleRowDrop(index)}
                className={[
                  dragOverIndex === index ? 'drag-over' : '',
                  draggingIndex === index ? 'is-dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined}
              >
                <td className="welcome-task-edit-drag-col">
                  <span
                    className="welcome-task-edit-drag-handle"
                    title="Drag to reorder"
                    aria-label={`Reorder turnpoint ${index + 1}`}
                    draggable
                    onDragStart={handleDragStart(index)}
                    onDragEnd={handleDragEnd}
                  >
                    <Icon icon={GripVertical} size="sm" />
                  </span>
                </td>
                <td>{index + 1}</td>
                <td>
                  <input
                    type="text"
                    value={row.name}
                    aria-label={`Turnpoint ${index + 1} name`}
                    onChange={(e) =>
                      commitDraft((prev) => updateTurnpointRow(prev, index, 'name', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.lat}
                    aria-label={`Turnpoint ${index + 1} latitude`}
                    onChange={(e) =>
                      commitDraft((prev) => updateTurnpointRow(prev, index, 'lat', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.lon}
                    aria-label={`Turnpoint ${index + 1} longitude`}
                    onChange={(e) =>
                      commitDraft((prev) => updateTurnpointRow(prev, index, 'lon', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.radius}
                    aria-label={`Turnpoint ${index + 1} radius`}
                    onChange={(e) =>
                      commitDraft((prev) => updateTurnpointRow(prev, index, 'radius', e.target.value))
                    }
                  />
                </td>
                <td className="welcome-task-edit-type-col">
                  <select
                    value={row.type}
                    aria-label={`Turnpoint ${index + 1} type`}
                    onChange={(e) =>
                      commitDraft((prev) =>
                        updateTurnpointRow(prev, index, 'type', e.target.value as TurnpointTypeOption),
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
                    className="welcome-icon-button danger"
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
            onChange={(e) => commitDraft((prev) => ({ ...prev, startTime: e.target.value }))}
          />
        </label>
      </div>
    </div>
  );
}
