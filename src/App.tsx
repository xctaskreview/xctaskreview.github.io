import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AltitudeChart } from './components/AltitudeChart';
import { MapView } from './components/MapView';
import { TimeControls } from './components/TimeControls';
import { WelcomeScreen } from './components/WelcomeScreen';
import { extractGliderType, extractPilotDisplayName, mergeTrackMetadata, pilotFirstName } from './lib/igc';
import { clampDisplayAltitudeMeters, computeSpeedsAtTime, isFlyingAltitudeMeters } from './lib/geo';
import {
  createDefaultPreferences,
  metersToAltitudeUnit,
  type AppPreferences,
} from './lib/preferences';
import {
  colorForIndex,
  computeTaskTiming,
  enrichTracksWithTaskProgress,
  getTrackSnapshotAtTime,
  loadIgcFiles,
} from './lib/tracks';
import type { EnrichedFlightTrack } from './lib/taskProgress';
import type { CompetitorSnapshot, FlightTrack, TaskTiming, XcTask } from './lib/types';
import {
  buildOptimizedRoute,
  getTaskBounds,
  getTaskStartTime,
  getUniqueTurnpointCircles,
  parseXcTask,
  resolveTaskLocationLabel,
} from './lib/xctask';
import { loadPersistedSession, savePersistedSession } from './lib/persistedSession';
import './App.css';

function buildCompetitorSnapshots(
  tracks: EnrichedFlightTrack[],
  trackColors: Record<string, string>,
  route: NonNullable<ReturnType<typeof buildOptimizedRoute>>,
  currentTime: Date,
): CompetitorSnapshot[] {
  const taskDistanceKm = route.progressTotalDistance / 1000;

  return tracks.flatMap((track) => {
    const snapshot = getTrackSnapshotAtTime(track, currentTime, route);
    if (!snapshot) return [];

    const pilotName = extractPilotDisplayName(track);
    const taskKm = (snapshot.taskPercent / 100) * taskDistanceKm;
    const speeds = snapshot.landed
      ? { groundSpeedMps: 0, verticalSpeedMps: 0 }
      : computeSpeedsAtTime(track.points, currentTime);

    return [
      {
        id: track.id,
        pilotName,
        firstName: pilotFirstName(pilotName),
        gliderType: extractGliderType(track),
        lat: snapshot.lat,
        lon: snapshot.lon,
        alt: clampDisplayAltitudeMeters(snapshot.alt),
        taskPercent: snapshot.taskPercent,
        taskKm,
        color: trackColors[track.id] ?? colorForIndex(0),
        landed: snapshot.landed,
        groundSpeedMps: speeds.groundSpeedMps,
        verticalSpeedMps: speeds.verticalSpeedMps,
        nextTurnpointName: snapshot.nextTurnpointName,
      },
    ];
  });
}

type AppView = 'welcome' | 'review';

function createInitialState() {
  const persisted = loadPersistedSession();
  if (!persisted) {
    return {
      task: null as XcTask | null,
      taskFileName: '',
      tracks: [] as FlightTrack[],
      enabledTrackIds: new Set<string>(),
      trackColors: {} as Record<string, string>,
      preferences: createDefaultPreferences(),
    };
  }

  return {
    task: persisted.task,
    taskFileName: persisted.taskFileName ?? '',
    tracks: persisted.tracks,
    enabledTrackIds: new Set(persisted.enabledTrackIds),
    trackColors: persisted.trackColors,
    preferences: persisted.preferences,
  };
}

