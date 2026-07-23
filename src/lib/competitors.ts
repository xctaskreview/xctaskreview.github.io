import { extractGliderType, pilotFirstName } from './igc';
import { clampDisplayAltitudeMeters, computeSpeedsAtTime } from './geo';
import type { EnrichedFlightTrack } from './taskProgress';
import { colorForIndex, getTrackSnapshotAtTime } from './tracks';
import type { CompetitorSnapshot, OptimizedRoute } from './types';

export function buildCompetitorSnapshots(
  tracks: EnrichedFlightTrack[],
  trackColors: Record<string, string>,
  route: OptimizedRoute,
  currentTime: Date,
  includeSpeeds: boolean,
): CompetitorSnapshot[] {
  const taskDistanceKm = route.progressTotalDistance / 1000;

  return tracks.flatMap((track) => {
    const snapshot = getTrackSnapshotAtTime(track, currentTime, route);
    if (!snapshot) return [];

    const pilotName = track.pilotName;
    const taskKm = (snapshot.taskPercent / 100) * taskDistanceKm;
    const speeds =
      includeSpeeds && !snapshot.landed
        ? computeSpeedsAtTime(track.points, currentTime)
        : { groundSpeedMps: 0, verticalSpeedMps: 0 };

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
        color: trackColors[track.id] ?? colorForIndex(0),
        landed: snapshot.landed,
        groundSpeedMps: speeds.groundSpeedMps,
        verticalSpeedMps: speeds.verticalSpeedMps,
        nextTurnpointName: snapshot.nextTurnpointName,
        leadPercent: 0,
      },
    ];
  });
}
