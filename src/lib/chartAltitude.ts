import { isFlyingAltitudeMeters } from './geo';
import { chartAltitudeStep, metersToAltitudeUnit, type AltitudeUnit } from './preferences';
import type { EnrichedFlightTrack } from './taskProgress';

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
