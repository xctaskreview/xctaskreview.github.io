import { formatTime } from './geo';
import type { GlobalLegStatistics } from './legStatistics';
import type { AppPreferences } from './preferences';
import { formatDistanceValue, formatGroundSpeedValue } from './preferences';

export function legStatisticsFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return fullName;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function formatLegStatisticsTimestamp(date: Date | undefined, timezone: string): string {
  return date ? formatTime(date, timezone) : '—';
}

export function formatLegStatisticsSpeedRange(
  minMps: number | undefined,
  avgMps: number | undefined,
  maxMps: number | undefined,
  speedUnit: AppPreferences['speedUnit'],
): { min: string; avg: string; max: string } {
  return {
    min: minMps !== undefined ? formatGroundSpeedValue(minMps, speedUnit) : '—',
    avg: avgMps !== undefined ? formatGroundSpeedValue(avgMps, speedUnit) : '—',
    max: maxMps !== undefined ? formatGroundSpeedValue(maxMps, speedUnit) : '—',
  };
}

export function formatLegStatisticsPopupLines(
  leg: GlobalLegStatistics,
  preferences: AppPreferences,
): string[] {
  const speeds = formatLegStatisticsSpeedRange(
    leg.minSpeedMps,
    leg.avgSpeedMps,
    leg.maxSpeedMps,
    preferences.speedUnit,
  );
  const distanceKm = leg.distanceM / 1000;
  const distanceUnit = preferences.distanceUnit === 'mi' ? 'mi' : 'km';
  const speedUnit = preferences.speedUnit;

  const fastestLine =
    leg.maxSpeedMps !== undefined
      ? leg.fastestPilot
        ? `Fastest: ${speeds.max} ${speedUnit} (${legStatisticsFirstName(leg.fastestPilot)})`
        : `Fastest: ${speeds.max} ${speedUnit}`
      : 'Fastest: —';

  const firstFinishLine = leg.firstFinishPilot
    ? `First finish: ${leg.firstFinishPilot} (${formatLegStatisticsTimestamp(leg.firstFinishTime, preferences.timezone)})`
    : 'First finish: —';

  return [
    `Leg ${leg.legNumber}`,
    `From: ${leg.fromTurnpoint.name}`,
    `To: ${leg.toTurnpoint.name}`,
    `Dist: ${formatDistanceValue(distanceKm, preferences.distanceUnit)} ${distanceUnit}`,
    `Min speed: ${speeds.min} ${speedUnit}`,
    `Avg speed: ${speeds.avg} ${speedUnit}`,
    fastestLine,
    `Earliest start: ${formatLegStatisticsTimestamp(leg.earliestStartTime, preferences.timezone)}`,
    `Latest start: ${formatLegStatisticsTimestamp(leg.latestStartTime, preferences.timezone)}`,
    firstFinishLine,
  ];
}
