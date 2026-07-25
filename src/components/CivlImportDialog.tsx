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
import { CivlButtonContent, Icon, IconButtonContent } from './Icon';
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

  const handleImport = async () => {
    if (!selectedTask) return;

    setImporting(true);
    try {
      const result = await importCivlTask(selectedTask, eventName || selectedEvent?.title);
      onImported(result);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not import task from CIVL Comps.');
    } finally {
      setImporting(false);
    }
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
              {eventName || selectedEvent?.title || 'Choose a year, event, and task'}
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
            onChange={(nextValue) => {
              setSelectedEventId(nextValue ? Number(nextValue) : '');
              setSelectedTaskId('');
            }}
          />

          {selectedEventId !== '' && !loadingEvents && events.length > 1 && (
            <button type="button" className="welcome-text-button" onClick={clearSelectedEvent}>
              Show all events
            </button>
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
              label: `${task.label}${!task.igcZipUrl ? ' (no IGC zip)' : ''}`,
            }))}
            onChange={setSelectedTaskId}
          />

          {(loadingYears || loadingEvents || loadingTasks) && (
            <p className="xcdemon-dialog-status">
              <Icon icon={LoaderCircle} size="sm" className="spin-icon" />
              {loadingYears ? 'Loading years…' : loadingEvents ? 'Loading events…' : 'Loading tasks…'}
            </p>
          )}

          {!loadingEvents && selectedYearOption && events.length === 0 && (
            <p className="xcdemon-dialog-hint">No events with results were found for this year.</p>
          )}

          {!loadingTasks && selectedEvent && tasks.length === 0 && (
            <p className="xcdemon-dialog-hint">
              No tasks with Overall results and an IGC zip were found for this event.
            </p>
          )}

          {selectedTask && (
            <div className="xcdemon-dialog-summary">
              <div>{selectedTask.name}</div>
              <div>{selectedTask.date}</div>
              {selectedTask.igcZipUrl ? (
                <div>IGC zip will be imported with the task.</div>
              ) : (
                <div className="xcdemon-dialog-warning">This task has results but no IGC zip link.</div>
              )}
            </div>
          )}
        </div>

        <div className="xcdemon-dialog-actions">
          <button type="button" className="welcome-text-button" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            type="button"
            className="welcome-inline-button civl-import-button"
            disabled={!selectedTask || importing}
            onClick={() => void handleImport()}
          >
            {importing ? (
              <IconButtonContent icon={LoaderCircle}>Importing…</IconButtonContent>
            ) : (
              <CivlButtonContent>Import task</CivlButtonContent>
            )}
          </button>
        </div>
      </div>
    </ModalDialogBackdrop>
  );
}
