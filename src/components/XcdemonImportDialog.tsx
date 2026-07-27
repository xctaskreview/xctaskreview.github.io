import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import {
  fetchXcdemonArchivedLeagues,
  fetchXcdemonResults,
  importXcdemonTask,
  type XcdemonArchivedLeague,
  type XcdemonImportResult,
  type XcdemonLeagueTask,
} from '../lib/xcdemon';
import { useStableCallbackRef } from '../lib/useStableCallbackRef';
import { Icon } from './Icon';
import { ImportCatalogPicker } from './ImportCatalogPicker';
import { ModalDialogBackdrop } from './ModalDialogBackdrop';

interface XcdemonImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: XcdemonImportResult) => void;
  onError: (message: string) => void;
}

export function XcdemonImportDialog({
  open,
  onClose,
  onImported,
  onError,
}: XcdemonImportDialogProps) {
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [archivedLeagues, setArchivedLeagues] = useState<XcdemonArchivedLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | ''>('');
  const [leagueName, setLeagueName] = useState('');
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [tasks, setTasks] = useState<XcdemonLeagueTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const onErrorRef = useStableCallbackRef(onError);
  const onImportedRef = useStableCallbackRef(onImported);
  const onCloseRef = useStableCallbackRef(onClose);

  const selectedLeague = useMemo(
    () => archivedLeagues.find((league) => league.leagueId === selectedLeagueId) ?? null,
    [archivedLeagues, selectedLeagueId],
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingLeagues(true);
    setSelectedLeagueId('');
    setSelectedTaskId('');

    void fetchXcdemonArchivedLeagues()
      .then((leagues) => {
        if (cancelled) return;
        setArchivedLeagues(leagues);
        const first = leagues[0];
        setSelectedLeagueId(first?.leagueId ?? '');
        if (first) setSelectedYear(first.defaultYear);
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not load XCDemon leagues.');
      })
      .finally(() => {
        if (!cancelled) setLoadingLeagues(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, onErrorRef]);

  useEffect(() => {
    if (!open || loadingLeagues || selectedLeagueId === '') return;

    let cancelled = false;
    setLoadingCatalog(true);
    setSelectedTaskId('');

    void fetchXcdemonResults(selectedLeagueId, selectedYear)
      .then((results) => {
        if (cancelled) return;
        setLeagueName(results.leagueName);
        setYears(results.years);
        setTasks(results.tasks);
        if (!results.years.includes(selectedYear) && results.years.length > 0) {
          setSelectedYear(results.years[0]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not load XCDemon tasks.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, loadingLeagues, selectedLeagueId, selectedYear, onErrorRef]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  useEffect(() => {
    if (!open || !selectedTask) return;

    let cancelled = false;
    setImporting(true);

    void importXcdemonTask(selectedTask)
      .then((result) => {
        if (cancelled) return;
        onImportedRef.current(result);
        onCloseRef.current();
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not import task from XCDemon.');
        setSelectedTaskId('');
      })
      .finally(() => {
        if (!cancelled) setImporting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedTask, onCloseRef, onErrorRef, onImportedRef]);

  const busy = loadingLeagues || loadingCatalog || importing;

  return (
    <ModalDialogBackdrop open={open} onClose={onClose}>
      <div
        className="xcdemon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xcdemon-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="xcdemon-dialog-header">
          <div>
            <h2 id="xcdemon-dialog-title">Import from XCDemon</h2>
            <p className="xcdemon-dialog-subtitle">
              {selectedLeague?.leagueName || leagueName || 'Choose a league and task'}
            </p>
          </div>
          <button type="button" className="welcome-icon-button" aria-label="Close" onClick={onClose}>
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="xcdemon-dialog-body">
          <ImportCatalogPicker
            label="League"
            value={selectedLeagueId === '' ? '' : String(selectedLeagueId)}
            disabled={busy}
            loading={loadingLeagues}
            loadingHint="Loading leagues…"
            placeholder="Select a league…"
            emptyHint="No leagues loaded."
            filterable
            searchPlaceholder="Type to filter leagues…"
            noMatchesHint="No matching leagues."
            options={archivedLeagues.map((league) => ({
              value: String(league.leagueId),
              label: league.leagueName,
            }))}
            onChange={(value) => {
              const leagueId = Number(value);
              const league = archivedLeagues.find((entry) => entry.leagueId === leagueId);
              setSelectedLeagueId(leagueId);
              if (league) setSelectedYear(league.defaultYear);
              setSelectedTaskId('');
            }}
          />

          <label className="welcome-pref-field">
            Season year
            <select
              value={selectedYear}
              disabled={busy || years.length === 0}
              onChange={(event) => {
                setSelectedYear(Number(event.target.value));
                setSelectedTaskId('');
              }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <ImportCatalogPicker
            label="Task with results"
            value={selectedTaskId}
            disabled={busy}
            loading={loadingCatalog}
            placeholder="Select a task…"
            emptyHint="No tasks loaded for this year."
            options={tasks.map((task) => ({
              value: task.taskId,
              label: `${task.label}${!task.igcZipUrl ? ' (no IGC zip)' : ''}`,
            }))}
            onChange={setSelectedTaskId}
          />

          {(loadingLeagues || loadingCatalog || importing) && (
            <p className="xcdemon-dialog-status">
              <Icon icon={LoaderCircle} size="sm" className="spin-icon" />
              {importing
                ? `Importing ${selectedTask?.label ?? 'task'}…`
                : loadingLeagues
                  ? 'Loading leagues…'
                  : 'Loading tasks…'}
            </p>
          )}

          {!loadingLeagues && !loadingCatalog && !importing && selectedLeague && tasks.length === 0 && (
            <p className="xcdemon-dialog-hint">No tasks with TASK RESULTS were found for this year.</p>
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
