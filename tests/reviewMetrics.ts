import type { GlobalLegStatistics } from '../src/lib/legStatistics';
import type { TurnpointReachMarker } from '../src/lib/taskProgressMarker';
import { computeTurnpointReachTimes } from '../src/lib/taskProgressMarker';
import {
  computeGlobalLegStatistics,
  computeTaskTiming,
  enrichTracksWithTaskProgress,
} from '../src/lib/tracks';
import { buildTaskFieldTimeline } from '../src/lib/taskTimeline';
import type { PersistedSession } from '../src/lib/persistedSession';
import type { TaskTiming } from '../src/lib/types';
import {
  buildOptimizedRoute,
  getTaskStartTime,
  getUniqueTurnpointCircles,
} from '../src/lib/xctask';

export interface ReviewMetrics {
  trackCount: number;
  enabledTrackCount: number;
  progressTotalDistanceM: number;
  progressLegCount: number;
  taskStart?: Date;
  timing: TaskTiming;
  legStatistics: GlobalLegStatistics[];
  turnpointReachMarkers: TurnpointReachMarker[];
}

export function buildReviewMetricsFromSession(session: PersistedSession): ReviewMetrics {
  const { task } = session;
  const route = buildOptimizedRoute(task);
  const visibleTracks = session.tracks.filter((track) => session.enabledTrackIds.includes(track.id));
  const referenceDate =
    visibleTracks.find((track) => track.date)?.date ??
    visibleTracks[0]?.points[0]?.time ??
    new Date();
  const taskStart = getTaskStartTime(task, referenceDate);
  const enrichedTracks = enrichTracksWithTaskProgress(visibleTracks, task, route, taskStart);
  const timing = computeTaskTiming(task, enrichedTracks);
  const circles = getUniqueTurnpointCircles(task);

  const fieldTimeline = buildTaskFieldTimeline(enrichedTracks, timing.taskStart, timing.trackEnd);

  const turnpointReachMarkers =
    timing.taskStart && enrichedTracks.length > 0
      ? computeTurnpointReachTimes(
          enrichedTracks,
          route,
          timing.taskStart,
          timing.trackEnd,
          circles,
          fieldTimeline,
        )
      : [];

  return {
    trackCount: session.tracks.length,
    enabledTrackCount: visibleTracks.length,
    progressTotalDistanceM: route.progressTotalDistance,
    progressLegCount: route.progressLegDistances.length,
    taskStart,
    timing,
    legStatistics: computeGlobalLegStatistics(enrichedTracks, route),
    turnpointReachMarkers,
  };
}
