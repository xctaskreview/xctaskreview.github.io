import type { LatLon, OptimizedRoute, TrackPoint, XcTask } from './types';
import {
  clampDisplayAltitudeMeters,
  createLocalProjection,
  getTrackEndTime,
  haversine,
  isFlyingAltitudeMeters,
  isLandedAtTime,
} from './geo';
import { attachLegTimingsToTracks, type PilotLegTiming } from './legStatistics';
import { parseGliderTypeFromHeader, pilotFirstName } from './igc';
import { findFirstTimeFieldReachedPercent, type TaskFieldTimeline } from './taskTimeline';

/**
 * Track point with every value playback needs already derived. Nothing here is recomputed
 * while the review runs: frames only interpolate between neighbouring points.
 */
export interface EnrichedTrackPoint extends TrackPoint {
  legIndex: number;
  hasStarted: boolean;
  finished: boolean;
  taskPercent: number;
  timeMs: number;
  /** Altitude to draw, already sanitised and carried over gaps in the log. */
  displayAlt: number;
  /** Distance flown along the track up to this point, in meters. */
  cumulativeDistanceM: number;
  /** Max task % from track start through this point (inclusive). */
  maxTaskPercentSoFar: number;
  /** Display altitude at the point where `maxTaskPercentSoFar` was last updated. */
  altAtMaxTaskPercentSoFar: number;
}

export interface EnrichedFlightTrack {
  id: string;
  pilotName: string;
  /** Label shown on markers, split once at load rather than per frame. */
  firstName: string;
  fileName: string;
  points: EnrichedTrackPoint[];
  date?: Date;
  finishTime?: Date;
  landingTime?: Date;
  gliderType?: string;
  igcHeader?: string;
  legTimings?: PilotLegTiming[];
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
  let finishTime: Date | undefined;

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
        // currentLeg is 0-based in the SSS→ESS progress route; cylinders use absolute indices.
        const nextTpIndex = route.sssIndex + currentLeg + 1;
        if (nextTpIndex <= goalIndex) {
          const nextTp = turnpoints[nextTpIndex];
          if (pointInCylinder(point, nextTp.center, nextTp.radius)) {
            if (nextTpIndex === goalIndex) {
              finished = true;
              finishTime ??= point.time;
            } else {
              currentLeg = nextTpIndex - route.sssIndex;
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
      timeMs: point.time.getTime(),
      displayAlt: 0,
      cumulativeDistanceM: 0,
      maxTaskPercentSoFar: 0,
      altAtMaxTaskPercentSoFar: 0,
    };
  });

  attachPlaybackFieldsToPoints(enrichedPoints);

  return {
    id: track.id,
    pilotName: track.pilotName,
    firstName: pilotFirstName(track.pilotName),
    fileName: track.fileName,
    points: enrichedPoints,
    date: track.date,
    finishTime,
    landingTime: track.landingTime ?? getTrackEndTime(track.points),
    gliderType: track.gliderType ?? parseGliderTypeFromHeader(track.igcHeader ?? ''),
    igcHeader: track.igcHeader,
  };
}

/**
 * Single pass filling the values playback reads every frame. Display altitude carries the
 * last usable reading forward, matching what a per-frame backward scan used to resolve.
 */
function attachPlaybackFieldsToPoints(points: EnrichedTrackPoint[]): void {
  let lastFlyingDisplayAlt: number | null = null;
  let cumulativeDistanceM = 0;
  let maxTaskPercentSoFar = -1;
  let altAtMaxTaskPercentSoFar = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    if (isFlyingAltitudeMeters(point.alt)) {
      lastFlyingDisplayAlt = clampDisplayAltitudeMeters(point.alt);
      point.displayAlt = lastFlyingDisplayAlt;
    } else {
      point.displayAlt = lastFlyingDisplayAlt ?? clampDisplayAltitudeMeters(point.alt);
    }

    if (index > 0) {
      cumulativeDistanceM += haversine(points[index - 1], point);
    }
    point.cumulativeDistanceM = cumulativeDistanceM;

    if (point.taskPercent >= maxTaskPercentSoFar) {
      maxTaskPercentSoFar = point.taskPercent;
      altAtMaxTaskPercentSoFar = point.displayAlt;
    }
    point.maxTaskPercentSoFar = maxTaskPercentSoFar;
    point.altAtMaxTaskPercentSoFar = altAtMaxTaskPercentSoFar;
  }
}

export function getNextTurnpoint(
  legIndex: number,
  finished: boolean,
  hasStarted: boolean,
  route: OptimizedRoute,
): { name: string; number: number | null } {
  if (finished) return { name: 'Goal', number: null };

  const turnpoints = route.progressTurnpoints;
  if (turnpoints.length === 0) return { name: '—', number: null };

  const nextIndex = hasStarted ? legIndex + 1 : 1;
  if (nextIndex >= turnpoints.length) return { name: 'Goal', number: null };

  const next = turnpoints[nextIndex];
  return { name: next?.name ?? '—', number: next?.number ?? null };
}

