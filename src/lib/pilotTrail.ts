import { clampChartTaskDistanceDisplay } from './chartAltitude';
import { clampChartAltitudeDisplay, haversine } from './geo';
import type { EnrichedFlightTrack } from './taskProgress';
import { findLastPointIndexAtOrBefore, getTrackSnapshotAtTime } from './taskProgress';
import {
  kmToDistanceUnit,
  metersToAltitudeUnit,
  normalizePilotTrailLengthM,
  type AltitudeUnit,
  type DistanceUnit,
} from './preferences';
import type { OptimizedRoute } from './types';

export interface PilotTrailVertex {
  lat: number;
  lon: number;
  alt: number;
  taskPercent: number;
  timeMs: number;
}

export interface PilotChartTrailPoint {
  taskDistance: number;
  altitude: number;
}

export const PILOT_PATH_PAST_OPACITY = 0.92;
export const PILOT_PATH_FUTURE_OPACITY = 0.38;

/**
 * Points per rendered full-path chunk. Chunk geometry is built once, so a frame only
 * rebuilds the one chunk holding the past/future boundary instead of the whole track.
 */
export const PATH_CHUNK_SIZE = 512;

/** Beyond this many forward steps a cursor walk is slower than a fresh binary search. */
const PATH_CURSOR_MAX_WALK = 64;

/** Geometry of a pilot's whole track, built once per selection and reused every frame. */
export interface PilotFullPathGeometry {
  trackId: string;
  pointCount: number;
  latLngs: [number, number][];
  timesMs: Float64Array;
}

export function buildPilotFullPathGeometry(track: EnrichedFlightTrack): PilotFullPathGeometry {
  const points = track.points;
  const latLngs: [number, number][] = new Array(points.length);
  const timesMs = new Float64Array(points.length);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    latLngs[index] = [point.lat, point.lon];
    timesMs[index] = point.timeMs;
  }

  return { trackId: track.id, pointCount: points.length, latLngs, timesMs };
}

/** Chart-space geometry of a pilot's whole track in current display units. */
export interface PilotChartPathGeometry {
  trackId: string;
  pointCount: number;
  points: PilotChartTrailPoint[];
  timesMs: Float64Array;
}

export function toChartPathPoint(
  taskPercent: number,
  altMeters: number,
  taskDistanceKm: number,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  altitudeMin: number,
  altitudeMax: number,
): PilotChartTrailPoint {
  return {
    taskDistance: clampChartTaskDistanceDisplay(
      kmToDistanceUnit((taskPercent / 100) * taskDistanceKm, distanceUnit),
      kmToDistanceUnit(taskDistanceKm, distanceUnit),
    ),
    altitude: clampChartAltitudeDisplay(
      metersToAltitudeUnit(altMeters, altitudeUnit),
      altitudeMin,
      altitudeMax,
    ),
  };
}

export function buildPilotChartFullPathGeometry(
  track: EnrichedFlightTrack,
  taskDistanceKm: number,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  altitudeMin: number,
  altitudeMax: number,
): PilotChartPathGeometry {
  const trackPoints = track.points;
  const maxDistanceDisplay = kmToDistanceUnit(taskDistanceKm, distanceUnit);
  const points: PilotChartTrailPoint[] = new Array(trackPoints.length);
  const timesMs = new Float64Array(trackPoints.length);

  for (let index = 0; index < trackPoints.length; index += 1) {
    const point = trackPoints[index];
    points[index] = {
      taskDistance: clampChartTaskDistanceDisplay(
        kmToDistanceUnit((point.taskPercent / 100) * taskDistanceKm, distanceUnit),
        maxDistanceDisplay,
      ),
      altitude: clampChartAltitudeDisplay(
        metersToAltitudeUnit(point.displayAlt, altitudeUnit),
        altitudeMin,
        altitudeMax,
      ),
    };
    timesMs[index] = point.timeMs;
  }

  return { trackId: track.id, pointCount: trackPoints.length, points, timesMs };
}

