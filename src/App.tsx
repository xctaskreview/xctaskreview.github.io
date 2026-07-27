import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LineChart } from 'lucide-react';
import { AppMenuOverlay } from './components/AppMenuOverlay';
import { ErrorOverlay } from './components/ErrorOverlay';
import { IconButtonContent } from './components/Icon';
import { MapView } from './components/MapView';
import type { MapDataActivePanel } from './components/MapDataPanels';
import { TimeControls } from './components/TimeControls';
import { defaultTaskProgressHeight, normalizeTaskProgressPanelHeight, TaskProgressPanel } from './components/TaskProgressPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { extractGliderType, mergeTrackMetadata } from './lib/igc';
import { buildCompetitorSnapshots } from './lib/competitors';
import { computeChartAltitudeRange } from './lib/chartAltitude';
import {
  createDefaultPreferences,
  loadPersistedPreferences,
  normalizePlaybackSpeed,
  pickCirclingDetectionPreferences,
  circlingDetectionPreferencesEqual,
  savePersistedPreferences,
  type AppPreferences,
  type CirclingDetectionPreferences,
} from './lib/preferences';
import {
  assignUniqueTrackColors,
  computeGlobalLegStatistics,
  computeTaskTiming,
  enrichTracksWithTaskProgress,
  getTrackColor,
  loadIgcFiles,
} from './lib/tracks';
import { buildTaskFieldTimeline } from './lib/taskTimeline';
import { buildTaskNextTurnpointTimeline } from './lib/nextTurnpoint';
import type { CivlImportResult } from './lib/civl';
import type { XcdemonImportResult } from './lib/xcdemon';
import type { FlightTrack, TaskTiming, XcTask } from './lib/types';
import {
  buildOptimizedRoute,
  getTaskBounds,
  getTaskDisplayInfo,
  getTaskStartTime,
  getSpeedSectionEndProgressTurnpoint,
  getUniqueTurnpointCircles,
  parseXcTask,
  resolveTaskTimeZone,
  resolveTaskLocationLabel,
  withResolvedTaskTimeZone,
} from './lib/xctask';
import { loadPersistedSession, savePersistedSession } from './lib/persistedSession';
import { downloadSessionBundle, importSessionBundle } from './lib/sessionBundle';
import {
  updateTaskHistoryLocation,
  upsertTaskHistory,
  type TaskHistoryEntry,
} from './lib/taskHistory';
import type { TaskProgressMarker } from './lib/taskProgressMarker';
import { getPilotSssCrossDelaySec } from './lib/taskProgress';
import { computeFleetSssExitTp1Marker, computeTurnpointReachTimes } from './lib/taskProgressMarker';
import {
  buildFinishTurnpointTooltip,
  buildStartTurnpointTooltip,
} from './lib/turnpointTooltip';
import { ReviewWalkthrough } from './components/ReviewWalkthrough';
import { ReviewKeymapDialog } from './components/ReviewKeymapDialog';
import { PilotQuickSearch, buildPilotQuickSearchEntries } from './components/PilotQuickSearch';
import { ReviewTimeSeekDialog } from './components/ReviewTimeSeekDialog';
import {
  isReviewWalkthroughDismissed,
  markReviewWalkthroughDismissed,
  type ReviewWalkthroughStepId,
} from './lib/reviewWalkthrough';
import {
  isEditableKeyboardTarget,
  isReviewShortcutModifier,
  reviewStartTime,
  seekTurnpointTime,
  stepPlaybackSpeed,
} from './lib/reviewKeyboard';
import { useThrottledDate } from './lib/useThrottledDate';
import './App.css';

interface ReviewWalkthroughUiSnapshot {
  mapDataActivePanel: MapDataActivePanel | null;
  taskProgressMinimized: boolean;
  mobileChartOpen: boolean;
  playing: boolean;
  selectedPilotTrackId: string | null;
}

function isMobileReviewLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches;
}

type AppView = 'welcome' | 'review';

type AppHistoryState = { view: AppView };

function getHistoryView(state: unknown): AppView | null {
  if (!state || typeof state !== 'object') return null;
  const view = (state as AppHistoryState).view;
  return view === 'welcome' || view === 'review' ? view : null;
}

function ensureWelcomeHistoryEntry(): void {
  if (getHistoryView(window.history.state) === null) {
    window.history.replaceState({ view: 'welcome' } satisfies AppHistoryState, '');
  }
}

function pushReviewHistoryEntry(): void {
  if (getHistoryView(window.history.state) !== 'review') {
    window.history.pushState({ view: 'review' } satisfies AppHistoryState, '');
  }
}

function replaceWithWelcomeHistoryEntry(): void {
  window.history.replaceState({ view: 'welcome' } satisfies AppHistoryState, '');
}

function backFromReviewHistoryEntry(): boolean {
  if (getHistoryView(window.history.state) === 'review') {
    window.history.back();
    return true;
  }
  return false;
}

const APP_DOCUMENT_TITLE = 'XC Task Review';

function syncAppDocumentTitle(
  task: XcTask | null,
  taskFileName: string,
  locationLabel?: string | null,
): void {
  if (!task) {
    document.title = APP_DOCUMENT_TITLE;
    return;
  }

  const { name, embeddedLocation } = getTaskDisplayInfo(task, taskFileName);
  const label = name || locationLabel || embeddedLocation || taskFileName || 'Task';
  document.title = `${label} · ${APP_DOCUMENT_TITLE}`;
}

const EMPTY_APP_STATE = {
  task: null as XcTask | null,
  taskFileName: '',
  tracks: [] as FlightTrack[],
  enabledTrackIds: new Set<string>(),
  trackColors: {} as Record<string, string>,
  preferences: createDefaultPreferences(),
};

