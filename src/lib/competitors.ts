import { computeSpeedsAtTime } from './geo';
import { getFlyingModeStateAtTime } from './flyingMode';
import type { EnrichedFlightTrack } from './taskProgress';
import { getTrackColor, getTrackSnapshotAtTime } from './tracks';
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

    const flyingModeState = getFlyingModeStateAtTime(track.flyingModeTimeline, currentTime);

    return [
      {
        id: track.id,
        pilotName,
        firstName: track.firstName,
        gliderType: track.gliderType,
        lat: snapshot.lat,
        lon: snapshot.lon,
        alt: snapshot.alt,
        taskPercent: snapshot.taskPercent,
        taskKm,
        color: getTrackColor(track.id, trackColors, index),
        landed: snapshot.landed,
        groundSpeedMps: speeds.groundSpeedMps,
        verticalSpeedMps: speeds.verticalSpeedMps,
        nextTurnpointName: snapshot.nextTurnpointName,
        nextTurnpointNumber: snapshot.nextTurnpointNumber,
        nextTurnpointRadiusM: snapshot.nextTurnpointRadiusM,
        leadPercent: 0,
        flyingMode: flyingModeState?.mode ?? 'glide',
        thermalGainM: flyingModeState?.thermalGainM ?? 0,
        circlingDurationSec: flyingModeState?.circlingDurationSec ?? 0,
        glideDurationSec: flyingModeState?.glideDurationSec ?? 0,
        averageThermalVarioMps: flyingModeState?.averageThermalVarioMps ?? 0,
        glideRatio: flyingModeState?.glideRatio ?? null,
        averageGlideRatio: flyingModeState?.averageGlideRatio ?? null,
        glideDistanceM: flyingModeState?.glideDistanceM ?? 0,
        glideSpeedMps: flyingModeState?.glideSpeedMps ?? 0,
      },
    ];
  });
}

/** Ranking only needs progress and name, so this skips building full snapshots per frame. */
export function computeCompetitorPositions(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  currentTime: Date,
): Map<string, number> {
  const ranked: { id: string; pilotName: string; taskPercent: number }[] = [];

  for (const track of tracks) {
    const snapshot = getTrackSnapshotAtTime(track, currentTime, route);
    if (!snapshot) continue;
    ranked.push({ id: track.id, pilotName: track.pilotName, taskPercent: snapshot.taskPercent });
  }

  ranked.sort((a, b) => {
    if (b.taskPercent !== a.taskPercent) return b.taskPercent - a.taskPercent;
    return a.pilotName.localeCompare(b.pilotName);
  });

  const positions = new Map<string, number>();
  for (let index = 0; index < ranked.length; index += 1) {
    positions.set(ranked[index].id, index + 1);
  }

  return positions;
}