/**
 * Index of the last point at or before `timeMs`, or -1 when `timeMs` precedes the track.
 * Walks forward from `hintIndex` during playback and falls back to binary search on seeks.
 */
export function findPathIndexAtOrBefore(
  timesMs: Float64Array,
  timeMs: number,
  hintIndex: number,
): number {
  const count = timesMs.length;
  if (count === 0) return -1;
  if (timeMs < timesMs[0]) return -1;
  if (timeMs >= timesMs[count - 1]) return count - 1;

  if (hintIndex >= 0 && hintIndex < count && timesMs[hintIndex] <= timeMs) {
    let index = hintIndex;
    let steps = 0;
    while (index + 1 < count && timesMs[index + 1] <= timeMs) {
      index += 1;
      steps += 1;
      if (steps >= PATH_CURSOR_MAX_WALK) {
        return binarySearchPathIndex(timesMs, timeMs, index, count - 1);
      }
    }
    return index;
  }

  return binarySearchPathIndex(timesMs, timeMs, 0, count - 1);
}

function binarySearchPathIndex(
  timesMs: Float64Array,
  timeMs: number,
  low: number,
  high: number,
): number {
  let lo = low;
  let hi = high;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (timesMs[mid] <= timeMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}

/** Chunks span `[start, end]` inclusive and share an endpoint so segments stay connected. */
export function pathChunkCount(pointCount: number): number {
  if (pointCount < 2) return 0;
  return Math.ceil((pointCount - 1) / PATH_CHUNK_SIZE);
}

export function pathChunkStartIndex(chunkIndex: number): number {
  return chunkIndex * PATH_CHUNK_SIZE;
}

export function pathChunkEndIndex(chunkIndex: number, pointCount: number): number {
  return Math.min((chunkIndex + 1) * PATH_CHUNK_SIZE, pointCount - 1);
}

export function pathChunkIndexForPoint(pointIndex: number, pointCount: number): number {
  const chunks = pathChunkCount(pointCount);
  if (chunks === 0) return -1;
  return Math.min(Math.floor(pointIndex / PATH_CHUNK_SIZE), chunks - 1);
}

function vertexFromPoint(point: EnrichedFlightTrack['points'][number]): PilotTrailVertex {
  return {
    lat: point.lat,
    lon: point.lon,
    alt: point.displayAlt,
    taskPercent: point.taskPercent,
    timeMs: point.timeMs,
  };
}

function lerpVertex(from: PilotTrailVertex, to: PilotTrailVertex, ratio: number): PilotTrailVertex {
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lon: from.lon + (to.lon - from.lon) * ratio,
    alt: from.alt + (to.alt - from.alt) * ratio,
    taskPercent: from.taskPercent + (to.taskPercent - from.taskPercent) * ratio,
    timeMs: from.timeMs + (to.timeMs - from.timeMs) * ratio,
  };
}

/** First index whose distance along the track reaches `distanceM`, searching `[0, maxIndex]`. */
function findFirstIndexAtDistance(
  points: EnrichedFlightTrack['points'],
  distanceM: number,
  maxIndex: number,
): number {
  let lo = 0;
  let hi = maxIndex;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].cumulativeDistanceM >= distanceM) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  return lo;
}

/**
 * Trail covering the last `maxLengthMeters` flown. Distance along the track is precomputed
 * per point, so the tail is found by lookup instead of summing segments every frame.
 */
