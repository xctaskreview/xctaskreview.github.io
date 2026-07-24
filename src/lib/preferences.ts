export type DistanceUnit = 'km' | 'mi';
export type AltitudeUnit = 'm' | 'ft';
export type SpeedUnit = 'km/h' | 'mph' | 'kt';
export type VerticalSpeedUnit = 'm/s' | 'ft/min';
export type MapType = 'topo' | 'osm' | 'satellite';

export interface AppPreferences {
  distanceUnit: DistanceUnit;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  verticalSpeedUnit: VerticalSpeedUnit;
  timezone: string;
  mapType: MapType;
  pilotTrailLengthM: number;
}

export function normalizePilotTrailLengthM(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(20000, Math.round(value)));
}

export function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

export function createDefaultPreferences(): AppPreferences {
  return {
    distanceUnit: 'km',
    altitudeUnit: 'm',
    speedUnit: 'km/h',
    verticalSpeedUnit: 'm/s',
    timezone: getDefaultTimezone(),
    mapType: 'topo',
    pilotTrailLengthM: 0,
  };
}

const PREFERENCES_STORAGE_KEY = 'xc-task-review-preferences';

const DISTANCE_UNITS = new Set<DistanceUnit>(['km', 'mi']);
const ALTITUDE_UNITS = new Set<AltitudeUnit>(['m', 'ft']);
const SPEED_UNITS = new Set<SpeedUnit>(['km/h', 'mph', 'kt']);
const VERTICAL_SPEED_UNITS = new Set<VerticalSpeedUnit>(['m/s', 'ft/min']);
const MAP_TYPES = new Set<MapType>(['topo', 'osm', 'satellite']);

export function normalizePreferences(value: Partial<AppPreferences> | null | undefined): AppPreferences {
  const defaults = createDefaultPreferences();
  if (!value || typeof value !== 'object') return defaults;

  return {
    distanceUnit: DISTANCE_UNITS.has(value.distanceUnit as DistanceUnit)
      ? (value.distanceUnit as DistanceUnit)
      : defaults.distanceUnit,
    altitudeUnit: ALTITUDE_UNITS.has(value.altitudeUnit as AltitudeUnit)
      ? (value.altitudeUnit as AltitudeUnit)
      : defaults.altitudeUnit,
    speedUnit: SPEED_UNITS.has(value.speedUnit as SpeedUnit)
      ? (value.speedUnit as SpeedUnit)
      : defaults.speedUnit,
    verticalSpeedUnit: VERTICAL_SPEED_UNITS.has(value.verticalSpeedUnit as VerticalSpeedUnit)
      ? (value.verticalSpeedUnit as VerticalSpeedUnit)
      : defaults.verticalSpeedUnit,
    timezone:
      typeof value.timezone === 'string' && value.timezone.trim().length > 0
        ? value.timezone
        : defaults.timezone,
    mapType: MAP_TYPES.has(value.mapType as MapType) ? (value.mapType as MapType) : defaults.mapType,
    pilotTrailLengthM: normalizePilotTrailLengthM(
      typeof value.pilotTrailLengthM === 'number' ? value.pilotTrailLengthM : defaults.pilotTrailLengthM,
    ),
  };
}

/** Load preferences from localStorage. Independent of task/session persistence. */
export function loadPersistedPreferences(): AppPreferences | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      localStorage.removeItem(PREFERENCES_STORAGE_KEY);
      return null;
    }

    return normalizePreferences(parsed as Partial<AppPreferences>);
  } catch {
    return null;
  }
}

/** Persist preferences to localStorage so they survive reloads and cleared sessions. */
export function savePersistedPreferences(preferences: AppPreferences): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalizePreferences(preferences)));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;
const MPS_TO_KT = 1.9438444924406;

export function kmToDistanceUnit(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? km * KM_TO_MI : km;
}

export function distanceUnitToKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value / KM_TO_MI : value;
}

export function metersToAltitudeUnit(meters: number, unit: AltitudeUnit): number {
  return unit === 'ft' ? meters * M_TO_FT : meters;
}

