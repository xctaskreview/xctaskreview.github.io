import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { TaskEditDraft, XcTask } from '../lib/types';
import {
  applyTurnpointTypeChange,
  createBlankXcTask,
  createEmptyTaskEditDraft,
  createEmptyTurnpointRow,
  createTaskEditDraft,
  taskEffectivelyEquals,
  tryApplyTaskEditDraft,
} from '../lib/xctask';
import { Icon, IconButtonContent } from './Icon';
import { TurnpointTypePicker } from './TurnpointTypePicker';

interface TaskEditFormProps {
  task: XcTask | null;
  locationLabel?: string | null;
  onChange: (task: XcTask) => void;
}

type EditableTurnpointField = 'name' | 'lat' | 'lon' | 'radius' | 'type';

interface TurnpointDragState {
  fromIndex: number;
  overIndex: number;
  pointerId: number;
}

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

function readTurnpointIndexFromPoint(clientX: number, clientY: number): number | null {
  const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-turnpoint-index]');
  if (!hit) return null;
  const index = Number((hit as HTMLElement).dataset.turnpointIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

const DRAG_SCROLL_EDGE_PX = 72;
const DRAG_SCROLL_MAX_STEP = 6;

function findVerticalScrollContainer(start: Element | null): HTMLElement | null {
  let el = start?.parentElement ?? null;
  while (el) {
    if (!(el instanceof HTMLElement)) break;
    const { overflowY } = getComputedStyle(el);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function autoScrollContainer(container: HTMLElement, clientY: number): void {
  const rect = container.getBoundingClientRect();
  if (clientY < rect.top + DRAG_SCROLL_EDGE_PX) {
    const intensity = (rect.top + DRAG_SCROLL_EDGE_PX - clientY) / DRAG_SCROLL_EDGE_PX;
    container.scrollTop -= DRAG_SCROLL_MAX_STEP * Math.min(1, intensity);
  } else if (clientY > rect.bottom - DRAG_SCROLL_EDGE_PX) {
    const intensity = (clientY - (rect.bottom - DRAG_SCROLL_EDGE_PX)) / DRAG_SCROLL_EDGE_PX;
    container.scrollTop += DRAG_SCROLL_MAX_STEP * Math.min(1, intensity);
  }
}

export function TaskEditForm({ task, locationLabel = null, onChange }: TaskEditFormProps) {
  const isCreateMode = task === null;
  const [draft, setDraft] = useState(() =>
    task ? createTaskEditDraft(task, locationLabel) : createEmptyTaskEditDraft(),
  );
  const skipSyncRef = useRef(false);
  const dragRef = useRef<TurnpointDragState | null>(null);
  const [dragVisual, setDragVisual] = useState<Omit<TurnpointDragState, 'pointerId'> | null>(null);
  const [ghostPoint, setGhostPoint] = useState<{ x: number; y: number } | null>(null);
  const [dropFlashKey, setDropFlashKey] = useState<string | null>(null);
  const dropFlashTimerRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const listWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const lastPointerYRef = useRef(0);
  const autoScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    if (!task) {
      setDraft(createEmptyTaskEditDraft());
      return;
    }
    setDraft(createTaskEditDraft(task, locationLabel));
  }, [task, locationLabel]);

  useEffect(() => {
    return () => {
      if (dropFlashTimerRef.current !== null) {
        window.clearTimeout(dropFlashTimerRef.current);
      }
    };
  }, []);

  const commitDraft = (next: TaskEditDraft | ((prev: TaskEditDraft) => TaskEditDraft)) => {
    setDraft((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const baseTask = task ?? createBlankXcTask();
      const applied = tryApplyTaskEditDraft(baseTask, resolved);
      if (applied && (!task || !taskEffectivelyEquals(task, applied))) {
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
      if (task && prev.turnpoints.length <= 1) return prev;
      return {
        ...prev,
        turnpoints: prev.turnpoints.filter((_, rowIndex) => rowIndex !== index),
      };
    });
  };

  const flashDroppedRow = (key: string) => {
    if (dropFlashTimerRef.current !== null) {
      window.clearTimeout(dropFlashTimerRef.current);
    }
    setDropFlashKey(key);
    dropFlashTimerRef.current = window.setTimeout(() => {
      setDropFlashKey(null);
      dropFlashTimerRef.current = null;
    }, 480);
  };

  const updateDragOverIndex = (overIndex: number) => {
    const drag = dragRef.current;
    if (!drag || drag.overIndex === overIndex) return;
    drag.overIndex = overIndex;
    setDragVisual({ fromIndex: drag.fromIndex, overIndex });
  };

  const finishPointerDrag = (commit: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGhostPoint(null);
    setDragVisual(null);

    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }

    document.documentElement.classList.remove('turnpoint-drag-active');

    if (!drag) return;

    const { fromIndex, overIndex } = drag;
    if (!commit || fromIndex === overIndex) return;

    const movedKey = draftRef.current.turnpoints[fromIndex]?.key;
    commitDraft((prev) => reorderTurnpoints(prev, fromIndex, overIndex));
    if (movedKey) flashDroppedRow(movedKey);
  };

  useEffect(() => {
    if (dragVisual === null) return;

    scrollContainerRef.current = findVerticalScrollContainer(listWrapRef.current);
    document.documentElement.classList.add('turnpoint-drag-active');

    const runAutoScroll = () => {
      const container = scrollContainerRef.current;
      if (container && dragRef.current) {
        autoScrollContainer(container, lastPointerYRef.current);
      }
      if (dragRef.current) {
        autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
      }
    };
    autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);

    const handleWindowPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      lastPointerYRef.current = event.clientY;
      setGhostPoint({ x: event.clientX, y: event.clientY });

      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        if (event.cancelable) event.preventDefault();
      }

      const overIndex = readTurnpointIndexFromPoint(event.clientX, event.clientY);
      if (overIndex !== null) {
        updateDragOverIndex(overIndex);
      }
    };

    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      finishPointerDrag(true);
    };

    const endDragOnTouch = () => {
      if (dragRef.current) finishPointerDrag(true);
    };

    const endDragOnHide = () => {
      if (dragRef.current) finishPointerDrag(false);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false, capture: true });
    window.addEventListener('pointerup', endDrag, { capture: true });
    window.addEventListener('pointercancel', endDrag, { capture: true });
    window.addEventListener('touchend', endDragOnTouch, { capture: true, passive: true });
    window.addEventListener('touchcancel', endDragOnTouch, { capture: true, passive: true });
    window.addEventListener('blur', endDragOnHide);
    document.addEventListener('visibilitychange', endDragOnHide);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true });
      window.removeEventListener('pointerup', endDrag, { capture: true });
      window.removeEventListener('pointercancel', endDrag, { capture: true });
      window.removeEventListener('touchend', endDragOnTouch, { capture: true });
      window.removeEventListener('touchcancel', endDragOnTouch, { capture: true });
      window.removeEventListener('blur', endDragOnHide);
      document.removeEventListener('visibilitychange', endDragOnHide);

      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }

      document.documentElement.classList.remove('turnpoint-drag-active');

      if (dragRef.current) {
        finishPointerDrag(false);
      }
    };
  }, [dragVisual !== null]);

  const handleHandlePointerDown = (index: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    dragRef.current = { fromIndex: index, overIndex: index, pointerId: event.pointerId };
    lastPointerYRef.current = event.clientY;
    setDragVisual({ fromIndex: index, overIndex: index });
    setGhostPoint({ x: event.clientX, y: event.clientY });
  };

  const draggedRow = dragVisual ? draft.turnpoints[dragVisual.fromIndex] : null;

  const renderTurnpointEntry = (row: TaskEditDraft['turnpoints'][number], index: number) => {
    const isDragSource = dragVisual?.fromIndex === index;
    const isDropTarget =
      dragVisual !== null && dragVisual.overIndex === index && dragVisual.fromIndex !== index;
    const isJustDropped = dropFlashKey === row.key;

    if (isDragSource) {
      return (
        <li
          key={row.key}
          className="welcome-task-edit-entry welcome-task-edit-drag-placeholder"
          data-turnpoint-index={index}
          aria-hidden="true"
        />
      );
    }

    return (
      <li
        key={row.key}
        className={[
          'welcome-task-edit-entry',
          isDropTarget ? 'drag-insert-target' : '',
          isJustDropped ? 'just-dropped' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-turnpoint-index={index}
      >
        <div className="welcome-task-edit-entry-top">
          <span className="welcome-task-edit-drag-col">
            <span
              className="welcome-task-edit-drag-handle"
              title="Drag to reorder"
              aria-label={`Reorder turnpoint ${index + 1}`}
              onPointerDown={handleHandlePointerDown(index)}
            >
              <Icon icon={GripVertical} size="sm" />
            </span>
          </span>
          <span className="welcome-task-edit-entry-index">{index + 1}</span>
          <label className="welcome-task-edit-field welcome-task-edit-field-name">
            <span className="welcome-task-edit-field-label">Name</span>
            <input
              type="text"
              value={row.name}
              placeholder="Name"
              aria-label={`Turnpoint ${index + 1} name`}
              onChange={(e) =>
                commitDraft((prev) => updateTurnpointRow(prev, index, 'name', e.target.value))
              }
            />
          </label>
        </div>
        <div className="welcome-task-edit-entry-coords">
          <label className="welcome-task-edit-field welcome-task-edit-field-lat">
          <span className="welcome-task-edit-field-label">Lat</span>
          <input
            type="text"
            inputMode="decimal"
            value={row.lat}
            placeholder="Lat"
            aria-label={`Turnpoint ${index + 1} latitude`}
            onChange={(e) =>
              commitDraft((prev) => updateTurnpointRow(prev, index, 'lat', e.target.value))
            }
          />
        </label>
        <label className="welcome-task-edit-field welcome-task-edit-field-lon">
          <span className="welcome-task-edit-field-label">Lon</span>
          <input
            type="text"
            inputMode="decimal"
            value={row.lon}
            placeholder="Lon"
            aria-label={`Turnpoint ${index + 1} longitude`}
            onChange={(e) =>
              commitDraft((prev) => updateTurnpointRow(prev, index, 'lon', e.target.value))
            }
          />
        </label>
        </div>
        <div className="welcome-task-edit-entry-meta">
          <label className="welcome-task-edit-field welcome-task-edit-field-radius">
          <span className="welcome-task-edit-field-label">Radius (m)</span>
          <input
            type="text"
            inputMode="numeric"
            value={row.radius}
            placeholder="Radius"
            aria-label={`Turnpoint ${index + 1} radius`}
            onChange={(e) =>
              commitDraft((prev) => updateTurnpointRow(prev, index, 'radius', e.target.value))
            }
          />
        </label>
        <label className="welcome-task-edit-field welcome-task-edit-type-field">
          <span className="welcome-task-edit-field-label">Type</span>
          <TurnpointTypePicker
            turnpointIndex={index}
            value={row.type}
            turnpoints={draft.turnpoints}
            onApplyType={(nextType) =>
              commitDraft((prev) => applyTurnpointTypeChange(prev, index, nextType))
            }
          />
        </label>
        </div>
        <span className="welcome-task-edit-actions-col">
          <button
            type="button"
            className="welcome-icon-button danger"
            aria-label={`Remove turnpoint ${index + 1}`}
            disabled={Boolean(task) && draft.turnpoints.length <= 1}
            onClick={() => handleRemoveTurnpoint(index)}
          >
            <Icon icon={Trash2} size="sm" />
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className={`welcome-task-edit${isCreateMode ? ' create-mode' : ''}`}>
      {isCreateMode && (
        <div className="welcome-task-create-fields">
          <input
            type="text"
            className="welcome-task-name-input"
            value={draft.name}
            placeholder="Task name"
            aria-label="Task name"
            onChange={(e) => commitDraft((prev) => ({ ...prev, name: e.target.value }))}
            onClick={(e) => e.stopPropagation()}
          />
          <input
            type="text"
            className="welcome-task-meta-input"
            value={draft.location}
            placeholder="Location"
            aria-label="Task location"
            onChange={(e) => commitDraft((prev) => ({ ...prev, location: e.target.value }))}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="welcome-task-edit-toolbar">
        <label className="welcome-task-edit-start">
          <span>Start time</span>
          <input
            type="text"
            value={draft.startTime}
            placeholder="HH:MM or HH:MM:SS"
            aria-label="Task start time"
            onChange={(e) => commitDraft((prev) => ({ ...prev, startTime: e.target.value }))}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      </div>

      <div className="welcome-task-edit-list-wrap" ref={listWrapRef}>
        {draft.turnpoints.length === 0 ? (
          <p className="welcome-task-edit-empty">No turnpoints yet — add one below</p>
        ) : (
          <>
            <div className="welcome-task-edit-list-header" aria-hidden="true">
              <span className="welcome-task-edit-drag-col" />
              <span>#</span>
              <span>Name</span>
              <span>Lat</span>
              <span>Lon</span>
              <span>Radius (m)</span>
              <span>Type</span>
              <span className="welcome-task-edit-actions-col" />
            </div>
            <ul className={`welcome-task-edit-list${dragVisual ? ' is-reordering' : ''}`}>
              {draft.turnpoints.map((row, index) => renderTurnpointEntry(row, index))}
            </ul>
          </>
        )}
      </div>

      {dragVisual && ghostPoint && draggedRow && (
        <div
          className="welcome-task-edit-drag-ghost"
          style={{ left: ghostPoint.x, top: ghostPoint.y }}
          aria-hidden="true"
        >
          <span className="welcome-task-edit-drag-ghost-index">#{dragVisual.fromIndex + 1}</span>
          <span className="welcome-task-edit-drag-ghost-label">
            {draggedRow.name.trim() || 'Turnpoint'}
          </span>
        </div>
      )}

      <button type="button" className="welcome-text-button" onClick={handleAddTurnpoint}>
        <IconButtonContent icon={Plus}>Add turnpoint</IconButtonContent>
      </button>
    </div>
  );
}
