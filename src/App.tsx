import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PencilLine, X } from 'lucide-react';
import { AltitudeChart } from './components/AltitudeChart';
import { AppFooter } from './components/AppFooter';
import { AppHomeLink } from './components/AppHomeLink';
import { Icon, IconButtonContent } from './components/Icon';
import { MapView } from './components/MapView';
import { TimeControls } from './components/TimeControls';
import { WelcomeScreen } from './components/WelcomeScreen';
import { extractGliderType, mergeTrackMetadata } from './lib/igc';
import { buildCompetitorSnapshots } from './lib/competitors';
import { computeChartAltitudeRange } from './lib/chartAltitude';
import {
  createDefaultPreferences,
  type AppPreferences,
} from './lib/preferences';
import {
  assignUniqueTrackColors,
  computeTaskTiming,
  advanceLeadPercentages,
  enrichTracksWithTaskProgress,
  loadIgcFiles,
} from './lib/tracks';
import type { XcdemonImportResult } from './lib/xcdemon';
import type { FlightTrack, TaskTiming, XcTask } from './lib/types';
import {
  buildOptimizedRoute,
  getTaskBounds,
  getTaskStartTime,
  getUniqueTurnpointCircles,
  parseXcTask,
  resolveTaskLocationLabel,
} from './lib/xctask';
import { loadPersistedSession, savePersistedSession } from './lib/persistedSession';
import type { TaskProgressMarker } from './lib/taskProgressMarker';
import { useThrottledDate } from './lib/useThrottledDate';
import './App.css';

type AppView = 'welcome' | 'review';

const EMPTY_APP_STATE = {
  task: null as XcTask | null,
  taskFileName: '',
  tracks: [] as FlightTrack[],
  enabledTrackIds: new Set<string>(),
  trackColors: {} as Record<string, string>,
  preferences: createDefaultPreferences(),
};

