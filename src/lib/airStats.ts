import {
  clampDisplayAltitudeMeters,
  createLocalProjection,
  haversine,
  interpolateTrackPoint,
  isLandedAtTime,
} from './geo';
import type { EnrichedFlightTrack } from './taskProgress';
import { getTrackSnapshotAtTime } from './taskProgress';
import type { OptimizedRoute, TrackPoint } from './types';

const THERMAL_MIN_CLIMB_MPS = 0.5;
const THERMAL_MIN_DURATION_S = 20;
const THERMAL_LOOKBACK_MS = 45 * 60 * 1000;
const GLIDE_MAX_CLIMB_MPS = 0.3;
const GLIDE_MIN_SINK_MPS = -4;
const MIN_GROUND_SPEED_MPS = 4;
const MIN_GLIDE_DURATION_S = 15;
const ASSUMED_AIRSPEED_MPS = 9;
const WIND_LOOKBACK_MS = 30 * 60 * 1000;
const THERMAL_CLUSTER_RADIUS_M = 800;
const THERMAL_RADIUS_SCALE_M = 120;
const WIND_GRID_SPACING_M = 2500;
const WIND_GRID_HALF_SIZE = 2;

export interface ThermalOverlaySample {
  lat: number;
  lon: number;
  strengthMps: number;
  radiusM: number;
}

export interface WindOverlaySample {
  lat: number;
  lon: number;
  directionDeg: number;
  speedMps: number;
}

export interface TrackAirStats {
  thermalStrengthMps: number;
  windDirectionDeg: number;
  windSpeedMps: number;
  thermals: ThermalOverlaySample[];
}

export interface GeneralAirStats {
  centerLat: number;
  centerLon: number;
  thermalStrengthMps: number;
  windDirectionDeg: number;
  windSpeedMps: number;
  thermals: ThermalOverlaySample[];
  windArrows: WindOverlaySample[];
}

interface ThermalSegment {
  startMs: number;
  endMs: number;
  strengthMps: number;
  lat: number;
  lon: number;
}

interface WindSample {
  eastMps: number;
  northMps: number;
}

