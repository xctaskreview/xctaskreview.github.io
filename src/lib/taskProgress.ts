import type { LatLon, OptimizedRoute, TrackPoint, XcTask } from './types';
import { createLocalProjection, getTrackEndTime, haversine, interpolateReasonableAltitude, isLandedAtTime, resolveDisplayAltitudeMeters } from './geo';

export interface EnrichedTrackPoint extends TrackPoint {
  legIndex: number;
  hasStarted: boolean;
  finished: boolean;
  taskPercent: number;
}

export interface EnrichedFlightTrack {
  id: string;
  pilotName: string;
  fileName: string;
  points: EnrichedTrackPoint[];
  date?: Date;
  finishTime?: Date;
  landingTime?: Date;
  gliderType?: string;
  igcHeader?: string;
}

interface TurnpointCylinder {
  index: number;
  center: LatLon;
  radius: number;
}

function pointInCylinder(point: LatLon, center: LatLon, radius: number): boolean {
  return haversine(point, center) <= radius;
}

/** Progress along the optimized leg segment, trimmed to [0, 1]. */
function progressOnOptimizedLeg(
  position: LatLon,
  legStart: LatLon,
  legEnd: LatLon,
  legLength: number,
  projectionOrigin: LatLon,
): number {
  if (legLength <= 0) return 1;

  const projection = createLocalProjection(projectionOrigin);
  const p = projection.toLocal(position);
  const a = projection.toLocal(legStart);
  const b = projection.toLocal(legEnd);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return 0;

  const rawT = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const t = Math.max(0, Math.min(1, rawT));
  const foot = projection.toLatLon(a.x + t * dx, a.y + t * dy);
  const alongLeg = haversine(legStart, foot);

  return Math.max(0, Math.min(1, alongLeg / legLength));
}

export function computeTaskPercentForLeg(
  position: LatLon,
  legIndex: number,
  finished: boolean,
  hasStarted: boolean,
  route: OptimizedRoute,
): number {
  if (finished) return 100;
  if (!hasStarted || legIndex < 0) return 0;

  const { progressLegDistances, progressTotalDistance, progressPoints } = route;
  if (progressTotalDistance <= 0) return 0;

  let finishedDistance = 0;
  for (let i = 0; i < legIndex; i++) {
    finishedDistance += progressLegDistances[i];
  }

  const legLength = progressLegDistances[legIndex] ?? 0;
  const legFraction = progressOnOptimizedLeg(
    position,
    progressPoints[legIndex],
    progressPoints[legIndex + 1],
    legLength,
    progressPoints[0],
  );

  const distanceAlong = finishedDistance + legFraction * legLength;
  return Math.max(0, Math.min(100, (distanceAlong / progressTotalDistance) * 100));
}

export function enrichTrackWithTaskProgress(
  track: {
    id: string;
    pilotName: string;
    fileName: string;
    points: TrackPoint[];
    date?: Date;
    finishTime?: Date;
    landingTime?: Date;
    gliderType?: string;
    igcHeader?: string;
  },
  task: XcTask,
  route: OptimizedRoute,
  taskStart?: Date,
): EnrichedFlightTrack {
  const goalIndex = route.goalIndex;
  const turnpoints: TurnpointCylinder[] = task.turnpoints.map((tp, index) => ({
    index,
    center: { lat: tp.waypoint.lat, lon: tp.waypoint.lon },
    radius: tp.radius,
  }));

  let wasInsideSss = false;
  let hasExitedSss = false;
  let currentLeg = -1;
  let finished = false;
  let finishTime = track.finishTime;

  const taskStartMs = taskStart?.getTime();

  for (const point of track.points) {
    if (taskStartMs === undefined || point.time.getTime() < taskStartMs) {
      if (pointInCylinder(point, route.sssCenter, route.sssRadius)) {
        wasInsideSss = true;
      }
    }
  }

  const enrichedPoints: EnrichedTrackPoint[] = track.points.map((point) => {
    const afterStart = taskStartMs === undefined || point.time.getTime() >= taskStartMs;
    const insideSss = pointInCylinder(point, route.sssCenter, route.sssRadius);

    if (afterStart && !finished) {
      if (!hasExitedSss && wasInsideSss && !insideSss) {
        hasExitedSss = true;
        currentLeg = 0;
      }

      if (hasExitedSss && currentLeg >= 0) {
        const nextTpIndex = currentLeg + 1;
        if (nextTpIndex <= goalIndex) {
          const nextTp = turnpoints[nextTpIndex];
          if (pointInCylinder(point, nextTp.center, nextTp.radius)) {
            if (nextTpIndex === goalIndex) {
              finished = true;
              finishTime ??= point.time;
            } else {
              currentLeg = nextTpIndex;
            }
          }
        }
      }
    }

    if (insideSss) {
      wasInsideSss = true;
    }

    const hasStarted = hasExitedSss && afterStart;
    const taskPercent = computeTaskPercentForLeg(
      point,
      currentLeg,
      finished,
      hasStarted,
      route,
    );

    return {
      ...point,
      legIndex: currentLeg,
      hasStarted,
      finished,
      taskPercent,
    };
  });

  return {
    id: track.id,
    pilotName: track.pilotName,
    fileName: track.fileName,
    points: enrichedPoints,
    date: track.date,
    finishTime,
    landingTime: track.landingTime ?? getTrackEndTime(track.points),
    gliderType: track.gliderType,
    igcHeader: track.igcHeader,
  };
}

