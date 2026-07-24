import { isFlyingAltitudeMeters } from './geo';
import { chartAltitudeStep, metersToAltitudeUnit, type AltitudeUnit, type DistanceUnit } from './preferences';
import type { EnrichedFlightTrack } from './taskProgress';

export function clampChartTaskDistanceDisplay(value: number, maxDistance: number): number {
  if (!Number.isFinite(value) || maxDistance <= 0) return 0;
  return Math.min(Math.max(0, value), maxDistance);
}

export function buildChartDistanceTicks(maxDistance: number, segments = 5): number[] {
  if (maxDistance <= 0) return [0];
  if (segments <= 0) return [0, maxDistance];

  const step = maxDistance / segments;
  return Array.from({ length: segments + 1 }, (_, index) =>
    index === segments ? maxDistance : index * step,
  );
}

export function formatChartDistanceTick(
  value: number,
  maxDistance: number,
  unit: DistanceUnit,
): string {
  if (!Number.isFinite(value)) return '';
  const decimals =
    unit === 'mi' ? (maxDistance < 10 ? 2 : maxDistance < 100 ? 1 : 0) : maxDistance < 10 ? 1 : maxDistance < 100 ? 1 : 0;
  return value.toFixed(decimals);
}

export function computeChartAltitudeRange(
  tracks: EnrichedFlightTrack[],
  altitudeUnit: AltitudeUnit,
): { min: number; max: number; step: number } {
  const step = chartAltitudeStep(altitudeUnit);
  let minMeters = Infinity;
  let maxMeters = -Infinity;

  for (const track of tracks) {
    for (const point of track.points) {
      if (!isFlyingAltitudeMeters(point.alt)) continue;
      minMeters = Math.min(minMeters, point.alt);
      maxMeters = Math.max(maxMeters, point.alt);
    }
  }

  if (!Number.isFinite(minMeters) || !Number.isFinite(maxMeters)) {
    return { min: 0, max: step * 2, step };
  }

  const minDisplay = metersToAltitudeUnit(minMeters, altitudeUnit);
  const maxDisplay = metersToAltitudeUnit(maxMeters, altitudeUnit);
  let min = Math.floor(minDisplay / step) * step;
  let max = Math.ceil(maxDisplay / step) * step;

  if (max <= min) {
    max = min + step;
  }

  return { min, max, step };
}
