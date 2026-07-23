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

function findLastPointIndexAtOrBefore(points: EnrichedTrackPoint[], timeMs: number): number {
  if (points.length === 0) return 0;
  if (timeMs < points[0].time.getTime()) return 0;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (points[mid].time.getTime() <= timeMs) lo = mid;
    else hi = mid - 1;
  }

  return lo;
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
  nextTurnpointName: string;
} | null {
  if (track.points.length === 0) return null;

  const t = time.getTime();
  const stateIndex = findLastPointIndexAtOrBefore(track.points, t);
  const state = track.points[stateIndex];

  let lat = state.lat;
  let lon = state.lon;
  let alt = state.alt;

  if (t > track.points[0].time.getTime()) {
    const nextIndex = stateIndex + 1;
    if (nextIndex < track.points.length) {
      const a = track.points[stateIndex];
      const b = track.points[nextIndex];
      const ta = a.time.getTime();
      const tb = b.time.getTime();
      if (t >= ta && t <= tb) {
        const ratio = tb === ta ? 0 : (t - ta) / (tb - ta);
        lat = a.lat + (b.lat - a.lat) * ratio;
        lon = a.lon + (b.lon - a.lon) * ratio;
        alt = interpolateReasonableAltitude(a.alt, b.alt, ratio);
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
    hasStarted: state.hasStarted,
    nextTurnpointName: getNextTurnpointName(
      state.legIndex,
      state.finished,
      state.hasStarted,
      route,
    ),
  };
}

function findLeaderAtTime(
  tracks: EnrichedFlightTrack[],
  timeMs: number,
  route: OptimizedRoute,
): string | null {
  let leaderId: string | null = null;
  let leaderPercent = -1;

  for (const track of tracks) {
    if (track.points.length === 0 || track.points[0].time.getTime() > timeMs) {
      continue;
    }

    const snapshot = getTrackSnapshotAtTime(track, new Date(timeMs), route);
    if (!snapshot?.hasStarted) continue;

    if (snapshot.taskPercent > leaderPercent) {
      leaderPercent = snapshot.taskPercent;
      leaderId = track.id;
      continue;
    }

    if (
      snapshot.taskPercent === leaderPercent &&
      leaderId !== null &&
      track.id.localeCompare(leaderId) < 0
    ) {
      leaderId = track.id;
    }
  }

  return leaderId;
}

function leadSecondsToPercentages(
  tracks: EnrichedFlightTrack[],
  leadSeconds: Map<string, number>,
  totalSeconds: number,
): Map<string, number> {
  const leadPercentages = new Map<string, number>();
  for (const track of tracks) {
    const seconds = leadSeconds.get(track.id) ?? 0;
    leadPercentages.set(track.id, totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0);
  }
  return leadPercentages;
}

const MAX_LEAD_SAMPLES = 4000;
const MAX_INCREMENTAL_SECONDS = 8;

function sampleLeadSeconds(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
  endTime: Date,
): { leadSeconds: Map<string, number>; totalSeconds: number } {
  const leadSeconds = new Map<string, number>(tracks.map((track) => [track.id, 0]));
  const startMs = taskStart.getTime();
  const endMs = endTime.getTime();
  const totalSeconds = Math.floor((endMs - startMs) / 1000);

  if (totalSeconds <= 0 || tracks.length === 0) {
    return { leadSeconds, totalSeconds };
  }

  const stepSeconds = Math.max(1, Math.ceil(totalSeconds / MAX_LEAD_SAMPLES));

  for (let offset = 0; offset < totalSeconds; offset += stepSeconds) {
    const chunkSeconds = Math.min(stepSeconds, totalSeconds - offset);
    const leaderId = findLeaderAtTime(tracks, startMs + offset * 1000, route);
    if (!leaderId) continue;

    leadSeconds.set(leaderId, (leadSeconds.get(leaderId) ?? 0) + chunkSeconds);
  }

  return { leadSeconds, totalSeconds };
}

export function computeLeadPercentages(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
  endTime: Date,
): Map<string, number> {
  const { leadSeconds, totalSeconds } = sampleLeadSeconds(tracks, route, taskStart, endTime);
  return leadSecondsToPercentages(tracks, leadSeconds, totalSeconds);
}

export function advanceLeadPercentages(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart: Date,
  endTime: Date,
  previousLeadSeconds: Map<string, number>,
  previousEndSecond: number,
): { leadSeconds: Map<string, number>; endSecond: number; leadPercentages: Map<string, number> } {
  const startSecond = Math.floor(taskStart.getTime() / 1000);
  const endSecond = Math.floor(endTime.getTime() / 1000);
  const totalSeconds = endSecond - startSecond + 1;

  if (totalSeconds <= 0 || tracks.length === 0) {
    const empty = new Map<string, number>(tracks.map((track) => [track.id, 0]));
    return {
      leadSeconds: empty,
      endSecond: startSecond - 1,
      leadPercentages: leadSecondsToPercentages(tracks, empty, totalSeconds),
    };
  }

  if (endSecond < previousEndSecond || endSecond - previousEndSecond > MAX_INCREMENTAL_SECONDS) {
    const { leadSeconds } = sampleLeadSeconds(tracks, route, taskStart, endTime);
    return {
      leadSeconds,
      endSecond,
      leadPercentages: leadSecondsToPercentages(tracks, leadSeconds, totalSeconds),
    };
  }

  if (endSecond === previousEndSecond) {
    return {
      leadSeconds: previousLeadSeconds,
      endSecond,
      leadPercentages: leadSecondsToPercentages(tracks, previousLeadSeconds, totalSeconds),
    };
  }

  const leadSeconds = new Map(previousLeadSeconds);
  for (let second = previousEndSecond + 1; second <= endSecond; second += 1) {
    const leaderId = findLeaderAtTime(tracks, second * 1000, route);
    if (!leaderId) continue;
    leadSeconds.set(leaderId, (leadSeconds.get(leaderId) ?? 0) + 1);
  }

  return {
    leadSeconds,
    endSecond,
    leadPercentages: leadSecondsToPercentages(tracks, leadSeconds, totalSeconds),
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
