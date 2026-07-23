import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import {
  XCDEMON_DEFAULT_LEAGUE_ID,
  fetchXcdemonActiveLeagues,
  fetchXcdemonResults,
  importXcdemonTask,
  type XcdemonImportResult,
  type XcdemonLeague,
  type XcdemonLeagueTask,
} from '../lib/xcdemon';
import { Icon, IconButtonContent, XcdemonButtonContent } from './Icon';

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
  const [activeLeagues, setActiveLeagues] = useState<XcdemonLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number>(XCDEMON_DEFAULT_LEAGUE_ID);
  const [leagueName, setLeagueName] = useState('');
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [tasks, setTasks] = useState<XcdemonLeagueTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingLeagues(true);

    void fetchXcdemonActiveLeagues()
      .then((leagues) => {
        if (cancelled) return;
        if (leagues.length === 0) {
          throw new Error('No active leagues were found on XCDemon.');
        }
        setActiveLeagues(leagues);
        setSelectedLeagueId(leagues[0]?.id ?? XCDEMON_DEFAULT_LEAGUE_ID);
      })
      .catch((err) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : 'Could not load XCDemon leagues.');
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoadingLeagues(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, onClose, onError]);

  useEffect(() => {
    if (!open || loadingLeagues || activeLeagues.length === 0) return;

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
        onError(err instanceof Error ? err.message : 'Could not load XCDemon tasks.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, loadingLeagues, activeLeagues.length, selectedLeagueId, selectedYear, onError]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const handleImport = async () => {
    if (!selectedTask) return;

    setImporting(true);
    try {
      const result = await importXcdemonTask(selectedTask);
      onImported(result);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not import task from XCDemon.');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const busy = loadingLeagues || loadingCatalog || importing;

  return (
    <div className="xcdemon-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="xcdemon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xcdemon-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="xcdemon-dialog-header">
          <div>
            <h2 id="xcdemon-dialog-title">Import from XCDemon</h2>
            <p className="xcdemon-dialog-subtitle">
              {leagueName || 'Choose an active league and task'}
            </p>
          </div>
          <button type="button" className="welcome-icon-button" aria-label="Close" onClick={onClose}>
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="xcdemon-dialog-body">
          <label className="welcome-pref-field">
            Active league
            <select
              value={selectedLeagueId}
              disabled={busy || activeLeagues.length === 0}
              onChange={(event) => {
                setSelectedLeagueId(Number(event.target.value));
                setSelectedTaskId('');
              }}
            >
              {activeLeagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>

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

          <label className="welcome-pref-field">
            Task with results
            <select
              value={selectedTaskId}
              disabled={busy || tasks.length === 0}
              onChange={(event) => setSelectedTaskId(event.target.value)}
            >
              <option value="">Select a task…</option>
              {tasks.map((task) => (
                <option key={task.taskId} value={task.taskId}>
                  {task.label}
                  {!task.igcZipUrl ? ' (no IGC zip)' : ''}
                </option>
              ))}
            </select>
          </label>

          {(loadingLeagues || loadingCatalog) && (
            <p className="xcdemon-dialog-status">
              <Icon icon={LoaderCircle} size="sm" className="spin-icon" />
              {loadingLeagues ? 'Loading leagues…' : 'Loading tasks…'}
            </p>
          )}

          {!loadingLeagues && !loadingCatalog && tasks.length === 0 && (
            <p className="xcdemon-dialog-hint">No tasks with TASK RESULTS were found for this year.</p>
          )}

          {selectedTask && (
            <div className="xcdemon-dialog-summary">
              <div>{selectedTask.location}</div>
              <div>{selectedTask.date}</div>
              <div>{selectedTask.status}</div>
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
            className="welcome-inline-button xcdemon-import-button"
            disabled={!selectedTask || importing}
            onClick={() => void handleImport()}
          >
            {importing ? (
              <IconButtonContent icon={LoaderCircle}>Importing…</IconButtonContent>
            ) : (
              <XcdemonButtonContent>Import task</XcdemonButtonContent>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
