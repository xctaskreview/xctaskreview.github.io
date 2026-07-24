import { createLocalProjection, haversine } from './geo';
import { extractPilotDisplayName } from './igc';
import { getTaggedTurnpointProgressIndices, TASK_PROGRESS_LINE_COLOR } from './taskMapStyle';
import type { EnrichedFlightTrack } from './taskProgress';
import { getTrackSnapshotAtTime } from './taskProgress';
import type { LatLon, OptimizedRoute, RoutePoint } from './types';

export { TASK_PROGRESS_LINE_COLOR };

export interface TurnpointReachMarker {
  index: number;
  number: number;
  name: string;
  taskPercent: number;
  taskKm: number;
  radiusM: number;
  time: Date;
  firstPilot: string;
  firstTagTime: Date;
}

export const TASK_PROGRESS_LINE_HALF_WIDTH_M = 350;

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

  const runningMaxProgress = Math.min(100, updateRunningMaxProgress(tracks, route, taskStart, time, cacheRef, trackKey));
  if (runningMaxProgress <= 0) return null;

  const routePoint = pointOnRouteAtProgress(route, runningMaxProgress);
  if (!routePoint) return null;

  const taskDistanceKm = route.progressTotalDistance / 1000;

  return {
    taskPercent: runningMaxProgress,
    taskKm: (runningMaxProgress / 100) * taskDistanceKm,
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

function computeFirstPilotTags(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
): Map<number, { time: Date; pilot: string }> {
  const firstByIndex = new Map<number, { time: Date; pilot: string }>();
  const taskStartMs = taskStart.getTime();
  const goalProgressIndex = route.progressTurnpoints.length - 1;

  const record = (index: number, time: Date, pilot: string) => {
    if (index <= 0 || index > goalProgressIndex) return;
    const existing = firstByIndex.get(index);
    if (!existing || time.getTime() < existing.time.getTime()) {
      firstByIndex.set(index, { time, pilot });
    }
  };

  for (const track of tracks) {
    const pilot = extractPilotDisplayName(track);
    let prevLeg = -1;
    let prevFinished = false;

    for (const point of track.points) {
      if (point.time.getTime() < taskStartMs || !point.hasStarted) continue;

      if (point.finished && !prevFinished) {
        record(goalProgressIndex, point.time, pilot);
      }

      if (point.legIndex > prevLeg && point.legIndex >= 1) {
        record(point.legIndex, point.time, pilot);
      }

      prevLeg = point.legIndex;
      prevFinished = point.finished;
    }
  }

  return firstByIndex;
}

export function computeTurnpointReachTimes(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
  endTime: Date,
  circles: RoutePoint[],
): TurnpointReachMarker[] {
  if (tracks.length === 0 || route.progressTurnpoints.length === 0) {
    return [];
  }

  const taskStartMs = taskStart.getTime();
  const endMs = endTime.getTime();
  if (endMs < taskStartMs) return [];

  const cacheRef: { current: TaskProgressMarkerCache | null } = { current: null };
  const trackKey = tracks.map((track) => track.id).join('|');
  const firstPilotTags = computeFirstPilotTags(tracks, route, taskStart);
  const reached = new Map<number, TurnpointReachMarker>();
  const startSecond = Math.floor(taskStartMs / 1000);
  const endSecond = Math.floor(endMs / 1000);

  for (let second = startSecond; second <= endSecond; second += 1) {
    const time = new Date(second * 1000);
    const runningMax = updateRunningMaxProgress(tracks, route, taskStart, time, cacheRef, trackKey);
    const tagged = getTaggedTurnpointProgressIndices(route, runningMax);

    for (const index of tagged) {
      if (index === 0 || reached.has(index)) continue;
      const tp = route.progressTurnpoints[index];
      if (!tp) continue;
      const firstTag = firstPilotTags.get(index);
      const circle = circles.find((entry) => entry.number === tp.number);
      reached.set(index, {
        index,
        number: tp.number,
        name: tp.name,
        taskPercent: tp.taskPercent,
        taskKm: tp.taskKm,
        radiusM: circle?.radius ?? 0,
        time,
        firstPilot: firstTag?.pilot ?? '—',
        firstTagTime: firstTag?.time ?? time,
      });
    }
  }

  return [...reached.values()];
}
