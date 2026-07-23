import { extractGliderType, pilotFirstName } from './igc';
import { clampDisplayAltitudeMeters, computeSpeedsAtTime } from './geo';
import type { EnrichedFlightTrack } from './taskProgress';
import { computeTrackAirStats, getTrackColor, getTrackSnapshotAtTime } from './tracks';
import type { CompetitorSnapshot, OptimizedRoute } from './types';

export function buildCompetitorSnapshots(
  tracks: EnrichedFlightTrack[],
  trackColors: Record<string, string>,
  route: OptimizedRoute,
  currentTime: Date,
  includeSpeeds: boolean,
): CompetitorSnapshot[] {
  const taskDistanceKm = route.progressTotalDistance / 1000;

  return tracks.flatMap((track, index) => {
    const snapshot = getTrackSnapshotAtTime(track, currentTime, route);
    if (!snapshot) return [];

    const pilotName = track.pilotName;
    const taskKm = (snapshot.taskPercent / 100) * taskDistanceKm;
    const speeds =
      includeSpeeds && !snapshot.landed
        ? computeSpeedsAtTime(track.points, currentTime)
        : { groundSpeedMps: 0, verticalSpeedMps: 0 };
    const airStats =
      includeSpeeds && !snapshot.landed
        ? computeTrackAirStats(track.points, currentTime)
        : { thermalStrengthMps: 0, windDirectionDeg: 0, windSpeedMps: 0 };

    return [
      {
        id: track.id,
        pilotName,
        firstName: pilotFirstName(pilotName),
        gliderType: track.gliderType ?? extractGliderType(track),
        lat: snapshot.lat,
        lon: snapshot.lon,
        alt: clampDisplayAltitudeMeters(snapshot.alt),
        taskPercent: snapshot.taskPercent,
        taskKm,
        color: getTrackColor(track.id, trackColors, index),
        landed: snapshot.landed,
        groundSpeedMps: speeds.groundSpeedMps,
        verticalSpeedMps: speeds.verticalSpeedMps,
        nextTurnpointName: snapshot.nextTurnpointName,
        leadPercent: 0,
        thermalStrengthMps: airStats.thermalStrengthMps,
        windDirectionDeg: airStats.windDirectionDeg,
        windSpeedMps: airStats.windSpeedMps,
      },
    ];
  });
}

export function computeCompetitorPositions(
  tracks: EnrichedFlightTrack[],
  trackColors: Record<string, string>,
  route: OptimizedRoute,
  currentTime: Date,
): Map<string, number> {
  const competitors = buildCompetitorSnapshots(tracks, trackColors, route, currentTime, false);
  const sorted = [...competitors].sort((a, b) => {
    if (b.taskKm !== a.taskKm) return b.taskKm - a.taskKm;
    if (b.taskPercent !== a.taskPercent) return b.taskPercent - a.taskPercent;
    return a.pilotName.localeCompare(b.pilotName);
  });

  const positions = new Map<string, number>();
  for (let index = 0; index < sorted.length; index += 1) {
    positions.set(sorted[index].id, index + 1);
  }

  return positions;
}
