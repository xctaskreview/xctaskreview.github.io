import type { LatLon, OptimizedRoute, TrackPoint, XcTask } from './types';
import {
  clampDisplayAltitudeMeters,
  createLocalProjection,
  estimateLaunchAltitudeMetersFromTracks,
  formatDuration,
  getTrackEndTime,
  haversine,
  isFlyingAltitudeMeters,
  isLandedAtTime,
} from './geo';
import { attachLegTimingsToTracks, type PilotLegTiming } from './legStatistics';
import {
  circlingDetectionFromPreferences,
  computeFlyingModeTimeline,
  type CirclingDetectionSettings,
  type FlyingModeTimeline,
} from './flyingMode';
import { createDefaultPreferences, type CirclingDetectionPreferences } from './preferences';
import { extractPilotDisplayName, parseGliderTypeFromHeader, pilotFirstName } from './igc';
import { findFirstTimeFieldReachedPercent, type TaskFieldTimeline } from './taskTimeline';
import { computePilotTaskVerification, type PilotTaskVerification } from './taskVerification';
import {
  buildPilotNextTurnpointMilestones,
  lookupPilotNextTurnpointTarget,
  type NextTurnpointMilestone,
} from './nextTurnpoint';
import { progressLegStartPoint } from './taskMapStyle';

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
  /** Fleet launch level derived from early fixes; used before a pilot's log begins. */
  launchAltitudeM?: number | null;
  /** Per-second circling vs glide metrics for the full track. */
  flyingModeTimeline: FlyingModeTimeline;
  /** GAP-oriented turnpoint crossings, start/ESS/goal times, and log warnings. */
  verification: PilotTaskVerification;
  /** Precomputed next TP milestones (SSS exit / TP enters), monotonic forward only. */
  nextTurnpointMilestones: NextTurnpointMilestone[];
  /** Task start gate used for next-TP lookup (ms since epoch). */
  taskStartMs?: number;
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
  const legStart = progressLegStartPoint(route, legIndex) ?? progressPoints[legIndex];
  const legEnd = progressPoints[legIndex + 1] ?? legStart;
  const legFraction = progressOnOptimizedLeg(
    position,
    legStart,
    legEnd,
    legLength,
    legStart,
  );

  const distanceAlong = finishedDistance + legFraction * legLength;
  return Math.max(0, Math.min(100, (distanceAlong / progressTotalDistance) * 100));
}

/** Horizontal position on the task-progress chart follows route geometry, not the goal “finished” shortcut to 100%. */
export function chartTaskPercentAtSnapshot(
  snapshot: {
    lat: number;
    lon: number;
    legIndex: number;
    hasStarted: boolean;
  },
  route: OptimizedRoute,
): number {
  if (!snapshot.hasStarted) return 0;
  return computeTaskPercentForLeg(
    { lat: snapshot.lat, lon: snapshot.lon },
    snapshot.legIndex,
    false,
    true,
    route,
  );
}

/** Prefix max task % can jump to 100 when the goal is tagged; chart markers stay on geographic progress until then. */
export function chartMaxTaskPercentForDisplay(
  liveChartPercent: number,
  prefixMaxTaskPercent: number,
): number {
  if (prefixMaxTaskPercent >= 100 && liveChartPercent < 100) {
    return liveChartPercent;
  }
  return Math.max(prefixMaxTaskPercent, liveChartPercent);
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
  circlingDetection?: CirclingDetectionSettings,
): EnrichedFlightTrack {
  const referenceDate = track.date ?? track.points[0]?.time ?? new Date();
  const taskStartMs = taskStart?.getTime();
  const { verification, pointStates } = computePilotTaskVerification(
    track.points,
    task,
    route,
    referenceDate,
    taskStartMs,
  );

  const enrichedPoints: EnrichedTrackPoint[] = track.points.map((point, index) => {
    const state = pointStates[index];
    const taskPercent = computeTaskPercentForLeg(
      point,
      state.legIndex,
      state.finished,
      state.hasStarted,
      route,
    );

    return {
      ...point,
      legIndex: state.legIndex,
      hasStarted: state.hasStarted,
      finished: state.finished,
      taskPercent,
      timeMs: point.time.getTime(),
      displayAlt: 0,
      cumulativeDistanceM: 0,
      maxTaskPercentSoFar: 0,
      altAtMaxTaskPercentSoFar: 0,
    };
  });

  attachPlaybackFieldsToPoints(enrichedPoints, verification.deadline?.getTime());

  const displayPilotName = extractPilotDisplayName(track);
  const flyingModeDetection =
    circlingDetection ?? circlingDetectionFromPreferences(createDefaultPreferences());

  const finishTime = verification.goalCrossTime ?? verification.essCrossTime ?? undefined;
  const nextTurnpointMilestones = buildPilotNextTurnpointMilestones(
    verification,
    route,
    taskStartMs,
  );

  return {
    id: track.id,
    pilotName: displayPilotName,
    firstName: pilotFirstName(displayPilotName),
    fileName: track.fileName,
    points: enrichedPoints,
    date: track.date,
    finishTime,
    landingTime: track.landingTime ?? getTrackEndTime(track.points),
    gliderType: track.gliderType ?? parseGliderTypeFromHeader(track.igcHeader ?? ''),
    igcHeader: track.igcHeader,
    flyingModeTimeline: computeFlyingModeTimeline(enrichedPoints, flyingModeDetection),
    verification,
    nextTurnpointMilestones,
    taskStartMs,
  };
}

