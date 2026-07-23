import { createLocalProjection, haversine } from './geo';
import type { EnrichedFlightTrack } from './taskProgress';
import { getTrackSnapshotAtTime } from './taskProgress';
import type { LatLon, OptimizedRoute } from './types';

export const TASK_PROGRESS_LINE_HALF_WIDTH_M = 350;
export const TASK_PROGRESS_LINE_COLOR = '#dc2626';

export interface TaskProgressMarker {
  taskPercent: number;
  taskKm: number;
  legNumber: number;
  center: LatLon;
  line: [LatLon, LatLon];
}

export interface TaskProgressMarkerCache {
  trackKey: string;
  taskStartMs: number;
  lastTimeMs: number;
  runningMaxProgress: number;
}

function maxTaskPercentAmongPilots(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  timeMs: number,
): number {
  let maxProgress = 0;

  for (const track of tracks) {
    if (track.points.length === 0 || track.points[0].time.getTime() > timeMs) {
      continue;
    }

    const snapshot = getTrackSnapshotAtTime(track, new Date(timeMs), route);
    if (!snapshot?.hasStarted) continue;
    maxProgress = Math.max(maxProgress, snapshot.taskPercent);
  }

  return maxProgress;
}

function recomputeRunningMaxProgress(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStartMs: number,
  timeMs: number,
): number {
  if (timeMs < taskStartMs) return 0;

  let runningMax = 0;
  const startSecond = Math.floor(taskStartMs / 1000);
  const endSecond = Math.floor(timeMs / 1000);

  for (let second = startSecond; second <= endSecond; second += 1) {
    runningMax = Math.max(runningMax, maxTaskPercentAmongPilots(tracks, route, second * 1000));
  }

  return Math.max(runningMax, maxTaskPercentAmongPilots(tracks, route, timeMs));
}

export function updateRunningMaxProgress(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
  time: Date,
  cacheRef: { current: TaskProgressMarkerCache | null },
  trackKey: string,
): number {
  const taskStartMs = taskStart.getTime();
  const timeMs = time.getTime();
  const cache = cacheRef.current;
  const needsReset =
    !cache ||
    cache.trackKey !== trackKey ||
    cache.taskStartMs !== taskStartMs ||
    timeMs < cache.lastTimeMs;

  let runningMaxProgress: number;

  if (needsReset) {
    runningMaxProgress = recomputeRunningMaxProgress(tracks, route, taskStartMs, timeMs);
  } else {
    const currentMax = maxTaskPercentAmongPilots(tracks, route, timeMs);
    runningMaxProgress = Math.max(cache.runningMaxProgress, currentMax);
  }

  cacheRef.current = {
    trackKey,
    taskStartMs,
    lastTimeMs: timeMs,
    runningMaxProgress,
  };

  return runningMaxProgress;
}

export function pointOnRouteAtProgress(
  route: OptimizedRoute,
  progressPercent: number,
): { point: LatLon; legIndex: number } | null {
  if (route.progressTotalDistance <= 0 || progressPercent <= 0) {
    return null;
  }

  const clampedPercent = Math.min(100, progressPercent);
  const targetDistance = (clampedPercent / 100) * route.progressTotalDistance;

  let legIndex = 0;
  for (let i = route.progressLegDistances.length - 1; i >= 0; i -= 1) {
    if (targetDistance >= route.progressCumulativeDistances[i]) {
      legIndex = i;
      break;
    }
  }

  const legStartDistance = route.progressCumulativeDistances[legIndex] ?? 0;
  const legLength = route.progressLegDistances[legIndex] ?? 0;
  const legStart = route.progressPoints[legIndex];
  const legEnd = route.progressPoints[legIndex + 1] ?? legStart;

  if (legLength <= 0) {
    return { point: legStart, legIndex };
  }

  const fraction = Math.max(0, Math.min(1, (targetDistance - legStartDistance) / legLength));

  return {
    point: {
      lat: legStart.lat + (legEnd.lat - legStart.lat) * fraction,
      lon: legStart.lon + (legEnd.lon - legStart.lon) * fraction,
    },
    legIndex,
  };
}

export function buildProgressLineAtPoint(
  route: OptimizedRoute,
  legIndex: number,
  point: LatLon,
): [LatLon, LatLon] {
  const clampedLeg = Math.max(0, Math.min(route.progressLegDistances.length - 1, legIndex));
  const projection = createLocalProjection(route.progressPoints[0]);
  const legStart = projection.toLocal(route.progressPoints[clampedLeg]);
  const legEnd = projection.toLocal(route.progressPoints[clampedLeg + 1] ?? route.progressPoints[clampedLeg]);

  let dx = legEnd.x - legStart.x;
  let dy = legEnd.y - legStart.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    dx = 1;
    dy = 0;
  }

  const halfWidth = TASK_PROGRESS_LINE_HALF_WIDTH_M;
  const px = (-dy / length) * halfWidth;
  const py = (dx / length) * halfWidth;
  const center = projection.toLocal(point);

  return [
    projection.toLatLon(center.x - px, center.y - py),
    projection.toLatLon(center.x + px, center.y + py),
  ];
}

export function computeTaskProgressMarker(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
  time: Date,
  cacheRef: { current: TaskProgressMarkerCache | null },
  trackKey: string,
): TaskProgressMarker | null {
  if (tracks.length === 0 || route.progressTotalDistance <= 0) {
    cacheRef.current = null;
    return null;
  }

  const runningMaxProgress = updateRunningMaxProgress(tracks, route, taskStart, time, cacheRef, trackKey);
  if (runningMaxProgress <= 0) return null;

  const routePoint = pointOnRouteAtProgress(route, runningMaxProgress);
  if (!routePoint) return null;

  return {
    taskPercent: runningMaxProgress,
    taskKm: (runningMaxProgress / 100) * (route.progressTotalDistance / 1000),
    legNumber: routePoint.legIndex + 1,
    center: routePoint.point,
    line: buildProgressLineAtPoint(route, routePoint.legIndex, routePoint.point),
  };
}

export function getTaskCenter(route: OptimizedRoute): LatLon {
  const points = route.progressPoints;
  if (points.length === 0) {
    return { lat: 0, lon: 0 };
  }

  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  };
}

export function getProgressLabelAnchor(line: [LatLon, LatLon], taskCenter: LatLon): LatLon {
  const [a, b] = line;
  return haversine(a, taskCenter) >= haversine(b, taskCenter) ? a : b;
}