export default function App() {
  const [initialState] = useState(createInitialState);
  const [task, setTask] = useState<XcTask | null>(initialState.task);
  const [taskFileName, setTaskFileName] = useState(initialState.taskFileName);
  const [tracks, setTracks] = useState<FlightTrack[]>(initialState.tracks);
  const [enabledTrackIds, setEnabledTrackIds] = useState<Set<string>>(initialState.enabledTrackIds);
  const [trackColors, setTrackColors] = useState<Record<string, string>>(initialState.trackColors);
  const [preferences, setPreferences] = useState<AppPreferences>(initialState.preferences);
  const [view, setView] = useState<AppView>('welcome');
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(50);
  const [taskFitKey, setTaskFitKey] = useState(
    initialState.taskFileName ? `${initialState.taskFileName}-restored` : '',
  );
  const [taskLocationLabel, setTaskLocationLabel] = useState<string | null>(null);
  const [taskLocationLoading, setTaskLocationLoading] = useState(false);
  const skipNextPersistRef = useRef(true);
  const currentTimeRef = useRef(currentTime);
  const enabledTrackIdsKey = useMemo(() => [...enabledTrackIds].sort().join('|'), [enabledTrackIds]);

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
    if (!task || !route) return [];
    return enrichTracksWithTaskProgress(visibleTracks, task, route, taskStart);
  }, [visibleTracks, task, route, taskStart]);

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
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!playing || enrichedTracks.length === 0) return;

    let rafId = 0;
    let lastFrameTime = performance.now();
    const endMs = timing.trackEnd.getTime();

    const tick = (now: number) => {
      const deltaMs = now - lastFrameTime;
      lastFrameTime = now;

      const nextMs = Math.min(currentTimeRef.current.getTime() + deltaMs * speed, endMs);
      const next = new Date(nextMs);
      currentTimeRef.current = next;
      setCurrentTime(next);

      if (nextMs >= endMs) {
        setPlaying(false);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame((now) => {
      lastFrameTime = now;
      tick(now);
    });

    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, timing.trackEnd, enrichedTracks.length]);

  const competitors = useMemo(() => {
    if (!route) return [];
    return buildCompetitorSnapshots(enrichedTracks, trackColors, route, currentTime);
  }, [enrichedTracks, trackColors, route, currentTime]);

  const altitudeRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    for (const track of enrichedTracks) {
      for (const point of track.points) {
        if (!isFlyingAltitudeMeters(point.alt)) continue;
        min = Math.min(min, point.alt);
        max = Math.max(max, point.alt);
      }
    }

    for (const competitor of competitors) {
      if (!isFlyingAltitudeMeters(competitor.alt)) continue;
      min = Math.min(min, competitor.alt);
      max = Math.max(max, competitor.alt);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const fallbackMin = 0;
      const fallbackMax = preferences.altitudeUnit === 'ft' ? 3280 : 1000;
      return { min: fallbackMin, max: fallbackMax };
    }

    const paddedMin = Math.floor((min - 100) / 100) * 100;
    const paddedMax = Math.ceil((max + 100) / 100) * 100;

    return {
      min: metersToAltitudeUnit(paddedMin, preferences.altitudeUnit),
      max: metersToAltitudeUnit(paddedMax, preferences.altitudeUnit),
    };
  }, [enrichedTracks, competitors, preferences.altitudeUnit]);

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
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (!task) {
      savePersistedSession(null);
      return;
    }

    const saved = savePersistedSession({
      task,
      taskFileName,
      tracks,
      enabledTrackIds: [...enabledTrackIds],
      trackColors,
      preferences,
    });

    if (!saved) {
      setError('Could not save session to browser storage. The tracklogs may be too large.');
    }
  }, [task, taskFileName, tracks, enabledTrackIdsKey, trackColors, preferences]);

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
      setTrackColors((prev) => {
        const next = { ...prev };
        newTracks.forEach((track, index) => {
          next[track.id] = colorForIndex(Object.keys(next).length + index);
        });
        return next;
      });

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

  if (!showReview) {
    return (
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
      />
    );
  }

  return (
    <div className="app review-screen">
      <header className="review-header">
        <h1>XC Task Review</h1>
        <button type="button" className="edit-button" onClick={() => setView('welcome')}>
          Edit
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {bounds && route && (
        <MapView
          bounds={bounds}
          circles={circles}
          optimizedRoute={route}
          competitors={competitors}
          fitKey={taskFitKey || 'task'}
          preferences={preferences}
          playing={playing}
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
            competitors={competitors}
            turnpoints={route.progressTurnpoints}
            altitudeMin={altitudeRange.min}
            altitudeMax={altitudeRange.max}
            taskDistanceKm={route.progressTotalDistance / 1000}
            preferences={preferences}
          />
        </>
      )}
    </div>
  );
}
