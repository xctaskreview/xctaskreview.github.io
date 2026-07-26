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

  let low = 0;
  let high = points.length - 2;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const a = points[mid];
    const b = points[mid + 1];
    const ta = a.time.getTime();
    const tb = b.time.getTime();

    if (t < ta) {
      high = mid - 1;
    } else if (t > tb) {
      low = mid + 1;
    } else {
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

/** IGC loggers often emit 0000000N00000000E before GPS lock. */
export function isNullIslandTrackPoint(point: TrackPoint): boolean {
  return Math.abs(point.lat) < 1e-9 && Math.abs(point.lon) < 1e-9;
}

function isAllZeroTrackPoint(point: TrackPoint): boolean {
  return isNullIslandTrackPoint(point) && point.alt === 0;
}

/** Remove leading no-fix points (0°N 0°E / 00000 m), common before GPS lock. */
export function trimLeadingZeroFixTrackPoints(points: TrackPoint[]): TrackPoint[] {
  if (points.length <= 1) return points;

  let start = 0;
  while (start < points.length - 1 && (isNullIslandTrackPoint(points[start]) || isAllZeroTrackPoint(points[start]))) {
    start += 1;
  }

  return start === 0 ? points : points.slice(start);
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

/** Points at the start of each log used to infer launch height for the whole task. */
export const LAUNCH_ALTITUDE_SAMPLE_POINTS = 120;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Median pressure altitude from the opening fixes of every track (typical launch-site level).
 */
export function estimateLaunchAltitudeMetersFromTracks(tracks: { points: TrackPoint[] }[]): number | null {
  const samples: number[] = [];

  for (const track of tracks) {
    const limit = Math.min(LAUNCH_ALTITUDE_SAMPLE_POINTS, track.points.length);
    for (let index = 0; index < limit; index += 1) {
      const alt = track.points[index]!.alt;
      if (!isReasonableAltitudeMeters(alt)) continue;
      samples.push(clampDisplayAltitudeMeters(alt));
    }
  }

  return median(samples);
}

export function formatTime(
  date: Date,
  timezone = 'UTC',
  options?: { includeSeconds?: boolean },
): string {
  const includeSeconds = options?.includeSeconds ?? true;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: false,
      timeZone: timezone,
    }).format(date);
  } catch {
    const iso = date.toISOString().slice(11, 19);
    return includeSeconds ? iso : iso.slice(0, 5);
  }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function parseUtcTimeOnDate(timeGate: string, date: Date): Date {
  const match = timeGate.match(/^(\d{2}):(\d{2}):(\d{2})Z?$/);
  if (!match) throw new Error(`Invalid time gate: ${timeGate}`);
  const result = new Date(date);
  result.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3]), 0);
  return result;
}

function getZonedTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

export function parseIsoDate(isoDate: string): Date {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid date: ${isoDate}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
}

export function parseLocalTimeOnDate(timeGate: string, date: Date, timeZone: string): Date {
  const match = timeGate.match(/^(\d{2}):(\d{2})(?::(\d{2}))?Z?$/i);
  if (!match) throw new Error(`Invalid time gate: ${timeGate}`);

  const target = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0),
  };

  const compareParts = (
    parts: ReturnType<typeof getZonedTimeParts>,
  ) => {
    if (parts.year !== target.year) return parts.year - target.year;
    if (parts.month !== target.month) return parts.month - target.month;
    if (parts.day !== target.day) return parts.day - target.day;
    if (parts.hour !== target.hour) return parts.hour - target.hour;
    if (parts.minute !== target.minute) return parts.minute - target.minute;
    return parts.second - target.second;
  };

  let low = Date.UTC(target.year, target.month - 1, target.day - 1, 0, 0, 0);
  let high = Date.UTC(target.year, target.month - 1, target.day + 1, 23, 59, 59);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = compareParts(getZonedTimeParts(new Date(mid), timeZone));
    if (cmp === 0) return new Date(mid);
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }

  throw new Error(`Could not resolve local time ${timeGate} on ${isoDateFromUtcDate(date)} in ${timeZone}`);
}

function isoDateFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const LANDED_COLOR = '#94a3b8';

export function isLandedAtTime(landingTime: Date | undefined, time: Date): boolean {
  return landingTime !== undefined && time.getTime() >= landingTime.getTime();
}

/** Point on the cylinder edge from `center` toward `toward`, at `radiusM`. */
export function pointOnCylinderToward(center: LatLon, radiusM: number, toward: LatLon): LatLon {
  if (radiusM <= 0) return { lat: center.lat, lon: center.lon };

  const projection = createLocalProjection(center);
  const origin = projection.toLocal(center);
  const target = projection.toLocal(toward);
  let dx = target.x - origin.x;
  let dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return projection.toLatLon(origin.x + radiusM, origin.y);
  }
  const scale = radiusM / length;
  return projection.toLatLon(origin.x + dx * scale, origin.y + dy * scale);
}

/** Initial bearing from `from` to `to`, degrees clockwise from north. */
export function bearingDegrees(from: LatLon, to: LatLon): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest difference between headings in degrees. */
export function normalizeAngleDelta(degrees: number): number {
  let delta = degrees % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
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
