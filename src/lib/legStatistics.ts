import { extractPilotDisplayName } from './igc';
import type { EnrichedFlightTrack, EnrichedTrackPoint } from './taskProgress';
import type { OptimizedRoute, ProgressTurnpoint } from './types';

export interface PilotLegTiming {
  legIndex: number;
  startTime?: Date;
  finishTime?: Date;
  speedMps?: number;
}

export interface GlobalLegStatistics {
  legNumber: number;
  legIndex: number;
  fromTurnpoint: ProgressTurnpoint;
  toTurnpoint: ProgressTurnpoint;
  distanceM: number;
  minSpeedMps?: number;
  avgSpeedMps?: number;
  maxSpeedMps?: number;
  fastestPilot?: string;
  earliestStartTime?: Date;
  latestStartTime?: Date;
  firstFinishPilot?: string;
  firstFinishTime?: Date;
}

function computePilotLegTimingsFromPoints(
  points: EnrichedTrackPoint[],
  route: OptimizedRoute,
  taskStartMs?: number,
): PilotLegTiming[] {
  const numLegs = route.progressLegDistances.length;
  const timings: PilotLegTiming[] = Array.from({ length: numLegs }, (_, legIndex) => ({ legIndex }));

  let prevLegIndex = -1;

  for (const point of points) {
    if (taskStartMs !== undefined && point.time.getTime() < taskStartMs) continue;
    if (!point.hasStarted && point.legIndex < 0) continue;

    const legIndex = point.legIndex;

    if (legIndex >= 0 && legIndex !== prevLegIndex) {
      const current = timings[legIndex];
      if (current && !current.startTime) {
        current.startTime = point.time;
      }

      if (prevLegIndex >= 0 && prevLegIndex < numLegs && legIndex > prevLegIndex) {
        const previous = timings[prevLegIndex];
        if (previous && !previous.finishTime) {
          previous.finishTime = point.time;
        }
      }
    }

    if (point.finished && legIndex >= 0 && legIndex < numLegs) {
      const current = timings[legIndex];
      if (current && !current.finishTime) {
        current.finishTime = point.time;
      }
    }

    prevLegIndex = legIndex;
  }

  for (const timing of timings) {
    if (!timing.startTime || !timing.finishTime) continue;

    const durationSec = (timing.finishTime.getTime() - timing.startTime.getTime()) / 1000;
    const distanceM = route.progressLegDistances[timing.legIndex] ?? 0;
    if (durationSec > 0 && distanceM > 0) {
      timing.speedMps = distanceM / durationSec;
    }
  }

  return timings;
}

export function computePilotLegTimings(
  track: EnrichedFlightTrack,
  route: OptimizedRoute,
  taskStart?: Date,
): PilotLegTiming[] {
  return computePilotLegTimingsFromPoints(track.points, route, taskStart?.getTime());
}

export function attachLegTimingsToTrack(
  track: EnrichedFlightTrack,
  route: OptimizedRoute,
  taskStart?: Date,
): EnrichedFlightTrack {
  return {
    ...track,
    legTimings: computePilotLegTimings(track, route, taskStart),
  };
}

export function attachLegTimingsToTracks(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
  taskStart?: Date,
): EnrichedFlightTrack[] {
  return tracks.map((track) => attachLegTimingsToTrack(track, route, taskStart));
}

export function computeGlobalLegStatistics(
  tracks: EnrichedFlightTrack[],
  route: OptimizedRoute,
): GlobalLegStatistics[] {
  const numLegs = route.progressLegDistances.length;
  const stats: GlobalLegStatistics[] = [];

  for (let legIndex = 0; legIndex < numLegs; legIndex += 1) {
    const fromTurnpoint = route.progressTurnpoints[legIndex];
    const toTurnpoint = route.progressTurnpoints[legIndex + 1];
    if (!fromTurnpoint || !toTurnpoint) continue;

    const speeds: number[] = [];
    let earliestStartTime: Date | undefined;
    let latestStartTime: Date | undefined;
    let firstFinish: { time: Date; pilot: string } | undefined;
    let fastest: { speedMps: number; pilot: string } | undefined;

    for (const track of tracks) {
      const timing = track.legTimings?.[legIndex];
      if (!timing) continue;

      const pilot = extractPilotDisplayName(track);

      if (timing.startTime) {
        if (!earliestStartTime || timing.startTime.getTime() < earliestStartTime.getTime()) {
          earliestStartTime = timing.startTime;
        }
        if (!latestStartTime || timing.startTime.getTime() > latestStartTime.getTime()) {
          latestStartTime = timing.startTime;
        }
      }

      if (timing.finishTime) {
        if (!firstFinish || timing.finishTime.getTime() < firstFinish.time.getTime()) {
          firstFinish = { time: timing.finishTime, pilot };
        }
      }

      if (timing.speedMps !== undefined && Number.isFinite(timing.speedMps)) {
        speeds.push(timing.speedMps);
        if (!fastest || timing.speedMps > fastest.speedMps) {
          fastest = { speedMps: timing.speedMps, pilot };
        }
      }
    }

    stats.push({
      legNumber: legIndex + 1,
      legIndex,
      fromTurnpoint,
      toTurnpoint,
      distanceM: route.progressLegDistances[legIndex] ?? 0,
      minSpeedMps: speeds.length > 0 ? Math.min(...speeds) : undefined,
      avgSpeedMps:
        speeds.length > 0 ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : undefined,
      maxSpeedMps: speeds.length > 0 ? Math.max(...speeds) : undefined,
      fastestPilot: fastest?.pilot,
      earliestStartTime,
      latestStartTime,
      firstFinishPilot: firstFinish?.pilot,
      firstFinishTime: firstFinish?.time,
    });
  }

  return stats;
}
