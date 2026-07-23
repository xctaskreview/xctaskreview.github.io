import { clampChartAltitudeDisplay, clampDisplayAltitudeMeters, haversine } from './geo';
import type { EnrichedFlightTrack } from './taskProgress';
import { getTrackSnapshotAtTime } from './taskProgress';
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
}

export interface PilotChartTrailPoint {
  taskDistance: number;
  altitude: number;
}

function findLastPointIndexAtOrBefore(points: EnrichedFlightTrack['points'], timeMs: number): number {
  if (points.length === 0) return 0;

  let lo = 0;
  let hi = points.length - 1;

  if (timeMs < points[0].time.getTime()) {
    return 0;
  }

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (points[mid].time.getTime() <= timeMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}

function getInterpolatedPosition(
  track: EnrichedFlightTrack,
  timeMs: number,
): { lat: number; lon: number; pointIndex: number } | null {
  const points = track.points;
  if (points.length === 0 || timeMs < points[0].time.getTime()) {
    return null;
  }

  const stateIndex = findLastPointIndexAtOrBefore(points, timeMs);
  let lat = points[stateIndex].lat;
  let lon = points[stateIndex].lon;

  const nextIndex = stateIndex + 1;
  if (nextIndex < points.length) {
    const a = points[stateIndex];
    const b = points[nextIndex];
    const ta = a.time.getTime();
    const tb = b.time.getTime();
    if (timeMs >= ta && timeMs <= tb && tb !== ta) {
      const ratio = (timeMs - ta) / (tb - ta);
      lat = a.lat + (b.lat - a.lat) * ratio;
      lon = a.lon + (b.lon - a.lon) * ratio;
    }
  }

  const last = points[points.length - 1];
  if (timeMs >= last.time.getTime()) {
    lat = last.lat;
    lon = last.lon;
  }

  return { lat, lon, pointIndex: stateIndex };
}

export function buildPilotTrailVertices(
  track: EnrichedFlightTrack,
  time: Date,
  maxLengthMeters: number,
  route: OptimizedRoute,
): PilotTrailVertex[] {
  const trailLengthM = normalizePilotTrailLengthM(maxLengthMeters);
  if (trailLengthM <= 0) {
    return [];
  }

  const snapshot = getTrackSnapshotAtTime(track, time, route);
  if (!snapshot) {
    return [];
  }

  const position = getInterpolatedPosition(track, time.getTime());
  if (!position) {
    return [];
  }

  const points = track.points;
  const trail: PilotTrailVertex[] = [
    {
      lat: position.lat,
      lon: position.lon,
      alt: clampDisplayAltitudeMeters(snapshot.alt),
      taskPercent: snapshot.taskPercent,
    },
  ];

  let remaining = trailLengthM;
  let segEndLat = position.lat;
  let segEndLon = position.lon;
  let segEndAlt = trail[0].alt;
  let segEndTaskPercent = snapshot.taskPercent;
  let index = position.pointIndex;

  while (remaining > 0 && index >= 0) {
    const segStart = points[index];
    const segStartAlt = clampDisplayAltitudeMeters(segStart.alt);
    const segmentDistance = haversine({ lat: segEndLat, lon: segEndLon }, segStart);

    if (segmentDistance <= 0) {
      index -= 1;
      if (index >= 0) {
        segEndLat = points[index].lat;
        segEndLon = points[index].lon;
        segEndAlt = clampDisplayAltitudeMeters(points[index].alt);
        segEndTaskPercent = points[index].taskPercent;
      }
      continue;
    }

    if (segmentDistance >= remaining) {
      const fraction = remaining / segmentDistance;
      trail.unshift({
        lat: segEndLat + (segStart.lat - segEndLat) * fraction,
        lon: segEndLon + (segStart.lon - segEndLon) * fraction,
        alt: segEndAlt + (segStartAlt - segEndAlt) * fraction,
        taskPercent: segEndTaskPercent + (segStart.taskPercent - segEndTaskPercent) * fraction,
      });
      break;
    }

    remaining -= segmentDistance;
    trail.unshift({
      lat: segStart.lat,
      lon: segStart.lon,
      alt: segStartAlt,
      taskPercent: segStart.taskPercent,
    });
    segEndLat = segStart.lat;
    segEndLon = segStart.lon;
    segEndAlt = segStartAlt;
    segEndTaskPercent = segStart.taskPercent;
    index -= 1;
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
  return buildPilotTrailVertices(track, time, maxLengthMeters, route).map((vertex) => ({
    taskDistance: kmToDistanceUnit((vertex.taskPercent / 100) * taskDistanceKm, distanceUnit),
    altitude: clampChartAltitudeDisplay(
      metersToAltitudeUnit(vertex.alt, altitudeUnit),
      altitudeMin,
      altitudeMax,
    ),
  }));
}