function findLastPointIndexAtOrBefore(points: TrackPoint[], timeMs: number): number {
  if (points.length === 0) return -1;
  if (timeMs < points[0].time.getTime()) return 0;

  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (points[mid].time.getTime() <= timeMs) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

function verticalSpeedMps(a: TrackPoint, b: TrackPoint): number {
  const dt = (b.time.getTime() - a.time.getTime()) / 1000;
  if (dt <= 0) return 0;
  return (clampDisplayAltitudeMeters(b.alt) - clampDisplayAltitudeMeters(a.alt)) / dt;
}

function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function vectorFromBearing(speedMps: number, directionDeg: number): { eastMps: number; northMps: number } {
  const radians = (directionDeg * Math.PI) / 180;
  return {
    eastMps: speedMps * Math.sin(radians),
    northMps: speedMps * Math.cos(radians),
  };
}

function vectorToBearing(eastMps: number, northMps: number): { directionDeg: number; speedMps: number } {
  const speedMps = Math.hypot(eastMps, northMps);
  if (speedMps <= 0.01) {
    return { directionDeg: 0, speedMps: 0 };
  }
  return {
    directionDeg: ((Math.atan2(eastMps, northMps) * 180) / Math.PI + 360) % 360,
    speedMps,
  };
}

function averageVector(samples: WindSample[]): WindSample | null {
  if (samples.length === 0) return null;
  const eastMps = samples.reduce((sum, sample) => sum + sample.eastMps, 0) / samples.length;
  const northMps = samples.reduce((sum, sample) => sum + sample.northMps, 0) / samples.length;
  if (Math.hypot(eastMps, northMps) < 0.05) return null;
  return { eastMps, northMps };
}

function detectThermalSegments(points: TrackPoint[], endTimeMs: number, startTimeMs: number): ThermalSegment[] {
  if (points.length < 2) return [];

  const endIndex = findLastPointIndexAtOrBefore(points, endTimeMs);
  if (endIndex <= 0) return [];

  const segments: ThermalSegment[] = [];
  let segmentStartIndex = -1;
  let segmentStartMs = 0;
  let climbSum = 0;
  let climbCount = 0;
  let latSum = 0;
  let lonSum = 0;
  let pointCount = 0;

  for (let index = 1; index <= endIndex; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const currentMs = current.time.getTime();
    if (currentMs < startTimeMs) continue;

    const climb = verticalSpeedMps(previous, current);
    const inThermal = climb >= THERMAL_MIN_CLIMB_MPS;

    if (inThermal) {
      if (segmentStartIndex < 0) {
        segmentStartIndex = index - 1;
        segmentStartMs = previous.time.getTime();
        climbSum = 0;
        climbCount = 0;
        latSum = 0;
        lonSum = 0;
        pointCount = 0;
      }
      climbSum += climb;
      climbCount += 1;
      latSum += current.lat;
      lonSum += current.lon;
      pointCount += 1;
      continue;
    }

    if (segmentStartIndex >= 0) {
      const durationS = (current.time.getTime() - segmentStartMs) / 1000;
      if (durationS >= THERMAL_MIN_DURATION_S && climbCount > 0) {
        segments.push({
          startMs: segmentStartMs,
          endMs: current.time.getTime(),
          strengthMps: climbSum / climbCount,
          lat: latSum / pointCount,
          lon: lonSum / pointCount,
        });
      }
      segmentStartIndex = -1;
    }
  }

  if (segmentStartIndex >= 0) {
    const last = points[endIndex];
    const durationS = (last.time.getTime() - segmentStartMs) / 1000;
    if (durationS >= THERMAL_MIN_DURATION_S && climbCount > 0) {
      segments.push({
        startMs: segmentStartMs,
        endMs: last.time.getTime(),
        strengthMps: climbSum / climbCount,
        lat: latSum / pointCount,
        lon: lonSum / pointCount,
      });
    }
  }

  return segments;
}

function estimateWindSamples(points: TrackPoint[], endTimeMs: number, startTimeMs: number): WindSample[] {
  if (points.length < 2) return [];

  const endIndex = findLastPointIndexAtOrBefore(points, endTimeMs);
  if (endIndex <= 0) return [];

  const samples: WindSample[] = [];
  let segmentStartIndex = -1;

  for (let index = 1; index <= endIndex; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const currentMs = current.time.getTime();
    if (currentMs < startTimeMs) continue;

    const climb = verticalSpeedMps(previous, current);
    const dt = (current.time.getTime() - previous.time.getTime()) / 1000;
    const groundSpeed = dt > 0 ? haversine(previous, current) / dt : 0;
    const inGlide =
      climb <= GLIDE_MAX_CLIMB_MPS &&
      climb >= GLIDE_MIN_SINK_MPS &&
      groundSpeed >= MIN_GROUND_SPEED_MPS;

    if (inGlide) {
      if (segmentStartIndex < 0) {
        segmentStartIndex = index - 1;
      }
      continue;
    }

    if (segmentStartIndex >= 0) {
      const start = points[segmentStartIndex];
      const end = previous;
      const durationS = (end.time.getTime() - start.time.getTime()) / 1000;
      if (durationS >= MIN_GLIDE_DURATION_S) {
        const groundSpeedMps = haversine(start, end) / durationS;
        const headingDeg = bearingDeg(start, end);
        const ground = vectorFromBearing(groundSpeedMps, headingDeg);
        const air = vectorFromBearing(ASSUMED_AIRSPEED_MPS, headingDeg);
        samples.push({
          eastMps: ground.eastMps - air.eastMps,
          northMps: ground.northMps - air.northMps,
        });
      }
      segmentStartIndex = -1;
    }
  }

  return samples;
}

function thermalToOverlay(segment: ThermalSegment): ThermalOverlaySample {
  return {
    lat: segment.lat,
    lon: segment.lon,
    strengthMps: segment.strengthMps,
    radiusM: Math.max(400, segment.strengthMps * THERMAL_RADIUS_SCALE_M),
  };
}

function clusterThermals(thermals: ThermalOverlaySample[]): ThermalOverlaySample[] {
  const clusters: ThermalOverlaySample[] = [];

  for (const thermal of thermals) {
    const existing = clusters.find(
      (cluster) => haversine(cluster, thermal) <= THERMAL_CLUSTER_RADIUS_M,
    );
    if (!existing) {
      clusters.push({ ...thermal });
      continue;
    }

    const weight = existing.strengthMps + thermal.strengthMps;
    existing.lat = (existing.lat * existing.strengthMps + thermal.lat * thermal.strengthMps) / weight;
    existing.lon = (existing.lon * existing.strengthMps + thermal.lon * thermal.strengthMps) / weight;
    existing.strengthMps = Math.max(existing.strengthMps, thermal.strengthMps);
    existing.radiusM = Math.max(existing.radiusM, thermal.radiusM);
  }

  return clusters.sort((a, b) => b.strengthMps - a.strengthMps).slice(0, 12);
}

function buildWindGrid(centerLat: number, centerLon: number, wind: WindSample | null): WindOverlaySample[] {
  if (!wind) return [];

  const { directionDeg, speedMps } = vectorToBearing(wind.eastMps, wind.northMps);
  if (speedMps < 0.2) return [];

  const projection = createLocalProjection({ lat: centerLat, lon: centerLon });
  const arrows: WindOverlaySample[] = [];

  for (let row = -WIND_GRID_HALF_SIZE; row <= WIND_GRID_HALF_SIZE; row += 1) {
    for (let col = -WIND_GRID_HALF_SIZE; col <= WIND_GRID_HALF_SIZE; col += 1) {
      const point = projection.toLatLon(col * WIND_GRID_SPACING_M, row * WIND_GRID_SPACING_M);
      arrows.push({
        lat: point.lat,
        lon: point.lon,
        directionDeg,
        speedMps,
      });
    }
  }

  return arrows;
}

export function computeTrackAirStats(points: TrackPoint[], currentTime: Date): TrackAirStats {
  const endTimeMs = currentTime.getTime();
  const thermalStartMs = endTimeMs - THERMAL_LOOKBACK_MS;
  const windStartMs = endTimeMs - WIND_LOOKBACK_MS;

  const segments = detectThermalSegments(points, endTimeMs, thermalStartMs);
  const thermalStrengthMps =
    segments.length === 0
      ? 0
      : segments.reduce((sum, segment) => sum + segment.strengthMps, 0) / segments.length;

  const windSamples = estimateWindSamples(points, endTimeMs, windStartMs);
  const averageWind = averageVector(windSamples);
  const { directionDeg: windDirectionDeg, speedMps: windSpeedMps } = averageWind
    ? vectorToBearing(averageWind.eastMps, averageWind.northMps)
    : { directionDeg: 0, speedMps: 0 };

  return {
    thermalStrengthMps,
    windDirectionDeg,
    windSpeedMps,
    thermals: segments.map(thermalToOverlay),
  };
}

export function computeGeneralAirStats(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  currentTime: Date,
): GeneralAirStats | null {
  const activePositions: { lat: number; lon: number }[] = [];
  const thermalStrengths: number[] = [];
  const windSamples: WindSample[] = [];
  const thermals: ThermalOverlaySample[] = [];

  for (const track of tracks) {
    const snapshot = getTrackSnapshotAtTime(track, currentTime, route);
    if (!snapshot || snapshot.landed) continue;

    const position = interpolateTrackPoint(track.points, currentTime);
    if (position) {
      activePositions.push({ lat: position.lat, lon: position.lon });
    }

    if (isLandedAtTime(track.landingTime, currentTime)) continue;

    const stats = computeTrackAirStats(track.points, currentTime);
    if (stats.thermalStrengthMps > 0) {
      thermalStrengths.push(stats.thermalStrengthMps);
    }
    if (stats.windSpeedMps > 0.2) {
      windSamples.push(vectorFromBearing(stats.windSpeedMps, stats.windDirectionDeg));
    }
    thermals.push(...stats.thermals);
  }

  if (activePositions.length === 0) {
    return null;
  }

  const centerLat = activePositions.reduce((sum, point) => sum + point.lat, 0) / activePositions.length;
  const centerLon = activePositions.reduce((sum, point) => sum + point.lon, 0) / activePositions.length;
  const averageWind = averageVector(windSamples);
  const { directionDeg: windDirectionDeg, speedMps: windSpeedMps } = averageWind
    ? vectorToBearing(averageWind.eastMps, averageWind.northMps)
    : { directionDeg: 0, speedMps: 0 };

  return {
    centerLat,
    centerLon,
    thermalStrengthMps:
      thermalStrengths.length === 0
        ? 0
        : thermalStrengths.reduce((sum, value) => sum + value, 0) / thermalStrengths.length,
    windDirectionDeg,
    windSpeedMps,
    thermals: clusterThermals(thermals),
    windArrows: buildWindGrid(centerLat, centerLon, averageWind),
  };
}