export default function App() {
  const [task, setTask] = useState<XcTask | null>(EMPTY_APP_STATE.task);
  const [taskFileName, setTaskFileName] = useState(EMPTY_APP_STATE.taskFileName);
  const [tracks, setTracks] = useState<FlightTrack[]>(EMPTY_APP_STATE.tracks);
  const [enabledTrackIds, setEnabledTrackIds] = useState<Set<string>>(EMPTY_APP_STATE.enabledTrackIds);
  const [trackColors, setTrackColors] = useState<Record<string, string>>(EMPTY_APP_STATE.trackColors);
  const [preferences, setPreferences] = useState<AppPreferences>(EMPTY_APP_STATE.preferences);
  const [view, setView] = useState<AppView>('welcome');
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(50);
  const [taskFitKey, setTaskFitKey] = useState('');
  const [taskLocationLabel, setTaskLocationLabel] = useState<string | null>(null);
  const [taskLocationLoading, setTaskLocationLoading] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const skipNextPersistRef = useRef(false);
  const hadTaskRef = useRef(false);
  const currentTimeRef = useRef(currentTime);
  const taskProgressMarkerRef = useRef<TaskProgressMarker | null>(null);
  const enabledTrackIdsKey = useMemo(() => [...enabledTrackIds].sort().join('|'), [enabledTrackIds]);

  useEffect(() => {
    let cancelled = false;

    loadPersistedSession()
      .then((persisted) => {
        if (cancelled) return;

        if (persisted) {
          skipNextPersistRef.current = true;
          hadTaskRef.current = true;
          setTask(persisted.task);
          setTaskFileName(persisted.taskFileName ?? '');
          setTracks(persisted.tracks);
          setEnabledTrackIds(new Set(persisted.enabledTrackIds));
          setTrackColors(assignUniqueTrackColors(persisted.tracks, persisted.trackColors));
          setPreferences(persisted.preferences);
          if (persisted.view === 'review') {
            setView('review');
          }
          if (persisted.taskFileName) {
            setTaskFitKey(`${persisted.taskFileName}-restored`);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStorageReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTracks((prev) => {
      const next = prev.map((track) => {
        const gliderType = extractGliderType(track);
        if (!gliderType || gliderType === track.gliderType) return track;
        return { ...track, gliderType };
      });
      return next.some((track, index) => track !== prev[index]) ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!storageReady || tracks.length === 0) return;

    setTrackColors((prev) => {
      const next = assignUniqueTrackColors(tracks, prev);
      const trackIds = new Set(tracks.map((track) => track.id));
      const unchanged =
        Object.keys(prev).length === Object.keys(next).length &&
        [...trackIds].every((id) => prev[id] === next[id]);
      return unchanged ? prev : next;
    });
  }, [storageReady, tracks]);

  const route = useMemo(() => (task ? buildOptimizedRoute(task) : null), [task]);
  const visibleTracks = useMemo(
    () => tracks.filter((track) => enabledTrackIds.has(track.id)),
    [tracks, enabledTrackIds],
  );
  const showReview = view === 'review' && Boolean(task && visibleTracks.length > 0);

  const taskStart = useMemo(() => {
    if (!task || visibleTracks.length === 0) return undefined;
    const referenceDate =
      visibleTracks.find((t) => t.date)?.date ??
      visibleTracks[0]?.points[0]?.time ??
      new Date();
    return getTaskStartTime(task, referenceDate);
  }, [task, visibleTracks]);

  const enrichedTracks = useMemo(() => {
    if (!showReview || !task || !route) return [];
    return enrichTracksWithTaskProgress(visibleTracks, task, route, taskStart);
  }, [showReview, visibleTracks, task, route, taskStart]);

  const circles = useMemo(() => (task ? getUniqueTurnpointCircles(task) : []), [task]);
  const bounds = useMemo(() => (task ? getTaskBounds(task) : null), [task]);
  const timing = useMemo<TaskTiming>(
    () => (task ? computeTaskTiming(task, enrichedTracks) : { trackStart: new Date(), trackEnd: new Date() }),
    [task, enrichedTracks],
  );

  useEffect(() => {
    if (enrichedTracks.length > 0) {
      setCurrentTime(timing.taskStart ?? timing.trackStart);
    }
  }, [enrichedTracks, timing.taskStart, timing.trackStart]);

  useEffect(() => {
    setPlaying(showReview);
  }, [showReview]);

  useEffect(() => {
    if (playing) return;
    setCurrentTime(currentTimeRef.current);
  }, [playing]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!playing || enrichedTracks.length === 0) return;

    let rafId = 0;
    let lastFrameTime = performance.now();
    let lastReactUpdate = 0;
    const endMs = timing.trackEnd.getTime();

    const tick = (now: number) => {
      const deltaMs = now - lastFrameTime;
      lastFrameTime = now;

      const nextMs = Math.min(currentTimeRef.current.getTime() + deltaMs * speed, endMs);
      const next = new Date(nextMs);
      currentTimeRef.current = next;

      if (now - lastReactUpdate >= 50 || nextMs >= endMs) {
        lastReactUpdate = now;
        setCurrentTime(next);
      }

      if (nextMs >= endMs) {
        setPlaying(false);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame((now) => {
      lastFrameTime = now;
      lastReactUpdate = now;
      tick(now);
    });

    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, timing.trackEnd, enrichedTracks.length]);

  const leadSecond = Math.floor(currentTime.getTime() / 1000);
  const leadTrackKey = useMemo(
    () => enrichedTracks.map((track) => track.id).join('|'),
    [enrichedTracks],
  );

  const leadCacheRef = useRef<{
    trackKey: string;
    taskStartMs: number;
    endSecond: number;
    leadSeconds: Map<string, number>;
  } | null>(null);

  const [leadPercentages, setLeadPercentages] = useState<Map<string, number>>(() => new Map());

  const updateLeadPercentages = useCallback(
    (endTime: Date) => {
      if (!route || !timing.taskStart || enrichedTracks.length === 0) {
        leadCacheRef.current = null;
        setLeadPercentages(new Map());
        return;
      }

      const taskStartMs = timing.taskStart.getTime();
      const cache = leadCacheRef.current;
      const needsReset =
        !cache || cache.trackKey !== leadTrackKey || cache.taskStartMs !== taskStartMs;

      if (needsReset) {
        const startSecond = Math.floor(taskStartMs / 1000);
        const { leadSeconds, endSecond, leadPercentages: result } = advanceLeadPercentages(
          enrichedTracks,
          route,
          timing.taskStart,
          endTime,
          new Map(enrichedTracks.map((track) => [track.id, 0])),
          startSecond - 1,
        );
        leadCacheRef.current = {
          trackKey: leadTrackKey,
          taskStartMs,
          endSecond,
          leadSeconds,
        };
        setLeadPercentages(result);
        return;
      }

      const advanced = advanceLeadPercentages(
        enrichedTracks,
        route,
        timing.taskStart,
        endTime,
        cache.leadSeconds,
        cache.endSecond,
      );

      if (advanced.endSecond === cache.endSecond) return;

      leadCacheRef.current = {
        trackKey: leadTrackKey,
        taskStartMs,
        endSecond: advanced.endSecond,
        leadSeconds: advanced.leadSeconds,
      };
      setLeadPercentages(advanced.leadPercentages);
    },
    [enrichedTracks, route, timing.taskStart, leadTrackKey],
  );

  useEffect(() => {
    if (!showReview) {
      leadCacheRef.current = null;
      setLeadPercentages(new Map());
      return;
    }

    if (playing) return;

    const endTime = new Date(leadSecond * 1000);
    const frame = window.requestAnimationFrame(() => updateLeadPercentages(endTime));
    return () => window.cancelAnimationFrame(frame);
  }, [showReview, playing, leadSecond, updateLeadPercentages]);

  useEffect(() => {
    if (!showReview || !playing) return;

    const tick = () => {
      const endTime = new Date(Math.floor(currentTimeRef.current.getTime() / 1000) * 1000);
      updateLeadPercentages(endTime);
    };

    tick();
    const interval = window.setInterval(tick, 5000);
    return () => window.clearInterval(interval);
  }, [showReview, playing, updateLeadPercentages]);

  const chartTime = useThrottledDate(currentTime, playing, 500);

  const scoreboardCompetitors = useMemo(() => {
    if (!route) return [];
    const time = playing ? chartTime : currentTime;
    return buildCompetitorSnapshots(enrichedTracks, trackColors, route, time, true);
  }, [enrichedTracks, trackColors, route, playing, chartTime, currentTime]);

  const altitudeRange = useMemo(
    () => computeChartAltitudeRange(enrichedTracks, preferences.altitudeUnit),
    [enrichedTracks, preferences.altitudeUnit],
  );

  const taskDistanceKm = route ? route.progressTotalDistance / 1000 : 0;

  useEffect(() => {
    if (!task) {
      setTaskLocationLabel(null);
      setTaskLocationLoading(false);
      return;
    }

    let cancelled = false;
    setTaskLocationLoading(true);

    void resolveTaskLocationLabel(task, taskFileName).then((label) => {
      if (!cancelled) {
        setTaskLocationLabel(label);
        setTaskLocationLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [task, taskFileName]);

  useEffect(() => {
    if (!storageReady) return;

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (!task) {
      if (hadTaskRef.current) {
        hadTaskRef.current = false;
        void savePersistedSession(null);
      }
      return;
    }

    hadTaskRef.current = true;

    void savePersistedSession({
      task,
      taskFileName,
      tracks,
      enabledTrackIds: [...enabledTrackIds],
      trackColors,
      preferences,
      view,
    }).then((result) => {
      if (result === 'failed') {
        setError('Could not save session to browser storage. The tracklogs may be too large.');
      } else if (result === 'partial') {
        setError('Task saved locally, but the tracklogs were too large to store in this browser.');
      }
    });
  }, [storageReady, task, taskFileName, tracks, enabledTrackIdsKey, trackColors, preferences, view]);

  const onTaskFile = useCallback(async (file: File) => {
    try {
      setError(null);
      setTask(parseXcTask(await file.text()));
      setTaskFileName(file.name);
      setTaskFitKey(`${file.name}-${Date.now()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task file');
    }
  }, []);

  const onTrackFiles = useCallback(async (files: FileList | File[]) => {
    try {
      setError(null);
      const { tracks: loaded, errors } = await loadIgcFiles(Array.from(files));
      if (loaded.length === 0) {
        setError(errors[0] ?? 'No IGC files found in upload');
        return;
      }

      const existingIds = new Set(tracks.map((track) => track.id));
      const existingFileNames = new Set(tracks.map((track) => track.fileName.toLowerCase()));
      const loadedById = new Map(loaded.map((track) => [track.id, track]));
      const loadedByFileName = new Map(loaded.map((track) => [track.fileName.toLowerCase(), track]));
      const updatedTracks = tracks.map((track) => {
        const fresh =
          loadedById.get(track.id) ?? loadedByFileName.get(track.fileName.toLowerCase());
        return fresh ? mergeTrackMetadata(track, fresh) : track;
      });
      const metadataUpdated = updatedTracks.some((track, index) => track !== tracks[index]);
      const newTracks = loaded.filter(
        (track) =>
          !existingIds.has(track.id) && !existingFileNames.has(track.fileName.toLowerCase()),
      );

      if (newTracks.length === 0 && !metadataUpdated) {
        setError('All selected tracklogs are already loaded.');
        return;
      }

      setTracks(
        [...updatedTracks, ...newTracks].sort((a, b) => a.pilotName.localeCompare(b.pilotName)),
      );
      setEnabledTrackIds((prev) => {
        const next = new Set(prev);
        newTracks.forEach((track) => next.add(track.id));
        return next;
      });
      setTrackColors((prev) =>
        assignUniqueTrackColors([...updatedTracks, ...newTracks], prev),
      );

      const duplicateCount = loaded.length - newTracks.length;
      if (duplicateCount > 0 && metadataUpdated) {
        setError(`Updated ${duplicateCount} existing tracklog(s) and added ${newTracks.length} new tracklog(s).`);
      } else if (duplicateCount > 0) {
        setError(`Added ${newTracks.length} tracklog(s). Skipped ${duplicateCount} duplicate(s).`);
      } else if (errors.length > 0) {
        setError(`Added ${newTracks.length} tracklog(s). Skipped ${errors.length} file(s): ${errors.join('; ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load track files');
    }
  }, [tracks]);

  const onRemoveTrack = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((track) => track.id !== trackId));
    setEnabledTrackIds((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
    setTrackColors((prev) => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
  }, []);

  const onRemoveAllTracks = useCallback(() => {
    setTracks([]);
    setEnabledTrackIds(new Set());
    setTrackColors({});
  }, []);

  const onTrackColorChange = useCallback((trackId: string, color: string) => {
    setTrackColors((prev) => ({ ...prev, [trackId]: color }));
  }, []);

  const onToggleTrack = useCallback((trackId: string, enabled: boolean) => {
    setEnabledTrackIds((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(trackId);
      } else {
        next.delete(trackId);
      }
      return next;
    });
  }, []);

  const onXcdemonImport = useCallback((result: XcdemonImportResult) => {
    setError(null);
    setTask(result.task);
    setTaskFileName(result.taskFileName);
    setTaskFitKey(`${result.taskFileName}-${Date.now()}`);
    setTracks(result.tracks);
    setEnabledTrackIds(new Set(result.tracks.map((track) => track.id)));
    setTrackColors(assignUniqueTrackColors(result.tracks));

    if (result.tracks.length === 0 && result.trackErrors.length > 0) {
      setError(result.trackErrors[0] ?? 'Imported task, but no tracklogs could be loaded.');
    } else if (result.tracks.length === 0) {
      setError('Imported task. No IGC zip was available for this event.');
    } else if (result.trackErrors.length > 0) {
      setError(
        `Imported task and ${result.tracks.length} tracklog(s). Skipped ${result.trackErrors.length} file(s): ${result.trackErrors.join('; ')}`,
      );
    }
  }, []);

  if (!showReview) {
    return (
      <div className="app-shell">
        <WelcomeScreen
          task={task}
          taskFileName={taskFileName}
          taskLocationLabel={taskLocationLabel}
          taskLocationLoading={taskLocationLoading}
          tracks={tracks}
          enabledTrackIds={enabledTrackIds}
          trackColors={trackColors}
          preferences={preferences}
          error={error}
          canContinue={Boolean(task && visibleTracks.length > 0)}
          onTaskFile={(file) => void onTaskFile(file)}
          onTrackFiles={(files) => void onTrackFiles(files)}
          onToggleTrack={onToggleTrack}
          onTrackColorChange={onTrackColorChange}
          onRemoveTrack={onRemoveTrack}
          onRemoveAllTracks={onRemoveAllTracks}
          onPreferencesChange={setPreferences}
          onContinue={() => setView('review')}
          onDismissError={() => setError(null)}
          onXcdemonImport={onXcdemonImport}
          onError={setError}
        />
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app review-screen">
      <header className="review-header">
        <div className="review-header-start">
          <h1 className="review-header-title">
            <AppHomeLink iconSize="sm" />
          </h1>
        </div>
        <button type="button" className="edit-button" onClick={() => setView('welcome')}>
          <IconButtonContent icon={PencilLine}>Edit</IconButtonContent>
        </button>
      </header>

      {error && (
        <div className="error-banner">
          <span className="error-message-text">{error}</span>
          <button
            type="button"
            className="error-dismiss"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
          >
            <Icon icon={X} size="sm" />
          </button>
        </div>
      )}

      {bounds && route && (
        <MapView
          bounds={bounds}
          circles={circles}
          optimizedRoute={route}
          enrichedTracks={enrichedTracks}
          trackColors={trackColors}
          currentTimeRef={currentTimeRef}
          leadPercentages={leadPercentages}
          fitKey={taskFitKey || 'task'}
          preferences={preferences}
          playing={playing}
          pausedTime={currentTime}
          scoreboardCompetitors={scoreboardCompetitors}
          taskStart={timing.taskStart}
          trackKey={leadTrackKey}
          taskProgressMarkerRef={taskProgressMarkerRef}
        />
      )}

      {route && (
        <>
          <TimeControls
            currentTime={currentTime}
            timing={timing}
            playing={playing}
            speed={speed}
            timezone={preferences.timezone}
            onTimeChange={setCurrentTime}
            onPlayingChange={setPlaying}
            onSpeedChange={setSpeed}
          />
          <AltitudeChart
            enrichedTracks={enrichedTracks}
            trackColors={trackColors}
            route={route}
            currentTimeRef={currentTimeRef}
            playing={playing}
            pausedTime={currentTime}
            turnpoints={route.progressTurnpoints}
            altitudeMin={altitudeRange.min}
            altitudeMax={altitudeRange.max}
            altitudeStep={altitudeRange.step}
            taskDistanceKm={taskDistanceKm}
            preferences={preferences}
            taskProgressMarkerRef={taskProgressMarkerRef}
          />
        </>
      )}
      </div>
      <AppFooter />
    </div>
  );
}