export function getNextTurnpointName(
  legIndex: number,
  finished: boolean,
  hasStarted: boolean,
  route: OptimizedRoute,
): string {
  if (finished) return 'Goal';

  const turnpoints = route.progressTurnpoints;
  if (turnpoints.length === 0) return '—';

  const nextIndex = hasStarted ? legIndex + 1 : 1;
  if (nextIndex >= turnpoints.length) return 'Goal';

  return turnpoints[nextIndex]?.name ?? '—';
}

export function getTrackSnapshotAtTime(
  track: EnrichedFlightTrack,
  time: Date,
  route: OptimizedRoute,
): {
  lat: number;
  lon: number;
  alt: number;
  taskPercent: number;
  legIndex: number;
  landed: boolean;
  nextTurnpointName: string;
} | null {
  if (track.points.length === 0) return null;

  const t = time.getTime();
  let state = track.points[0];

  for (const point of track.points) {
    if (point.time.getTime() <= t) {
      state = point;
    } else {
      break;
    }
  }

  let lat = state.lat;
  let lon = state.lon;
  let alt = state.alt;

  if (t > track.points[0].time.getTime()) {
    for (let i = 0; i < track.points.length - 1; i++) {
      const a = track.points[i];
      const b = track.points[i + 1];
      const ta = a.time.getTime();
      const tb = b.time.getTime();
      if (t >= ta && t <= tb) {
        const ratio = tb === ta ? 0 : (t - ta) / (tb - ta);
        lat = a.lat + (b.lat - a.lat) * ratio;
        lon = a.lon + (b.lon - a.lon) * ratio;
        alt = interpolateReasonableAltitude(a.alt, b.alt, ratio);
        break;
      }
    }
    const last = track.points[track.points.length - 1];
    if (t >= last.time.getTime()) {
      lat = last.lat;
      lon = last.lon;
      alt = last.alt;
    }
  }

  alt = resolveDisplayAltitudeMeters(track.points, time, alt);

  const taskPercent = computeTaskPercentForLeg(
    { lat, lon },
    state.legIndex,
    state.finished,
    state.hasStarted,
    route,
  );

  return {
    lat,
    lon,
    alt,
    taskPercent,
    legIndex: state.legIndex,
    landed: isLandedAtTime(track.landingTime ?? getTrackEndTime(track.points), time),
    nextTurnpointName: getNextTurnpointName(
      state.legIndex,
      state.finished,
      state.hasStarted,
      route,
    ),
  };
}

export function enrichTracksWithTaskProgress(
  tracks: {
    id: string;
    pilotName: string;
    fileName: string;
    points: TrackPoint[];
    date?: Date;
    finishTime?: Date;
    landingTime?: Date;
    gliderType?: string;
  }[],
  task: XcTask,
  route: OptimizedRoute,
  taskStart?: Date,
): EnrichedFlightTrack[] {
  return tracks.map((track) => enrichTrackWithTaskProgress(track, task, route, taskStart));
}