export function buildPilotTrailVertices(
  track: EnrichedFlightTrack,
  time: Date,
  maxLengthMeters: number,
  route: OptimizedRoute,
): PilotTrailVertex[] {
  const trailLengthM = normalizePilotTrailLengthM(maxLengthMeters);
  if (trailLengthM <= 0) return [];

  const points = track.points;
  const timeMs = time.getTime();
  if (points.length === 0 || timeMs < points[0].timeMs) return [];

  const snapshot = getTrackSnapshotAtTime(track, time, route);
  if (!snapshot) return [];

  const stateIndex = findLastPointIndexAtOrBefore(points, timeMs);
  const state = points[stateIndex];
  const head: PilotTrailVertex = {
    lat: snapshot.lat,
    lon: snapshot.lon,
    alt: snapshot.alt,
    taskPercent: snapshot.taskPercent,
    timeMs,
  };

  const headDistanceM =
    state.cumulativeDistanceM + haversine(state, { lat: head.lat, lon: head.lon });
  const tailDistanceM = headDistanceM - trailLengthM;

  if (tailDistanceM > state.cumulativeDistanceM) {
    const span = headDistanceM - state.cumulativeDistanceM;
    const ratio = span <= 0 ? 0 : (tailDistanceM - state.cumulativeDistanceM) / span;
    return [lerpVertex(vertexFromPoint(state), head, ratio), head];
  }

  const trail: PilotTrailVertex[] = [];
  let firstIndex = 0;

  if (tailDistanceM > 0) {
    firstIndex = findFirstIndexAtDistance(points, tailDistanceM, stateIndex);
    if (firstIndex > 0) {
      const previous = points[firstIndex - 1];
      const span = points[firstIndex].cumulativeDistanceM - previous.cumulativeDistanceM;
      const ratio = span <= 0 ? 0 : (tailDistanceM - previous.cumulativeDistanceM) / span;
      trail.push(
        lerpVertex(vertexFromPoint(previous), vertexFromPoint(points[firstIndex]), ratio),
      );
    }
  }

  for (let index = firstIndex; index <= stateIndex; index += 1) {
    trail.push(vertexFromPoint(points[index]));
  }

  if (head.timeMs > state.timeMs) {
    trail.push(head);
  }

  return trail;
}

export function buildPilotTrailLatLngs(
  track: EnrichedFlightTrack,
  time: Date,
  maxLengthMeters: number,
  route: OptimizedRoute,
): [number, number][] {
  return buildPilotTrailVertices(track, time, maxLengthMeters, route).map((vertex) => [
    vertex.lat,
    vertex.lon,
  ]);
}

/** Remaining track from the live position through the end, for faint “future” overlays. */
export function buildPilotFutureTrailLatLngs(
  geometry: PilotFullPathGeometry,
  track: EnrichedFlightTrack,
  time: Date,
  route: OptimizedRoute,
  cursor: { index: number },
): [number, number][] {
  if (geometry.pointCount < 2) return [];

  const timeMs = time.getTime();
  const index = findPathIndexAtOrBefore(geometry.timesMs, timeMs, cursor.index);
  cursor.index = index;

  const snapshot = getTrackSnapshotAtTime(track, time, route);
  if (!snapshot) return [];

  if (index >= geometry.pointCount - 1) {
    return [];
  }

  const head: [number, number] = [snapshot.lat, snapshot.lon];
  if (index < 0) {
    return [head, ...geometry.latLngs];
  }

  const tail = geometry.latLngs.slice(index + 1);
  if (tail.length === 0) {
    return [head];
  }
  tail.unshift(head);
  return tail;
}

export function buildPilotChartTrailPoints(
  track: EnrichedFlightTrack,
  time: Date,
  maxLengthMeters: number,
  route: OptimizedRoute,
  taskDistanceKm: number,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  altitudeMin: number,
  altitudeMax: number,
): PilotChartTrailPoint[] {
  const maxDistanceDisplay = kmToDistanceUnit(taskDistanceKm, distanceUnit);

  return buildPilotTrailVertices(track, time, maxLengthMeters, route).map((vertex) => ({
    taskDistance: clampChartTaskDistanceDisplay(
      kmToDistanceUnit((vertex.taskPercent / 100) * taskDistanceKm, distanceUnit),
      maxDistanceDisplay,
    ),
    altitude: clampChartAltitudeDisplay(
      metersToAltitudeUnit(vertex.alt, altitudeUnit),
      altitudeMin,
      altitudeMax,
    ),
  }));
}