export default function App() {
  const skipNextPersistRef = useRef(false);
  const hadTaskRef = useRef(false);
  const hasStoredPreferencesRef = useRef(false);
  const taskProgressMarkerRef = useRef<TaskProgressMarker | null>(null);

  const [task, setTask] = useState<XcTask | null>(EMPTY_APP_STATE.task);
  const [taskFileName, setTaskFileName] = useState(EMPTY_APP_STATE.taskFileName);
  const [tracks, setTracks] = useState<FlightTrack[]>(EMPTY_APP_STATE.tracks);
  const [enabledTrackIds, setEnabledTrackIds] = useState<Set<string>>(EMPTY_APP_STATE.enabledTrackIds);
  const [trackColors, setTrackColors] = useState<Record<string, string>>(EMPTY_APP_STATE.trackColors);
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    const stored = loadPersistedPreferences();
    hasStoredPreferencesRef.current = stored !== null;
    return stored ?? EMPTY_APP_STATE.preferences;
  });
  const [appliedCircling, setAppliedCircling] = useState<CirclingDetectionPreferences>(() =>
    pickCirclingDetectionPreferences(loadPersistedPreferences() ?? EMPTY_APP_STATE.preferences),
  );
  const [view, setView] = useState<AppView>('welcome');
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [playing, setPlaying] = useState(false);
  const [taskFitKey, setTaskFitKey] = useState('');
  const [taskLocationLabel, setTaskLocationLabel] = useState<string | null>(null);
  const [taskLocationLoading, setTaskLocationLoading] = useState(false);
  const [mobileChartOpen, setMobileChartOpen] = useState(false);
  const [taskProgressMinimized, setTaskProgressMinimized] = useState(false);
  const [taskProgressHeightPx, setTaskProgressHeightPx] = useState(() => defaultTaskProgressHeight());
  const [progressFocusTrackId, setProgressFocusTrackId] = useState<string | null>(null);
  const [selectedPilotTrackId, setSelectedPilotTrackId] = useState<string | null>(null);
  const [mapDataActivePanel, setMapDataActivePanel] = useState<MapDataActivePanel | null>(null);
  const reviewStageRef = useRef<HTMLDivElement>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [reviewKeymapOpen, setReviewKeymapOpen] = useState(false);
  const [pilotQuickSearchOpen, setPilotQuickSearchOpen] = useState(false);
  const [reviewTimeSeekMode, setReviewTimeSeekMode] = useState<'clock' | 'timer' | null>(null);
  const [reviewWalkthroughActive, setReviewWalkthroughActive] = useState(false);
  const walkthroughUiSnapshotRef = useRef<ReviewWalkthroughUiSnapshot | null>(null);
  const [walkthroughLegendForceOpen, setWalkthroughLegendForceOpen] = useState(false);
  const [walkthroughStepId, setWalkthroughStepId] = useState<ReviewWalkthroughStepId | null>(null);
  const [walkthroughDemoPilotTrackId, setWalkthroughDemoPilotTrackId] = useState<string | null>(null);
  const autoWalkthroughStartedRef = useRef(false);
  const pendingWalkthroughAfterReviewRef = useRef(false);
  const currentTimeRef = useRef(currentTime);
  const pendingCirclingRecomputeRef = useRef(false);
  const circlingRecomputeResumeRef = useRef<{ at: Date; playing: boolean } | null>(null);
  const enabledTrackIdsKey = useMemo(() => [...enabledTrackIds].sort().join('|'), [enabledTrackIds]);

  useEffect(() => {
    let cancelled = false;

    loadPersistedSession()
      .then((persisted) => {
        if (cancelled) return;

        if (persisted) {
          skipNextPersistRef.current = true;
          hadTaskRef.current = true;
          syncAppDocumentTitle(persisted.task, persisted.taskFileName ?? '');
          setTask(withResolvedTaskTimeZone(persisted.task));
          setTaskFileName(persisted.taskFileName ?? '');
          setTracks(persisted.tracks);
          setEnabledTrackIds(new Set(persisted.enabledTrackIds));
          setTrackColors(assignUniqueTrackColors(persisted.tracks, persisted.trackColors));
          // Dedicated preferences storage is the source of truth. Migrate from the
          // session blob only when preferences have never been saved independently.
          if (!hasStoredPreferencesRef.current) {
            setPreferences(persisted.preferences);
            savePersistedPreferences(persisted.preferences);
            hasStoredPreferencesRef.current = true;
          } else {
            setPreferences((current) => ({
              ...current,
              playbackSpeed: normalizePlaybackSpeed(persisted.preferences.playbackSpeed),
            }));
          }
          setTaskProgressMinimized(persisted.taskProgressMinimized === true);
          if (persisted.taskProgressHeightPx !== undefined) {
            setTaskProgressHeightPx(
              normalizeTaskProgressPanelHeight(persisted.taskProgressHeightPx),
            );
          }
          if (persisted.view === 'review') {
            setView('review');
            pushReviewHistoryEntry();
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
    ensureWelcomeHistoryEntry();

    const onPopState = (event: PopStateEvent) => {
      setView(getHistoryView(event.state) ?? 'welcome');
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useLayoutEffect(() => {
    syncAppDocumentTitle(task, taskFileName, taskLocationLabel);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAppDocumentTitle(task, taskFileName, taskLocationLabel);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [task, taskFileName, taskLocationLabel]);

  useEffect(() => {
    if (!storageReady) return;
    savePersistedPreferences(preferences);
    hasStoredPreferencesRef.current = true;
  }, [storageReady, preferences]);

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

  useEffect(() => {
    if (!taskFitKey) return;
    setAppliedCircling(pickCirclingDetectionPreferences(preferences));
  }, [taskFitKey]);

  const circlingDetectionDirty = useMemo(
    () =>
      !circlingDetectionPreferencesEqual(
        pickCirclingDetectionPreferences(preferences),
        appliedCircling,
      ),
    [preferences, appliedCircling],
  );

  const applyCirclingDetectionNow = useCallback((circling: CirclingDetectionPreferences) => {
    circlingRecomputeResumeRef.current = {
      at: new Date(currentTimeRef.current.getTime()),
      playing,
    };
    pendingCirclingRecomputeRef.current = true;
    if (playing) {
      setPlaying(false);
    }
    setAppliedCircling(circling);
  }, [playing]);

  const handleRecomputeCirclingDetection = useCallback(() => {
    applyCirclingDetectionNow(pickCirclingDetectionPreferences(preferences));
  }, [applyCirclingDetectionNow, preferences]);

  const route = useMemo(() => (task ? buildOptimizedRoute(task) : null), [task]);
  const visibleTracks = useMemo(
    () => tracks.filter((track) => enabledTrackIds.has(track.id)),
    [tracks, enabledTrackIds],
  );
  const canEnterReview = Boolean(task && visibleTracks.length > 0);
  const showReview = view === 'review' && canEnterReview;

  const handleRestoreCirclingDefaults = useCallback(() => {
    const defaults = pickCirclingDetectionPreferences(createDefaultPreferences());
    setPreferences((prev) => ({
      ...prev,
      circlingDetectionSampleSec: defaults.circlingDetectionSampleSec,
      circlingTurnRateDegPerS: defaults.circlingTurnRateDegPerS,
    }));
    if (showReview) {
      if (!circlingDetectionPreferencesEqual(appliedCircling, defaults)) {
        applyCirclingDetectionNow(defaults);
      }
    } else {
      setAppliedCircling(defaults);
    }
  }, [showReview, appliedCircling, applyCirclingDetectionNow]);

  const taskTimeZone = useMemo(() => (task ? resolveTaskTimeZone(task) : 'UTC'), [task]);

  const taskStart = useMemo(() => {
    if (!task || visibleTracks.length === 0) return undefined;
    const referenceDate =
      visibleTracks.find((t) => t.date)?.date ??
      visibleTracks[0]?.points[0]?.time ??
      new Date();
    return getTaskStartTime(task, referenceDate);
  }, [task, visibleTracks]);

  const allEnrichedTracks = useMemo(() => {
    if (!showReview || !task || !route) return [];
    return enrichTracksWithTaskProgress(tracks, task, route, taskStart, appliedCircling);
  }, [showReview, tracks, task, route, taskStart, appliedCircling]);

  useEffect(() => {
    if (!pendingCirclingRecomputeRef.current) return;
    if (allEnrichedTracks.length === 0) return;
    pendingCirclingRecomputeRef.current = false;
    const resume = circlingRecomputeResumeRef.current;
    circlingRecomputeResumeRef.current = null;
    if (!resume) return;
    currentTimeRef.current = resume.at;
    setCurrentTime(resume.at);
    if (resume.playing) {
      setPlaying(true);
    }
  }, [allEnrichedTracks, appliedCircling]);

  const enrichedTracks = useMemo(
    () => allEnrichedTracks.filter((track) => enabledTrackIds.has(track.id)),
    [allEnrichedTracks, enabledTrackIds],
  );

  const legStatistics = useMemo(
    () => (route && enrichedTracks.length > 0 ? computeGlobalLegStatistics(enrichedTracks, route) : []),
    [enrichedTracks, route],
  );

  const circles = useMemo(() => (task ? getUniqueTurnpointCircles(task) : []), [task]);
  const bounds = useMemo(() => (task ? getTaskBounds(task) : null), [task]);
  const timing = useMemo<TaskTiming>(
    () => (task ? computeTaskTiming(task, enrichedTracks) : { trackStart: new Date(), trackEnd: new Date() }),
    [task, enrichedTracks],
  );
  // Whole-field summary derived once per loaded review, then only read during playback.
  const fieldTimeline = useMemo(
    () => buildTaskFieldTimeline(enrichedTracks, timing.taskStart, timing.trackEnd),
    [enrichedTracks, timing.taskStart, timing.trackEnd],
  );

  const nextTurnpointTimeline = useMemo(
    () =>
      route
        ? buildTaskNextTurnpointTimeline(enrichedTracks, route, timing.taskStart)
        : { taskStartMs: timing.taskStart?.getTime() ?? 0, milestones: [] },
    [enrichedTracks, route, timing.taskStart],
  );

  const turnpointReachMarkers = useMemo(
    () =>
      timing.taskStart && enrichedTracks.length > 0 && route
        ? computeTurnpointReachTimes(
            enrichedTracks,
            route,
            timing.taskStart,
            timing.trackEnd,
            circles,
            fieldTimeline,
          )
        : [],
    [enrichedTracks, route, timing.taskStart, timing.trackEnd, circles, fieldTimeline],
  );

  const sssExitTp1Marker = useMemo(
    () =>
      timing.taskStart && enrichedTracks.length > 0 && route
        ? computeFleetSssExitTp1Marker(enrichedTracks, route, timing.taskStart, circles)
        : null,
    [enrichedTracks, route, timing.taskStart, circles],
  );

  const sliderTurnpointReachMarkers = useMemo(() => {
    let markers = turnpointReachMarkers;
    if (route && route.essTurnpointIndex !== null) {
      const speedEnd = getSpeedSectionEndProgressTurnpoint(route);
      if (speedEnd) {
        markers = markers.filter((marker) => marker.number <= speedEnd.number);
      }
    }

    if (!sssExitTp1Marker) return markers;
    const withoutSss = markers.filter(
      (marker) =>
        marker.index !== sssExitTp1Marker.index && marker.number !== sssExitTp1Marker.number,
    );
    return [sssExitTp1Marker, ...withoutSss];
  }, [turnpointReachMarkers, sssExitTp1Marker, route]);

  const turnpointSeekTimesMs = useMemo(() => {
    const times = new Set<number>();
    times.add(reviewStartTime(timing.taskStart, timing.trackStart).getTime());
    for (const marker of sliderTurnpointReachMarkers) {
      times.add(marker.time.getTime());
    }
    return [...times].sort((a, b) => a - b);
  }, [sliderTurnpointReachMarkers, timing.taskStart, timing.trackStart]);

  const pilotSssCrossDelaySec = useMemo(() => {
    const delays = new Map<string, number>();
    if (!timing.taskStart) return delays;
    for (const track of enrichedTracks) {
      const delay = getPilotSssCrossDelaySec(track, timing.taskStart);
      if (delay !== null) delays.set(track.id, delay);
    }
    return delays;
  }, [enrichedTracks, timing.taskStart]);

  const startTurnpointTooltip = useMemo(
    () =>
      route && timing.taskStart
        ? buildStartTurnpointTooltip(route, circles, {
            distanceUnit: preferences.distanceUnit,
            taskStart: timing.taskStart,
          })
        : undefined,
    [route, circles, timing.taskStart, preferences.distanceUnit],
  );
  const finishTurnpointTooltip = useMemo(
    () =>
      route
        ? buildFinishTurnpointTooltip(route, circles, timing, {
            distanceUnit: preferences.distanceUnit,
            taskStart: timing.taskStart,
          })
        : undefined,
    [route, circles, timing, preferences.distanceUnit],
  );

  useEffect(() => {
    if (enrichedTracks.length > 0) {
      setCurrentTime(timing.taskStart ?? timing.trackStart);
    }
  }, [enrichedTracks, timing.taskStart, timing.trackStart]);

  useEffect(() => {
    setPlaying(showReview);
    if (!showReview) {
      setMobileChartOpen(false);
    }
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

      const nextMs = Math.min(currentTimeRef.current.getTime() + deltaMs * preferences.playbackSpeed, endMs);
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
  }, [playing, preferences.playbackSpeed, timing.trackEnd, enrichedTracks.length]);

  const chartTime = useThrottledDate(currentTime, playing, 500);

  const scoreboardCompetitors = useMemo(() => {
    if (!route) return [];
    const time = playing ? chartTime : currentTime;
    return buildCompetitorSnapshots(allEnrichedTracks, trackColors, route, time, true);
  }, [allEnrichedTracks, trackColors, route, playing, chartTime, currentTime]);

  const scoreboardRankingTimeMs = (playing ? chartTime : currentTime).getTime();

  const altitudeRange = useMemo(
    () => computeChartAltitudeRange(enrichedTracks, preferences.altitudeUnit),
    [enrichedTracks, preferences.altitudeUnit],
  );

  const taskDistanceKm = route ? route.progressTotalDistance / 1000 : 0;

  const progressFocusColor = useMemo(() => {
    if (!progressFocusTrackId) return null;
    const index = tracks.findIndex((track) => track.id === progressFocusTrackId);
    return getTrackColor(progressFocusTrackId, trackColors, index >= 0 ? index : 0);
  }, [progressFocusTrackId, tracks, trackColors]);

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
        const historyName = getTaskDisplayInfo(task, taskFileName).name;
        if (historyName) {
          void updateTaskHistoryLocation(historyName, label);
        }
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
      taskProgressMinimized: taskProgressMinimized || undefined,
      taskProgressHeightPx: normalizeTaskProgressPanelHeight(taskProgressHeightPx),
    }).then((result) => {
      if (result === 'failed') {
        setError('Could not save session to browser storage. The tracklogs may be too large.');
      } else if (result === 'partial') {
        setError('Task saved locally, but the tracklogs were too large to store in this browser.');
      }
    });
  }, [storageReady, task, taskFileName, tracks, enabledTrackIdsKey, trackColors, preferences, view, taskProgressMinimized, taskProgressHeightPx]);

  const onSaveToHistory = useCallback(async () => {
    if (!task) return;

    try {
      setError(null);
      const entry = await upsertTaskHistory({
        task,
        taskFileName: taskFileName || undefined,
        location: taskLocationLabel,
        tracks,
        enabledTrackIds: [...enabledTrackIds],
        trackColors,
      });
      if (!entry) {
        setError('Could not save task to history.');
        return;
      }
      const trackCount = entry.tracks?.length ?? 0;
      setError(
        trackCount > 0
          ? `Saved “${entry.name}” to history with ${trackCount} tracklog${trackCount === 1 ? '' : 's'}.`
          : `Saved “${entry.name}” to history.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save task to history.');
    }
  }, [task, taskFileName, taskLocationLabel, tracks, enabledTrackIds, trackColors]);

  const onTaskUpdate = useCallback((updatedTask: XcTask) => {
    setError(null);
    setTask(withResolvedTaskTimeZone(updatedTask));
    setTaskFitKey(`${taskFileName || 'task'}-${Date.now()}`);
    const location = updatedTask.location?.trim() || null;
    if (location) setTaskLocationLabel(location);
    syncAppDocumentTitle(updatedTask, taskFileName, location ?? taskLocationLabel);
  }, [taskFileName, taskLocationLabel]);

  const onClearTask = useCallback(() => {
    setError(null);
    setTask(null);
    setTaskFileName('');
    setTaskFitKey('');
    setTaskLocationLabel(null);
    setTaskLocationLoading(false);
    setView('welcome');
    if (getHistoryView(window.history.state) === 'review') {
      replaceWithWelcomeHistoryEntry();
    }
    syncAppDocumentTitle(null, '');
  }, []);

  const goToReview = useCallback(() => {
    setView('review');
    pushReviewHistoryEntry();
  }, []);

  const goToWelcome = useCallback(() => {
    if (!backFromReviewHistoryEntry()) {
      setView('welcome');
    }
  }, []);

  const leaveReviewView = useCallback(() => {
    setView('welcome');
    if (getHistoryView(window.history.state) === 'review') {
      replaceWithWelcomeHistoryEntry();
    }
  }, []);

  const onSetTracksEnabled = useCallback((trackIds: string[], enabled: boolean) => {
    setEnabledTrackIds((prev) => {
      const next = new Set(prev);
      for (const trackId of trackIds) {
        if (enabled) next.add(trackId);
        else next.delete(trackId);
      }
      return next;
    });
  }, []);

  const onTaskFile = useCallback(async (file: File) => {
    try {
      setError(null);
      const parsed = parseXcTask(await file.text());
      setTask(parsed);
      setTaskFileName(file.name);
      setTaskFitKey(`${file.name}-${Date.now()}`);
      syncAppDocumentTitle(parsed, file.name);
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
    setProgressFocusTrackId((current) => (current === trackId ? null : current));
  }, []);

  const onRemoveAllTracks = useCallback(() => {
    setTracks([]);
    setEnabledTrackIds(new Set());
    setTrackColors({});
    setProgressFocusTrackId(null);
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

  const onProgressFocusTrack = useCallback((trackId: string) => {
    setProgressFocusTrackId((current) => {
      if (current === trackId) {
        setSelectedPilotTrackId(null);
        setMapDataActivePanel((panel) => (panel === 'pilot-detail' ? null : panel));
        return null;
      }
      setSelectedPilotTrackId(trackId);
      setMapDataActivePanel('pilot-detail');
      return trackId;
    });
  }, []);

  const onSelectPilotTrack = useCallback((trackId: string) => {
    setSelectedPilotTrackId(trackId);
    setProgressFocusTrackId(trackId);
    setMapDataActivePanel('pilot-detail');
  }, []);

  const onClosePilotDetail = useCallback(() => {
    setSelectedPilotTrackId(null);
    setProgressFocusTrackId(null);
    setMapDataActivePanel((current) => (current === 'pilot-detail' ? null : current));
  }, []);

  const toggleLeaderboardPanel = useCallback(() => {
    setMapDataActivePanel((current) => (current === 'leaderboard' ? null : 'leaderboard'));
  }, []);

  const pilotQuickSearchEntries = useMemo(
    () => buildPilotQuickSearchEntries(tracks, trackColors),
    [tracks, trackColors],
  );

  const onPlaybackSpeedChange = useCallback((playbackSpeed: number) => {
    setPreferences((current) => ({
      ...current,
      playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
    }));
  }, []);

  useEffect(() => {
    if (!selectedPilotTrackId) return;
    if (!tracks.some((track) => track.id === selectedPilotTrackId)) {
      setSelectedPilotTrackId(null);
      setProgressFocusTrackId((current) =>
        current === selectedPilotTrackId ? null : current,
      );
    }
  }, [tracks, selectedPilotTrackId]);

  useEffect(() => {
    if (
      !showReview ||
      reviewWalkthroughActive ||
      appMenuOpen ||
      reviewKeymapOpen ||
      pilotQuickSearchOpen ||
      reviewTimeSeekMode !== null
    ) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (isReviewShortcutModifier(event)) return;

      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((current) => !current);
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        onPlaybackSpeedChange(
          stepPlaybackSpeed(preferences.playbackSpeed, 1),
        );
        return;
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        onPlaybackSpeedChange(
          stepPlaybackSpeed(preferences.playbackSpeed, -1),
        );
        return;
      }

      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        toggleLeaderboardPanel();
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        setPilotQuickSearchOpen(true);
        return;
      }

      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        setReviewTimeSeekMode('clock');
        return;
      }

      if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        setReviewTimeSeekMode('timer');
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setPlaying(false);
        setCurrentTime(reviewStartTime(timing.taskStart, timing.trackStart));
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const nextTime = seekTurnpointTime(
          currentTimeRef.current.getTime(),
          turnpointSeekTimesMs,
          event.key === 'ArrowRight' ? 1 : -1,
        );
        if (nextTime) {
          event.preventDefault();
          setPlaying(false);
          setCurrentTime(nextTime);
        }
        return;
      }

      if (event.key === 'Escape') {
        if (selectedPilotTrackId) {
          event.preventDefault();
          onClosePilotDetail();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showReview,
    reviewWalkthroughActive,
    appMenuOpen,
    reviewKeymapOpen,
    pilotQuickSearchOpen,
    reviewTimeSeekMode,
    preferences.playbackSpeed,
    onPlaybackSpeedChange,
    toggleLeaderboardPanel,
    selectedPilotTrackId,
    onClosePilotDetail,
    timing.taskStart,
    timing.trackStart,
    turnpointSeekTimesMs,
  ]);


const applyPersistedSession = useCallback((session: {
  task: XcTask;
  taskFileName?: string;
  tracks: FlightTrack[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
  view?: AppView;
  taskProgressMinimized?: boolean;
  taskProgressHeightPx?: number;
}) => {
  hadTaskRef.current = true;
  syncAppDocumentTitle(session.task, session.taskFileName ?? '');
  setTask(withResolvedTaskTimeZone(session.task));
  setTaskFileName(session.taskFileName ?? '');
  setTracks(session.tracks);
  setEnabledTrackIds(new Set(session.enabledTrackIds));
  setTrackColors(assignUniqueTrackColors(session.tracks, session.trackColors));
  setPreferences(session.preferences);
  savePersistedPreferences(session.preferences);
  hasStoredPreferencesRef.current = true;
  setTaskProgressMinimized(session.taskProgressMinimized === true);
  if (session.taskProgressHeightPx !== undefined) {
    setTaskProgressHeightPx(normalizeTaskProgressPanelHeight(session.taskProgressHeightPx));
  }
  if (session.view === 'review') {
    setView('review');
    pushReviewHistoryEntry();
  } else {
    leaveReviewView();
  }
  setTaskFitKey(`${session.taskFileName ?? 'task'}-${Date.now()}`);
}, [leaveReviewView]);

const onHistorySelect = useCallback((entry: TaskHistoryEntry) => {
  setError(null);
  hadTaskRef.current = true;
  syncAppDocumentTitle(entry.task, entry.taskFileName ?? '', entry.location);
  setTask(withResolvedTaskTimeZone(entry.task));
  setTaskFileName(entry.taskFileName ?? '');
  const historyTracks = entry.tracks ?? [];
  setTracks(historyTracks);
  setEnabledTrackIds(
    new Set(
      entry.enabledTrackIds && entry.enabledTrackIds.length > 0
        ? entry.enabledTrackIds
        : historyTracks.map((track) => track.id),
    ),
  );
  setTrackColors(assignUniqueTrackColors(historyTracks, entry.trackColors ?? {}));
  setTaskFitKey(`${entry.taskFileName ?? entry.name}-${Date.now()}`);
  if (entry.location) setTaskLocationLabel(entry.location);
}, []);

const onSessionBundleImport = useCallback(async (file: File) => {
  try {
    setError(null);
    const { session, warnings } = await importSessionBundle(file);
    applyPersistedSession(session);

    if (warnings.length > 0) {
      setError(
        `Imported task and ${session.tracks.length} tracklog(s). Skipped ${warnings.length} file(s): ${warnings.join('; ')}`,
      );
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to import session bundle');
  }
}, [applyPersistedSession]);

const onSessionBundleExport = useCallback(async () => {
  if (!task) return;

  try {
    setError(null);
    await downloadSessionBundle({
      task,
      taskFileName,
      tracks,
      enabledTrackIds: [...enabledTrackIds],
      trackColors,
      preferences,
      view,
      taskProgressMinimized: taskProgressMinimized || undefined,
      taskProgressHeightPx: normalizeTaskProgressPanelHeight(taskProgressHeightPx),
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to export session bundle');
  }
}, [task, taskFileName, tracks, enabledTrackIds, trackColors, preferences, view, taskProgressMinimized, taskProgressHeightPx]);

  const onXcdemonImport = useCallback((result: XcdemonImportResult) => {
    setError(null);
    setTask(withResolvedTaskTimeZone(result.task));
    setTaskFileName(result.taskFileName);
    setTaskFitKey(`${result.taskFileName}-${Date.now()}`);
    setTracks(result.tracks);
    setEnabledTrackIds(new Set(result.tracks.map((track) => track.id)));
    setTrackColors(assignUniqueTrackColors(result.tracks));
    syncAppDocumentTitle(result.task, result.taskFileName);

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

  const onCivlImport = useCallback((result: CivlImportResult) => {
    setError(null);
    setTask(withResolvedTaskTimeZone(result.task));
    setTaskFileName(result.taskFileName);
    setTaskFitKey(`${result.taskFileName}-${Date.now()}`);
    setTracks(result.tracks);
    setEnabledTrackIds(new Set(result.tracks.map((track) => track.id)));
    setTrackColors(assignUniqueTrackColors(result.tracks));
    syncAppDocumentTitle(result.task, result.taskFileName);

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

  const previewTaskProgressHeight = useCallback((height: number) => {
    reviewStageRef.current?.style.setProperty('--task-progress-height', `${height}px`);
  }, []);

  const restoreWalkthroughUi = useCallback(() => {
    const snapshot = walkthroughUiSnapshotRef.current;
    if (!snapshot) return;
    setMapDataActivePanel(snapshot.mapDataActivePanel);
    setTaskProgressMinimized(snapshot.taskProgressMinimized);
    setMobileChartOpen(snapshot.mobileChartOpen);
    setPlaying(snapshot.playing);
    setSelectedPilotTrackId(snapshot.selectedPilotTrackId);
    walkthroughUiSnapshotRef.current = null;
    setWalkthroughLegendForceOpen(false);
    setWalkthroughStepId(null);
    setWalkthroughDemoPilotTrackId(null);
  }, []);

  const closeReviewWalkthrough = useCallback(
    (_completed: boolean) => {
      setReviewWalkthroughActive(false);
      restoreWalkthroughUi();
      markReviewWalkthroughDismissed();
    },
    [restoreWalkthroughUi],
  );

  const startReviewWalkthrough = useCallback(() => {
    if (reviewWalkthroughActive) return;
    walkthroughUiSnapshotRef.current = {
      mapDataActivePanel,
      taskProgressMinimized,
      mobileChartOpen,
      playing,
      selectedPilotTrackId,
    };
    setWalkthroughDemoPilotTrackId(null);
    setWalkthroughStepId(null);
    setPlaying(false);
    setReviewWalkthroughActive(true);
  }, [
    reviewWalkthroughActive,
    mapDataActivePanel,
    taskProgressMinimized,
    mobileChartOpen,
    playing,
    selectedPilotTrackId,
  ]);

  const pickWalkthroughDemoPilotTrackId = useCallback((): string | null => {
    const candidates = enrichedTracks.filter((track) => enabledTrackIds.has(track.id));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]!.id;
  }, [enrichedTracks, enabledTrackIds]);

  const handleReviewWalkthroughStep = useCallback(
    (stepId: ReviewWalkthroughStepId) => {
      setWalkthroughStepId(stepId);
      setWalkthroughLegendForceOpen(stepId === 'map-legend');
      switch (stepId) {
        case 'leaderboard':
          setMapDataActivePanel('leaderboard');
          break;
        case 'leg-statistics':
          setMapDataActivePanel('leg-statistics');
          break;
        case 'pilot-select': {
          setMapDataActivePanel('leaderboard');
          const demoId = walkthroughDemoPilotTrackId ?? pickWalkthroughDemoPilotTrackId();
          if (demoId) {
            if (demoId !== walkthroughDemoPilotTrackId) {
              setWalkthroughDemoPilotTrackId(demoId);
            }
            onSelectPilotTrack(demoId);
          }
          break;
        }
        case 'pilot-stats': {
          const demoId = walkthroughDemoPilotTrackId ?? pickWalkthroughDemoPilotTrackId();
          if (demoId) {
            if (demoId !== walkthroughDemoPilotTrackId) {
              setWalkthroughDemoPilotTrackId(demoId);
            }
            onSelectPilotTrack(demoId);
          }
          setMapDataActivePanel('pilot-detail');
          break;
        }
        case 'task-progress':
          setTaskProgressMinimized(false);
          if (isMobileReviewLayout()) {
            setMobileChartOpen(true);
          }
          break;
        default:
          break;
      }
    },
    [pickWalkthroughDemoPilotTrackId, onSelectPilotTrack, walkthroughDemoPilotTrackId],
  );

  useEffect(() => {
    if (!showReview || !storageReady || autoWalkthroughStartedRef.current) return;
    if (isReviewWalkthroughDismissed()) return;
    autoWalkthroughStartedRef.current = true;
    const timer = window.setTimeout(() => {
      startReviewWalkthrough();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [showReview, storageReady, startReviewWalkthrough]);

  useEffect(() => {
    if (!showReview) {
      autoWalkthroughStartedRef.current = false;
      return;
    }
    if (pendingWalkthroughAfterReviewRef.current) {
      pendingWalkthroughAfterReviewRef.current = false;
      window.setTimeout(() => startReviewWalkthrough(), 300);
    }
  }, [showReview, startReviewWalkthrough]);

  const handleAppMenuWalkthrough = useCallback(() => {
    if (!canEnterReview) return;
    if (showReview) {
      startReviewWalkthrough();
      return;
    }
    pendingWalkthroughAfterReviewRef.current = true;
    setView('review');
  }, [canEnterReview, showReview, startReviewWalkthrough]);

  useEffect(() => {
    if (!showReview) return;
    previewTaskProgressHeight(
      taskProgressMinimized ? defaultTaskProgressHeight() : taskProgressHeightPx,
    );
  }, [showReview, taskProgressMinimized, taskProgressHeightPx, previewTaskProgressHeight]);

  const errorOverlay = error ? (
    <ErrorOverlay message={error} onDismiss={() => setError(null)} />
  ) : null;

  const appMenuOverlay = (
    <AppMenuOverlay
      open={appMenuOpen}
      onClose={() => setAppMenuOpen(false)}
      preferences={preferences}
      onPreferencesChange={setPreferences}
      circlingDetectionDirty={showReview && circlingDetectionDirty}
      onRecomputeCirclingDetection={handleRecomputeCirclingDetection}
      onRestoreCirclingDefaults={handleRestoreCirclingDefaults}
      onOpenKeymap={() => {
        setAppMenuOpen(false);
        setReviewKeymapOpen(true);
      }}
      onStartWalkthrough={handleAppMenuWalkthrough}
      walkthroughAvailable={canEnterReview}
    />
  );

  if (!showReview) {
    return (
      <>
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
          canContinue={Boolean(task && visibleTracks.length > 0)}
          onTaskFile={(file) => void onTaskFile(file)}
          onTrackFiles={(files) => void onTrackFiles(files)}
          onToggleTrack={onToggleTrack}
          onProgressFocusTrack={onProgressFocusTrack}
          progressFocusTrackId={progressFocusTrackId}
          onTrackColorChange={onTrackColorChange}
          onRemoveTrack={onRemoveTrack}
          onRemoveAllTracks={onRemoveAllTracks}
          onSetTracksEnabled={onSetTracksEnabled}
          onOpenAppMenu={() => setAppMenuOpen(true)}
          onContinue={goToReview}
          onXcdemonImport={onXcdemonImport}
          onCivlImport={onCivlImport}
          onSessionBundleImport={(file) => void onSessionBundleImport(file)}
          onSessionBundleExport={() => void onSessionBundleExport()}
          onSaveToHistory={() => void onSaveToHistory()}
          onHistorySelect={onHistorySelect}
          onError={setError}
          onTaskUpdate={onTaskUpdate}
          onClearTask={onClearTask}
        />
      </div>
      {errorOverlay}
      <ReviewKeymapDialog open={reviewKeymapOpen} onClose={() => setReviewKeymapOpen(false)} />
      {appMenuOverlay}
      </>
    );
  }

  return (
    <>
    <div className="app-shell review-mode">
      <div className="app review-screen">
        {route && (
          <>
            <TimeControls
            currentTime={currentTime}
            timing={timing}
            turnpointReachMarkers={sliderTurnpointReachMarkers}
            startTurnpointTooltip={startTurnpointTooltip}
            finishTurnpointTooltip={finishTurnpointTooltip}
            distanceUnit={preferences.distanceUnit}
            playing={playing}
            speed={preferences.playbackSpeed}
            timezone={taskTimeZone}
            onTimeChange={setCurrentTime}
            onPlayingChange={setPlaying}
            onSpeedChange={onPlaybackSpeedChange}
            onEdit={goToWelcome}
            onOpenAppMenu={() => setAppMenuOpen(true)}
            onOpenClockSeek={() => setReviewTimeSeekMode('clock')}
            onOpenTimerSeek={() => setReviewTimeSeekMode('timer')}
          />
          </>
        )}

        <div
          ref={reviewStageRef}
          className={`review-stage${mobileChartOpen ? ' chart-open' : ''}`}
        >
          {bounds && route && (
            <MapView
              bounds={bounds}
              circles={circles}
              optimizedRoute={route}
              enrichedTracks={enrichedTracks}
              allEnrichedTracks={allEnrichedTracks}
              trackColors={trackColors}
              currentTimeRef={currentTimeRef}
              fitKey={taskFitKey || 'task'}
              preferences={preferences}
              taskTimeZone={taskTimeZone}
              pilotSssCrossDelaySec={pilotSssCrossDelaySec}
              playing={playing}
              pausedTime={currentTime}
              scoreboardCompetitors={scoreboardCompetitors}
              scoreboardRankingTimeMs={scoreboardRankingTimeMs}
              enabledTrackIds={enabledTrackIds}
              onToggleTrack={onToggleTrack}
              progressFocusTrackId={progressFocusTrackId}
              progressFocusColor={progressFocusColor}
              selectedPilotTrackId={selectedPilotTrackId}
              onProgressFocusTrack={onProgressFocusTrack}
              onSelectPilotTrack={onSelectPilotTrack}
              onClosePilotDetail={onClosePilotDetail}
              mapDataActivePanel={mapDataActivePanel}
              onMapDataActivePanelChange={setMapDataActivePanel}
              legStatistics={legStatistics}
              taskStart={timing.taskStart}
              fieldTimeline={fieldTimeline}
              nextTurnpointTimeline={nextTurnpointTimeline}
              taskProgressMarkerRef={taskProgressMarkerRef}
              turnpointReachMarkers={turnpointReachMarkers}
              walkthroughLegendForceOpen={walkthroughLegendForceOpen}
              walkthroughPilotSelectTrackId={
                walkthroughStepId === 'pilot-select' ? walkthroughDemoPilotTrackId : null
              }
            />
          )}

          {route && (
            <>
              {!mobileChartOpen && (
                <button
                  type="button"
                  className="review-chart-toggle"
                  aria-expanded={false}
                  aria-controls="review-altitude-chart"
                  onClick={() => setMobileChartOpen(true)}
                >
                  <IconButtonContent icon={LineChart}>Task Progress</IconButtonContent>
                </button>
              )}

              <TaskProgressPanel
                mobileOpen={mobileChartOpen}
                enrichedTracks={enrichedTracks}
                allEnrichedTracks={allEnrichedTracks}
                trackColors={trackColors}
                route={route}
                currentTimeRef={currentTimeRef}
                playing={playing}
                pausedTime={currentTime}
                turnpoints={route.progressTurnpoints}
                turnpointReachMarkers={turnpointReachMarkers}
                fieldTimeline={fieldTimeline}
                taskStart={timing.taskStart}
                playbackEndTime={timing.trackEnd}
                onTimeChange={setCurrentTime}
                progressFocusTrackId={progressFocusTrackId}
                onProgressFocusTrack={onProgressFocusTrack}
                selectedPilotTrackId={selectedPilotTrackId}
                altitudeMin={altitudeRange.min}
                altitudeMax={altitudeRange.max}
                altitudeStep={altitudeRange.step}
                taskDistanceKm={taskDistanceKm}
                preferences={preferences}
                taskProgressMarkerRef={taskProgressMarkerRef}
                minimized={taskProgressMinimized}
                panelHeight={taskProgressHeightPx}
                onPanelHeightChange={setTaskProgressHeightPx}
                onToggleMinimized={() => setTaskProgressMinimized((value) => !value)}
                onMobileDismiss={() => {
                  setMobileChartOpen(false);
                  setTaskProgressMinimized(false);
                }}
                onHeightPreview={previewTaskProgressHeight}
              />
            </>
          )}
        </div>
      </div>
    </div>
    <ReviewWalkthrough
      active={reviewWalkthroughActive}
      onClose={closeReviewWalkthrough}
      onStepChange={handleReviewWalkthroughStep}
    />
    <ReviewKeymapDialog open={reviewKeymapOpen} onClose={() => setReviewKeymapOpen(false)} />
    <PilotQuickSearch
      open={pilotQuickSearchOpen}
      entries={pilotQuickSearchEntries}
      onClose={() => setPilotQuickSearchOpen(false)}
      onSelect={onSelectPilotTrack}
    />
    <ReviewTimeSeekDialog
      mode={reviewTimeSeekMode ?? 'clock'}
      open={reviewTimeSeekMode !== null}
      onClose={() => setReviewTimeSeekMode(null)}
      onSeek={(time) => {
        setCurrentTime(time);
      }}
      taskTimeZone={taskTimeZone}
      referenceDate={timing.taskStart ?? timing.trackStart}
      taskStart={timing.taskStart}
      trackStart={timing.trackStart}
      trackEnd={timing.trackEnd}
    />
    {errorOverlay}
    {appMenuOverlay}
    </>
  );
}