export function getNextTurnpointName(
  legIndex: number,
  finished: boolean,
  hasStarted: boolean,
  route: OptimizedRoute,
): string {
  return getNextTurnpoint(legIndex, finished, hasStarted, route).name;
}

export function formatNextTurnpointLabel(name: string, number: number | null | undefined): string {
  if (!name || name === '—') return '—';
  if (name === 'Goal') return 'Goal';
  if (number != null && Number.isFinite(number)) return `${number} ${name}`;
  return name;
}

export function findLastPointIndexAtOrBefore(points: EnrichedTrackPoint[], timeMs: number): number {
  if (points.length === 0) return 0;
  if (timeMs < points[0].timeMs) return 0;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (points[mid].timeMs <= timeMs) lo = mid;
    else hi = mid - 1;
  }

  return lo;
}

/**
 * Maximal task progress the pilot has achieved at or before `time`, with the display
 * altitude from the point where that max was last reached. Both are prefix values derived
 * at load, so this is a lookup rather than a scan.
 */
export function getPilotMaxProgressAtTime(
  track: EnrichedFlightTrack,
  time: Date,
): { taskPercent: number; alt: number } | null {
  if (track.points.length === 0) return null;

  const timeMs = time.getTime();
  if (timeMs < track.points[0].timeMs) return null;

  const state = track.points[findLastPointIndexAtOrBefore(track.points, timeMs)];
  if (state.maxTaskPercentSoFar < 0) return null;

  return {
    taskPercent: state.maxTaskPercentSoFar,
    alt: state.altAtMaxTaskPercentSoFar,
  };
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
  hasStarted: boolean;
  finished: boolean;
  nextTurnpointName: string;
  nextTurnpointNumber: number | null;
} | null {
  if (track.points.length === 0) return null;

  const points = track.points;
  const t = time.getTime();
  const stateIndex = findLastPointIndexAtOrBefore(points, t);
  const state = points[stateIndex];

  // Every value below is interpolated from data derived at load; playback does no geometry.
  let lat = state.lat;
  let lon = state.lon;
  let alt = state.displayAlt;
  let taskPercent = state.taskPercent;

  const next = points[stateIndex + 1];
  if (next !== undefined && t > state.timeMs && t <= next.timeMs) {
    const span = next.timeMs - state.timeMs;
    const ratio = span === 0 ? 0 : (t - state.timeMs) / span;
    lat = state.lat + (next.lat - state.lat) * ratio;
    lon = state.lon + (next.lon - state.lon) * ratio;
    alt = state.displayAlt + (next.displayAlt - state.displayAlt) * ratio;
    taskPercent = state.taskPercent + (next.taskPercent - state.taskPercent) * ratio;
  }

  const nextTurnpoint = getNextTurnpoint(
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
    hasStarted: state.hasStarted,
    finished: state.finished,
    nextTurnpointName: nextTurnpoint.name,
    nextTurnpointNumber: nextTurnpoint.number,
  };
}

/**
 * First track time at or after task start when the pilot reached `targetPercent`. Binary
 * search over the prefix max derived at load.
 */
export function findFirstTimePilotReachedTaskPercent(
  track: EnrichedFlightTrack,
  taskStart: Date,
  targetPercent: number,
): Date | null {
  const taskStartMs = taskStart.getTime();
  const target = Math.min(100, Math.max(0, targetPercent));
  if (target <= 0) return new Date(taskStartMs);

  const points = track.points;
  if (points.length === 0) return null;
  if (points[points.length - 1].maxTaskPercentSoFar < target - 0.001) return null;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].maxTaskPercentSoFar >= target - 0.001) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const point = points[lo];
  return point.timeMs < taskStartMs ? new Date(taskStartMs) : point.time;
}

export function resolveSeekTimeForTaskPercent(
  targetPercent: number,
  taskStart: Date,
  timeline: TaskFieldTimeline,
  allTracks: EnrichedFlightTrack[],
  focusTrackId: string | null,
): Date | null {
  if (focusTrackId) {
    const track = allTracks.find((entry) => entry.id === focusTrackId);
    if (!track) return null;
    return findFirstTimePilotReachedTaskPercent(track, taskStart, targetPercent);
  }

  return findFirstTimeFieldReachedPercent(timeline, targetPercent);
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
  const enriched = tracks.map((track) => enrichTrackWithTaskProgress(track, task, route, taskStart));
  return attachLegTimingsToTracks(enriched, route, taskStart);
}
