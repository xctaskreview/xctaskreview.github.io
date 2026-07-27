import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import {
  fetchCivlEvents,
  fetchCivlResults,
  fetchCivlYears,
  importCivlTask,
  type CivlEvent,
  type CivlImportResult,
  type CivlTask,
  type CivlYearOption,
} from '../lib/civl';
import { useStableCallbackRef } from '../lib/useStableCallbackRef';
import { Icon } from './Icon';
import { ImportCatalogPicker } from './ImportCatalogPicker';
import { ModalDialogBackdrop } from './ModalDialogBackdrop';

interface CivlImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: CivlImportResult) => void;
  onError: (message: string) => void;
}

export function CivlImportDialog({
  open,
  onClose,
  onImported,
  onError,
}: CivlImportDialogProps) {
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [importing, setImporting] = useState(false);
  const [yearOptions, setYearOptions] = useState<CivlYearOption[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [events, setEvents] = useState<CivlEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | ''>('');
  const [eventName, setEventName] = useState('');
  const [tasks, setTasks] = useState<CivlTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const onErrorRef = useStableCallbackRef(onError);
  const onImportedRef = useStableCallbackRef(onImported);
  const onCloseRef = useStableCallbackRef(onClose);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingYears(true);

    void fetchCivlYears()
      .then((years) => {
        if (cancelled) return;
        if (years.length === 0) {
          throw new Error('No event years were found on CIVL Comps.');
        }
        setYearOptions(years);
        const currentYear = new Date().getFullYear();
        setSelectedYear(years.find((year) => year.year === currentYear)?.year ?? years[0].year);
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not load CIVL Comps years.');
      })
      .finally(() => {
        if (!cancelled) setLoadingYears(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, onErrorRef]);

  const selectedYearOption = useMemo(
    () => yearOptions.find((option) => option.year === selectedYear) ?? null,
    [yearOptions, selectedYear],
  );

  useEffect(() => {
    if (!open || loadingYears || !selectedYearOption) return;

    let cancelled = false;
    setLoadingEvents(true);
    setSelectedEventId('');
    setSelectedTaskId('');
    setTasks([]);
    setEventName('');

    void fetchCivlEvents(selectedYearOption.pastRange)
      .then((loadedEvents) => {
        if (cancelled) return;
        setEvents(loadedEvents);
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not load CIVL Comps events.');
      })
      .finally(() => {
        if (!cancelled) setLoadingEvents(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, loadingYears, selectedYearOption, onErrorRef]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    if (!open || !selectedEvent) return;

    let cancelled = false;
    setLoadingTasks(true);
    setSelectedTaskId('');

    void fetchCivlResults(selectedEvent.resultsUrl)
      .then((results) => {
        if (cancelled) return;
        setEventName(results.eventName);
        setTasks(results.tasks);
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not load CIVL Comps tasks.');
      })
      .finally(() => {
        if (!cancelled) setLoadingTasks(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedEvent, onErrorRef]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  useEffect(() => {
    if (!open || !selectedTask) return;

    let cancelled = false;
    setImporting(true);
    const importEventName = eventName || selectedEvent?.title;

    void importCivlTask(selectedTask, importEventName)
      .then((result) => {
        if (cancelled) return;
        onImportedRef.current(result);
        onCloseRef.current();
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not import task from CIVL Comps.');
        setSelectedTaskId('');
      })
      .finally(() => {
        if (!cancelled) setImporting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedTask, eventName, selectedEvent, onCloseRef, onErrorRef, onImportedRef]);

  const eventOptions = useMemo(() => {
    const all = events.map((event) => ({
      value: String(event.id),
      label: event.label,
    }));
    if (selectedEventId === '') return all;
    const selected = all.find((option) => option.value === String(selectedEventId));
    return selected ? [selected] : all;
  }, [events, selectedEventId]);

  const clearSelectedEvent = () => {
    setSelectedEventId('');
    setSelectedTaskId('');
    setTasks([]);
    setEventName('');
  };

  const busy = loadingYears || loadingEvents || loadingTasks || importing;

  return (
    <ModalDialogBackdrop open={open} onClose={onClose}>
      <div
        className="xcdemon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="civl-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="xcdemon-dialog-header">
          <div>
            <h2 id="civl-dialog-title">Import from CIVL Comps</h2>
            <p className="xcdemon-dialog-subtitle">
              {eventName ||
                selectedEvent?.title ||
                'Choose a year, event, and task. Only events with published tasks and IGC track zips are listed.'}
            </p>
          </div>
          <button type="button" className="welcome-icon-button" aria-label="Close" onClick={onClose}>
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="xcdemon-dialog-body">
          <label className="welcome-pref-field">
            Season year
            <select
              value={selectedYear}
              disabled={busy || yearOptions.length === 0}
              onChange={(event) => {
                setSelectedYear(Number(event.target.value));
                setSelectedEventId('');
                setSelectedTaskId('');
              }}
            >
              {yearOptions.map((option) => (
                <option key={`${option.year}-${option.pastRange}`} value={option.year}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <ImportCatalogPicker
            label="Event with results"
            value={selectedEventId === '' ? '' : String(selectedEventId)}
            disabled={busy || events.length === 0}
            loading={loadingEvents}
            loadingHint="Loading events…"
            placeholder="Select an event…"
            emptyHint="No events with results were found for this year."
            filterable={selectedEventId === ''}
            searchPlaceholder="Filter events…"
            noMatchesHint="No events match your filter."
            options={eventOptions}
            onReselectSelected={selectedEventId !== '' ? clearSelectedEvent : undefined}
            onChange={(nextValue) => {
              setSelectedEventId(nextValue ? Number(nextValue) : '');
              setSelectedTaskId('');
            }}
          />

          {selectedEvent && (
            <p className="xcdemon-dialog-hint import-source-page-link">
              <a href={selectedEvent.eventLink} target="_blank" rel="noopener noreferrer">
                Open event on CIVL Comps
              </a>
            </p>
          )}

          <ImportCatalogPicker
            label="Task with IGC zip"
            value={selectedTaskId}
            disabled={busy || !selectedEvent}
            loading={loadingEvents || loadingTasks}
            placeholder="Select a task…"
            emptyHint="Select an event to load tasks."
            options={tasks.map((task) => ({
              value: task.taskId,
              label: task.label,
            }))}
            onChange={setSelectedTaskId}
          />

          {(loadingYears || loadingEvents || loadingTasks || importing) && (
            <p className="xcdemon-dialog-status">
              <Icon icon={LoaderCircle} size="sm" className="spin-icon" />
              {importing
                ? `Importing ${selectedTask?.label ?? 'task'}…`
                : loadingYears
                  ? 'Loading years…'
                  : loadingEvents
                    ? 'Loading events…'
                    : 'Loading tasks…'}
            </p>
          )}

          {!loadingEvents && selectedYearOption && events.length === 0 && (
            <p className="xcdemon-dialog-hint">No events with results were found for this year.</p>
          )}

          {!loadingTasks && !importing && selectedEvent && tasks.length === 0 && (
            <p className="xcdemon-dialog-hint">
              No tasks with Overall results and an IGC zip were found for this event.
            </p>
          )}
        </div>

        <div className="xcdemon-dialog-actions">
          <button type="button" className="welcome-text-button" onClick={onClose} disabled={importing}>
            Cancel
          </button>
        </div>
      </div>
    </ModalDialogBackdrop>
  );
}
