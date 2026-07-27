import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import {
  buildArchivedYearsFromSeasons,
  fetchXcdemonArchivedSeasons,
  fetchXcdemonLeaguesWithTasksForYear,
  getXcdemonResultsUrl,
  importXcdemonTask,
  type XcdemonArchivedSeason,
  type XcdemonImportResult,
  type XcdemonLeagueTask,
  type XcdemonLeagueWithTasks,
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
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [importing, setImporting] = useState(false);
  const [archivedSeasons, setArchivedSeasons] = useState<XcdemonArchivedSeason[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [leaguesForYear, setLeaguesForYear] = useState<XcdemonLeagueWithTasks[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | ''>('');
  const [leagueName, setLeagueName] = useState('');
  const [tasks, setTasks] = useState<XcdemonLeagueTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const leaguesByYearCacheRef = useRef<Map<number, XcdemonLeagueWithTasks[]>>(new Map());
  const onErrorRef = useStableCallbackRef(onError);
  const onImportedRef = useStableCallbackRef(onImported);
  const onCloseRef = useStableCallbackRef(onClose);

  const selectedLeague = useMemo(
    () => leaguesForYear.find((league) => league.leagueId === selectedLeagueId) ?? null,
    [leaguesForYear, selectedLeagueId],
  );

  const leagueResultsUrl = useMemo(() => {
    if (selectedLeagueId === '') return null;
    return getXcdemonResultsUrl(selectedLeagueId, selectedYear);
  }, [selectedLeagueId, selectedYear]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingSeasons(true);
    setSelectedLeagueId('');
    setSelectedTaskId('');
    setLeaguesForYear([]);
    setTasks([]);
    leaguesByYearCacheRef.current.clear();

    void fetchXcdemonArchivedSeasons()
      .then((seasons) => {
        if (cancelled) return;
        const yearList = buildArchivedYearsFromSeasons(seasons);
        const currentYear = new Date().getFullYear();
        const defaultYear = yearList.includes(currentYear) ? currentYear : (yearList[0] ?? currentYear);

        setArchivedSeasons(seasons);
        setYears(yearList);
        setSelectedYear(defaultYear);
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : 'Could not load XCDemon seasons.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSeasons(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, onErrorRef]);

  useEffect(() => {
    if (!open || loadingSeasons || archivedSeasons.length === 0) return;

    const cached = leaguesByYearCacheRef.current.get(selectedYear);
    if (cached) {
      setLeaguesForYear(cached);
      const first = cached[0];
      setSelectedLeagueId(first?.leagueId ?? '');
      setLeagueName(first?.leagueName ?? '');
      setTasks(first?.tasks ?? []);
      setSelectedTaskId('');
      return;
    }

    let cancelled = false;
    setLoadingLeagues(true);
    setSelectedLeagueId('');
    setSelectedTaskId('');
    setLeaguesForYear([]);
    setTasks([]);

    void fetchXcdemonLeaguesWithTasksForYear(selectedYear, archivedSeasons)
      .then((leagues) => {
        if (cancelled) return;
        leaguesByYearCacheRef.current.set(selectedYear, leagues);
        setLeaguesForYear(leagues);
        const first = leagues[0];
        setSelectedLeagueId(first?.leagueId ?? '');
        setLeagueName(first?.leagueName ?? '');
        setTasks(first?.tasks ?? []);
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
  }, [open, loadingSeasons, archivedSeasons, selectedYear, onErrorRef]);

  useEffect(() => {
    if (!open || loadingSeasons || loadingLeagues || selectedLeagueId === '') return;

    const league = leaguesForYear.find((entry) => entry.leagueId === selectedLeagueId);
    if (!league) {
      setTasks([]);
      setLeagueName('');
      return;
    }

    setLeagueName(league.leagueName);
    setTasks(league.tasks);
    setSelectedTaskId('');
  }, [open, loadingSeasons, loadingLeagues, selectedLeagueId, leaguesForYear]);

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

  const busy = loadingSeasons || loadingLeagues || importing;

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
              {selectedLeague?.leagueName ||
                leagueName ||
                'Choose a year and league. Only leagues with importable tasks (task data and IGC zips) are listed.'}
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
              disabled={busy || years.length === 0}
              onChange={(event) => {
                setSelectedYear(Number(event.target.value));
                setSelectedLeagueId('');
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
            label="League"
            value={selectedLeagueId === '' ? '' : String(selectedLeagueId)}
            disabled={busy}
            loading={loadingLeagues}
            loadingHint="Loading leagues…"
            placeholder="Select a league…"
            emptyHint={
              loadingSeasons
                ? 'Loading seasons…'
                : 'No leagues with importable tasks for this year.'
            }
            filterable
            searchPlaceholder="Type to filter leagues…"
            noMatchesHint="No matching leagues."
            options={leaguesForYear.map((league) => ({
              value: String(league.leagueId),
              label: league.leagueName,
            }))}
            onChange={(value) => {
              setSelectedLeagueId(Number(value));
              setSelectedTaskId('');
            }}
          />

          {leagueResultsUrl && (
            <p className="xcdemon-dialog-hint import-source-page-link">
              <a href={leagueResultsUrl} target="_blank" rel="noopener noreferrer">
                Open league results on XCDemon
              </a>
            </p>
          )}

          <ImportCatalogPicker
            label="Task with results"
            value={selectedTaskId}
            disabled={busy}
            loading={loadingLeagues}
            placeholder="Select a task…"
            emptyHint="No tasks loaded for this league."
            options={tasks.map((task) => ({
              value: task.taskId,
              label: task.label,
            }))}
            onChange={setSelectedTaskId}
          />

          {(loadingSeasons || loadingLeagues || importing) && (
            <p className="xcdemon-dialog-status">
              <Icon icon={LoaderCircle} size="sm" className="spin-icon" />
              {importing
                ? `Importing ${selectedTask?.label ?? 'task'}…`
                : loadingSeasons
                  ? 'Loading seasons…'
                  : 'Loading leagues…'}
            </p>
          )}

          {!loadingSeasons &&
            !loadingLeagues &&
            !importing &&
            years.length > 0 &&
            leaguesForYear.length === 0 && (
              <p className="xcdemon-dialog-hint">
                No leagues with importable tasks were found for {selectedYear}.
              </p>
            )}

          {!loadingSeasons &&
            !loadingLeagues &&
            !importing &&
            selectedLeague &&
            tasks.length === 0 && (
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
