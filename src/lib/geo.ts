import type { LatLon, TrackPoint } from './types';

const EARTH_RADIUS_M = 6371000;

export function haversine(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function groundSpeedMps(from: LatLon & { time: Date }, to: LatLon & { time: Date }): number {
  const dt = (to.time.getTime() - from.time.getTime()) / 1000;
  if (dt <= 0) return 0;
  return haversine(from, to) / dt;
}

export function getTrackEndTime(points: TrackPoint[]): Date | undefined {
  if (points.length === 0) return undefined;
  return points[points.length - 1].time;
}

export interface LocalProjection {
  origin: LatLon;
  toLocal: (point: LatLon) => { x: number; y: number };
  toLatLon: (x: number, y: number) => LatLon;
}

export function createLocalProjection(origin: LatLon): LocalProjection {
  const latRad = (origin.lat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);

  return {
    origin,
    toLocal(point) {
      const dLat = point.lat - origin.lat;
      const dLon = point.lon - origin.lon;
      return {
        x: dLon * ((Math.PI / 180) * EARTH_RADIUS_M * cosLat),
        y: dLat * ((Math.PI / 180) * EARTH_RADIUS_M),
      };
    },
    toLatLon(x, y) {
      return {
        lat: origin.lat + y / ((Math.PI / 180) * EARTH_RADIUS_M),
        lon: origin.lon + x / ((Math.PI / 180) * EARTH_RADIUS_M * cosLat),
      };
    },
  };
}

export function distancePointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distance: number; t: number; point: { x: number; y: number } } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return {
      distance: Math.hypot(ddx, ddy),
      t: 0,
      point: { x: a.x, y: a.y },
    };
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { distance: Math.hypot(p.x - point.x, p.y - point.y), t, point };
}

export function interpolateTrackPoint(
  points: { time: Date; lat: number; lon: number; alt: number }[],
  time: Date,
): { lat: number; lon: number; alt: number } | null {
  if (points.length === 0) return null;
  const t = time.getTime();
  if (t <= points[0].time.getTime()) {
    return { lat: points[0].lat, lon: points[0].lon, alt: points[0].alt };
  }
  const last = points[points.length - 1];
  if (t >= last.time.getTime()) {
    return { lat: last.lat, lon: last.lon, alt: last.alt };
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ta = a.time.getTime();
    const tb = b.time.getTime();
    if (t >= ta && t <= tb) {
      const ratio = tb === ta ? 0 : (t - ta) / (tb - ta);
      return {
        lat: a.lat + (b.lat - a.lat) * ratio,
        lon: a.lon + (b.lon - a.lon) * ratio,
        alt: interpolateReasonableAltitude(a.alt, b.alt, ratio),
      };
    }
  }

  return null;
}

const SPEED_SAMPLE_MS = 5000;

export function computeSpeedsAtTime(
  points: TrackPoint[],
  time: Date,
): { groundSpeedMps: number; verticalSpeedMps: number } {
  if (points.length < 2) {
    return { groundSpeedMps: 0, verticalSpeedMps: 0 };
  }

  const current = interpolateTrackPoint(points, time);
  if (!current) {
    return { groundSpeedMps: 0, verticalSpeedMps: 0 };
  }

  const sampleStart = new Date(Math.max(points[0].time.getTime(), time.getTime() - SPEED_SAMPLE_MS));
  const earlier = interpolateTrackPoint(points, sampleStart);
  if (!earlier) {
    return { groundSpeedMps: 0, verticalSpeedMps: 0 };
  }

  const dt = (time.getTime() - sampleStart.getTime()) / 1000;
  if (dt <= 0) {
    return { groundSpeedMps: 0, verticalSpeedMps: 0 };
  }

  const groundSpeedMps = haversine(
    { lat: earlier.lat, lon: earlier.lon },
    { lat: current.lat, lon: current.lon },
  ) / dt;

  const verticalSpeedMps =
    (clampDisplayAltitudeMeters(current.alt) - clampDisplayAltitudeMeters(earlier.alt)) / dt;

  return { groundSpeedMps, verticalSpeedMps };
}