/**
 * Single pass filling the values playback reads every frame. Display altitude carries the
 * last usable reading forward, matching what a per-frame backward scan used to resolve.
 */
function attachPlaybackFieldsToPoints(points: EnrichedTrackPoint[], deadlineMs?: number): void {
  let lastFlyingDisplayAlt: number | null = null;
  let cumulativeDistanceM = 0;
  let maxTaskPercentSoFar = -1;
  let altAtMaxTaskPercentSoFar = 0;
  let frozenMaxPercent = false;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    if (deadlineMs !== undefined && point.timeMs > deadlineMs) {
      frozenMaxPercent = true;
    }

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

    if (!frozenMaxPercent && point.taskPercent >= maxTaskPercentSoFar) {
      maxTaskPercentSoFar = point.taskPercent;
      altAtMaxTaskPercentSoFar = point.displayAlt;
    }
    point.maxTaskPercentSoFar = maxTaskPercentSoFar;
    point.altAtMaxTaskPercentSoFar = altAtMaxTaskPercentSoFar;
  }
}

function nextTurnpointFieldsAtTime(
  track: EnrichedFlightTrack,
  route: OptimizedRoute,
  timeMs: number,
): { nextTurnpointName: string; nextTurnpointNumber: number | null; nextTurnpointRadiusM: number | null } {
  const target = lookupPilotNextTurnpointTarget(
    track.nextTurnpointMilestones,
    route,
    track.taskStartMs,
    timeMs,
  );
  if (!target) {
    return { nextTurnpointName: '—', nextTurnpointNumber: null, nextTurnpointRadiusM: null };
  }
  return {
    nextTurnpointName: target.name,
    nextTurnpointNumber: target.number,
    nextTurnpointRadiusM: target.radiusM,
  };
}

export function formatTurnpointRadiusParenthetical(radiusM: number | null | undefined): string {
  if (radiusM == null || !Number.isFinite(radiusM) || radiusM <= 0) return '';
  return ` (${Math.round(radiusM)} m)`;
}

export function formatNextTurnpointLabel(name: string, number: number | null | undefined): string {
  if (!name || name === '—') return '—';
  if (name === 'Goal') return 'Goal';
  if (number != null && Number.isFinite(number)) return `${number} ${name}`;
  return name;
}

export function formatNextTurnpointDisplay(
  name: string,
  number: number | null | undefined,
  radiusM: number | null | undefined,
): string {
  return formatNextTurnpointLabel(name, number) + formatTurnpointRadiusParenthetical(radiusM);
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
  nextTurnpointRadiusM: number | null;
} | null {
  if (track.points.length === 0) return null;

  const points = track.points;
  const t = time.getTime();

  if (t < points[0]!.timeMs) {
    const first = points[0]!;
    const launchAlt = track.launchAltitudeM ?? first.displayAlt;
    const nextFields = nextTurnpointFieldsAtTime(track, route, t);
    return {
      lat: first.lat,
      lon: first.lon,
      alt: launchAlt,
      taskPercent: 0,
      legIndex: first.legIndex,
      landed: false,
      hasStarted: false,
      finished: false,
      ...nextFields,
    };
  }

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

  const nextFields = nextTurnpointFieldsAtTime(track, route, t);

  return {
    lat,
    lon,
    alt,
    taskPercent,
    legIndex: state.legIndex,
    landed: isLandedAtTime(track.landingTime ?? getTrackEndTime(track.points), time),
    hasStarted: state.hasStarted,
    finished: state.finished,
    ...nextFields,
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
  preferences?: CirclingDetectionPreferences,
): EnrichedFlightTrack[] {
  const launchAltitudeM = estimateLaunchAltitudeMetersFromTracks(tracks);
  const circlingDetection = preferences
    ? circlingDetectionFromPreferences({
        ...createDefaultPreferences(),
        ...preferences,
      })
    : circlingDetectionFromPreferences(createDefaultPreferences());
  const enriched = tracks.map((track) => {
    const entry = enrichTrackWithTaskProgress(track, task, route, taskStart, circlingDetection);
    return launchAltitudeM == null ? entry : { ...entry, launchAltitudeM };
  });
  return attachLegTimingsToTracks(enriched, route, taskStart);
}

/** First SSS exit (start gate crossing) from enriched track points. */
export function getPilotSssExitTime(track: EnrichedFlightTrack): Date | undefined {
  return track.points.find((point) => point.hasStarted)?.time;
}

/** Whole seconds: start gate minus SSS exit (negative = crossed after the gate). */
export function getPilotSssCrossDelaySec(track: EnrichedFlightTrack, taskStart: Date): number | null {
  const crossTime = track.verification.sssCrossTime;
  if (!crossTime) return null;
  const gateTime = track.verification.assignedStartGateTime ?? taskStart;
  return Math.round((gateTime.getTime() - crossTime.getTime()) / 1000);
}

/** MM:SS offset from start gate; minus = after gate (e.g. -01:23). */
export function formatSssCrossDelaySec(gateMinusCrossSec: number): string {
  if (gateMinusCrossSec === 0) return '00:00';
  if (gateMinusCrossSec < 0) {
    return `-${formatDuration(Math.abs(gateMinusCrossSec) * 1000)}`;
  }
  return `+${formatDuration(gateMinusCrossSec * 1000)}`;
}