export function chartAltitudeStep(unit: AltitudeUnit): number {
  return unit === 'ft' ? 1000 : 500;
}

export function buildChartAltitudeTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = min; value <= max; value += step) {
    ticks.push(value);
  }
  return ticks;
}

export function formatDistance(km: number, unit: DistanceUnit, digits = 1): string {
  const value = kmToDistanceUnit(km, unit);
  const suffix = unit === 'mi' ? 'mi' : 'km';
  return `${value.toFixed(digits)} ${suffix}`;
}

export function formatDistanceValue(km: number, unit: DistanceUnit, digits = 1): string {
  return kmToDistanceUnit(km, unit).toFixed(digits);
}

export function formatAltitude(meters: number, unit: AltitudeUnit): string {
  const value = metersToAltitudeUnit(meters, unit);
  const suffix = unit === 'ft' ? 'ft' : 'm';
  return `${Math.round(value)} ${suffix}`;
}

export function formatAltitudeValue(meters: number, unit: AltitudeUnit): string {
  return String(Math.round(metersToAltitudeUnit(meters, unit)));
}

export function formatGroundSpeed(mps: number, unit: SpeedUnit): string {
  return `${formatGroundSpeedValue(mps, unit)} ${speedUnitLabel(unit)}`;
}

export function formatGroundSpeedValue(mps: number, unit: SpeedUnit): string {
  if (unit === 'kt') {
    return (mps * MPS_TO_KT).toFixed(0);
  }

  const kmh = mps * 3.6;
  if (unit === 'mph') {
    return (kmh * KM_TO_MI).toFixed(0);
  }
  return kmh.toFixed(0);
}

export function speedUnitLabel(unit: SpeedUnit): string {
  if (unit === 'mph') return 'mph';
  if (unit === 'kt') return 'kt';
  return 'km/h';
}

export function formatVerticalSpeed(mps: number, unit: VerticalSpeedUnit): string {
  const suffix = unit === 'ft/min' ? 'ft/min' : 'm/s';
  return `${formatVerticalSpeedValue(mps, unit)} ${suffix}`;
}

export function formatVerticalSpeedValue(mps: number, unit: VerticalSpeedUnit): string {
  if (unit === 'ft/min') {
    return String(Math.round(mps * 196.850394));
  }
  return mps.toFixed(1);
}

export function distanceAxisLabel(unit: DistanceUnit): string {
  return unit === 'mi' ? 'Task (mi)' : 'Task (km)';
}

export function altitudeAxisLabel(unit: AltitudeUnit): string {
  return unit === 'ft' ? 'Altitude (ft)' : 'Altitude (m)';
}

export function getTimezoneOptions(): { value: string; label: string }[] {
  const browserTz = getDefaultTimezone();
  const common = [
    browserTz,
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Phoenix',
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Europe/Zurich',
    'Australia/Sydney',
  ];

  const seen = new Set<string>();
  return common
    .filter((tz) => {
      if (seen.has(tz)) return false;
      seen.add(tz);
      return true;
    })
    .map((tz) => ({
      value: tz,
      label: tz === browserTz ? `${tz} (browser)` : tz,
    }));
}

export function getMapTypeOptions(): { value: MapType; label: string }[] {
  return [
    { value: 'topo', label: 'Topographic' },
    { value: 'osm', label: 'OpenStreetMap' },
    { value: 'satellite', label: 'Satellite' },
  ];
}

export function getSpeedUnitOptions(): { value: SpeedUnit; label: string }[] {
  return [
    { value: 'km/h', label: 'Kilometers per hour (km/h)' },
    { value: 'mph', label: 'Miles per hour (mph)' },
    { value: 'kt', label: 'Knots (kt)' },
  ];
}

export function getVerticalSpeedUnitOptions(): { value: VerticalSpeedUnit; label: string }[] {
  return [
    { value: 'm/s', label: 'Meters per second (m/s)' },
    { value: 'ft/min', label: 'Feet per minute (ft/min)' },
  ];
}

export const MAP_TILES: Record<MapType, { url: string; attribution: string }> = {
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};