export const DISPLAY_ALTITUDE_MIN_M = 0;
export const DISPLAY_ALTITUDE_MAX_M = 6000;
export const FLYING_ALTITUDE_MIN_M = 50;

export function isReasonableAltitudeMeters(alt: number): boolean {
  return Number.isFinite(alt) && alt >= DISPLAY_ALTITUDE_MIN_M && alt <= DISPLAY_ALTITUDE_MAX_M;
}

export function isFlyingAltitudeMeters(alt: number): boolean {
  return Number.isFinite(alt) && alt >= FLYING_ALTITUDE_MIN_M && alt <= DISPLAY_ALTITUDE_MAX_M;
}

export function interpolateReasonableAltitude(altA: number, altB: number, ratio: number): number {
  const aOk = isFlyingAltitudeMeters(altA);
  const bOk = isFlyingAltitudeMeters(altB);
  if (aOk && bOk) return altA + (altB - altA) * ratio;
  if (aOk) return altA;
  if (bOk) return altB;
  return altA + (altB - altA) * ratio;
}

export function sanitizeTrackPointAltitudes(points: TrackPoint[]): TrackPoint[] {
  if (points.length === 0) return points;

  return points.map((point, index) => {
    if (isFlyingAltitudeMeters(point.alt)) return point;

    let previous: TrackPoint | undefined;
    let next: TrackPoint | undefined;

    for (let i = index - 1; i >= 0; i--) {
      if (isFlyingAltitudeMeters(points[i].alt)) {
        previous = points[i];
        break;
      }
    }

    for (let i = index + 1; i < points.length; i++) {
      if (isFlyingAltitudeMeters(points[i].alt)) {
        next = points[i];
        break;
      }
    }

    if (previous && next) {
      const span = next.time.getTime() - previous.time.getTime();
      const ratio = span <= 0 ? 0 : (point.time.getTime() - previous.time.getTime()) / span;
      return {
        ...point,
        alt: previous.alt + (next.alt - previous.alt) * ratio,
      };
    }

    if (previous) return { ...point, alt: previous.alt };
    if (next) return { ...point, alt: next.alt };
    return point;
  });
}

export function resolveDisplayAltitudeMeters(
  points: TrackPoint[],
  time: Date,
  rawAlt: number,
): number {
  if (isFlyingAltitudeMeters(rawAlt)) {
    return clampDisplayAltitudeMeters(rawAlt);
  }

  const t = time.getTime();
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.time.getTime() > t) continue;
    if (isFlyingAltitudeMeters(point.alt)) {
      return clampDisplayAltitudeMeters(point.alt);
    }
  }

  return clampDisplayAltitudeMeters(rawAlt);
}

export function clampChartAltitudeDisplay(
  displayAltitude: number,
  chartMin: number,
  chartMax: number,
): number {
  return Math.min(chartMax, Math.max(chartMin, displayAltitude));
}

export function clampDisplayAltitudeMeters(alt: number): number {
  if (!Number.isFinite(alt)) return DISPLAY_ALTITUDE_MIN_M;
  return Math.min(DISPLAY_ALTITUDE_MAX_M, Math.max(DISPLAY_ALTITUDE_MIN_M, alt));
}

export function formatTime(date: Date, timezone = 'UTC'): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 19) + 'Z';
  }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function parseUtcTimeOnDate(timeGate: string, date: Date): Date {
  const match = timeGate.match(/^(\d{2}):(\d{2}):(\d{2})Z?$/);
  if (!match) throw new Error(`Invalid time gate: ${timeGate}`);
  const result = new Date(date);
  result.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3]), 0);
  return result;
}

export const LANDED_COLOR = '#94a3b8';

export function isLandedAtTime(landingTime: Date | undefined, time: Date): boolean {
  return landingTime !== undefined && time.getTime() >= landingTime.getTime();
}

export const COMPETITOR_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9A6324',
  '#800000',
  '#aaffc3',
  '#808000',
  '#ffd8b1',
  '#000075',
  '#a9a9a9',
];
