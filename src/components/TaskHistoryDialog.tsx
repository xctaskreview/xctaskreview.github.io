import { useEffect, useState } from 'react';
import { History, LoaderCircle, MapPinned, Pin, PinOff, Route, Ruler, Trash2, X } from 'lucide-react';
import {
  deleteTaskHistoryEntry,
  listTaskHistory,
  setTaskHistoryPinned,
  type TaskHistoryEntry,
} from '../lib/taskHistory';
import { formatDistance, type AppPreferences } from '../lib/preferences';
import { Icon, IconButtonContent } from './Icon';

interface TaskHistoryDialogProps {
  open: boolean;
  preferences: AppPreferences;
  onClose: () => void;
  onSelect: (entry: TaskHistoryEntry) => void;
  onError: (message: string) => void;
}

export function TaskHistoryDialog({
  open,
  preferences,
  onClose,
  onSelect,
  onError,
}: TaskHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<TaskHistoryEntry[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    void listTaskHistory()
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch((err) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : 'Could not load task history.');
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, onClose, onError]);

  const refresh = async () => {
    setEntries(await listTaskHistory());
  };

  const handleTogglePinned = async (entry: TaskHistoryEntry) => {
    try {
      await setTaskHistoryPinned(entry.id, !entry.pinned);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update pinned task.');
    }
  };

  const handleDelete = async (entry: TaskHistoryEntry) => {
    try {
      await deleteTaskHistoryEntry(entry.id);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete task from history.');
    }
  };

  if (!open) return null;

  return (
    <div className="xcdemon-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="xcdemon-dialog task-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-history-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="xcdemon-dialog-header">
          <div>
            <h2 id="task-history-dialog-title">
              <span className="task-history-dialog-title">
                <Icon icon={History} size="sm" />
                Task history
              </span>
            </h2>
            <p className="xcdemon-dialog-subtitle">Saved tasks in this browser, keyed by name</p>
          </div>
          <button type="button" className="welcome-icon-button" aria-label="Close" onClick={onClose}>
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="xcdemon-dialog-body task-history-dialog-body">
          {loading && (
            <p className="xcdemon-dialog-status">
              <Icon icon={LoaderCircle} size="sm" className="spin-icon" />
              Loading history…
            </p>
          )}

          {!loading && entries.length === 0 && (
            <p className="xcdemon-dialog-hint">
              No tasks in history yet. Use “Save” on the welcome screen to add one.
            </p>
          )}

          {!loading && entries.length > 0 && (
            <ul className="task-history-list">
              {entries.map((entry) => (
                <li key={entry.id} className={`task-history-item${entry.pinned ? ' pinned' : ''}`}>
                  <button
                    type="button"
                    className="task-history-item-main"
                    onClick={() => {
                      onSelect(entry);
                      onClose();
                    }}
                  >
                    <div className="task-history-item-name">
                      {entry.pinned && <Icon icon={Pin} size="xs" className="task-history-pin-indicator" />}
                      <span>{entry.name}</span>
                    </div>
                    <div className="task-history-item-meta">
                      <span>
                        <Icon icon={MapPinned} size="xs" />
                        {entry.location || 'Unknown location'}
                      </span>
                      <span>
                        <Icon icon={Route} size="xs" />
                        {entry.legCount} {entry.legCount === 1 ? 'leg' : 'legs'}
                      </span>
                      <span>
                        <Icon icon={Ruler} size="xs" />
                        {formatDistance(entry.optimizedDistanceKm, preferences.distanceUnit)}
                      </span>
                    </div>
                  </button>
                  <div className="task-history-item-actions">
                    <button
                      type="button"
                      className="welcome-icon-button"
                      aria-label={entry.pinned ? 'Unpin task' : 'Pin task'}
                      title={entry.pinned ? 'Unpin' : 'Pin'}
                      onClick={() => void handleTogglePinned(entry)}
                    >
                      <Icon icon={entry.pinned ? PinOff : Pin} size="sm" />
                    </button>
                    <button
                      type="button"
                      className="welcome-icon-button danger"
                      aria-label="Delete from history"
                      title="Delete"
                      onClick={() => void handleDelete(entry)}
                    >
                      <Icon icon={Trash2} size="sm" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="xcdemon-dialog-actions">
          <button type="button" className="welcome-text-button" onClick={onClose}>
            <IconButtonContent icon={X}>Close</IconButtonContent>
          </button>
        </div>
      </div>
    </div>
  );
}
