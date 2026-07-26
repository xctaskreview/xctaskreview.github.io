import { describe, expect, it } from 'vitest';
import { estimateLaunchAltitudeMetersFromTracks } from '../src/lib/geo';
import type { EnrichedFlightTrack, EnrichedTrackPoint } from '../src/lib/taskProgress';
import { getTrackSnapshotAtTime } from '../src/lib/taskProgress';
import type { OptimizedRoute } from '../src/lib/types';

const route = {
  sssIndex: 0,
  sssCenter: { lat: 39.34, lon: -122.68 },
  sssRadius: 400,
  progressPoints: [
    { lat: 39.34, lon: -122.68 },
    { lat: 39.35, lon: -122.67 },
  ],
  progressLegDistances: [1000],
  progressTotalDistance: 1000,
  progressTurnpoints: [],
} as OptimizedRoute;

function point(timeMs: number, alt: number): EnrichedTrackPoint {
  return {
    time: new Date(timeMs),
    timeMs,
    lat: 39.34,
    lon: -122.68,
    alt,
    legIndex: -1,
    hasStarted: false,
    finished: false,
    taskPercent: 0,
    displayAlt: alt,
    cumulativeDistanceM: 0,
    maxTaskPercentSoFar: 0,
    altAtMaxTaskPercentSoFar: 0,
  };
}

describe('estimateLaunchAltitudeMetersFromTracks', () => {
  it('uses the median of early fixes across all tracks', () => {
    const estimate = estimateLaunchAltitudeMetersFromTracks([
      { points: [{ time: new Date(), lat: 0, lon: 0, alt: 980 }] },
      { points: [{ time: new Date(), lat: 0, lon: 0, alt: 1000 }] },
      { points: [{ time: new Date(), lat: 0, lon: 0, alt: 1020 }] },
    ]);
    expect(estimate).toBe(1000);
  });
});

describe('getTrackSnapshotAtTime before log start', () => {
  it('shows fleet launch altitude when playback precedes the first fix', () => {
    const startMs = Date.UTC(2026, 6, 19, 20, 0, 0);
    const track: EnrichedFlightTrack = {
      id: 'late',
      pilotName: 'Late',
      firstName: 'Late',
      fileName: 'late.igc',
      launchAltitudeM: 995,
      points: [point(startMs + 60_000, 1010)],
    };

    const snapshot = getTrackSnapshotAtTime(track, new Date(startMs), route);
    expect(snapshot?.alt).toBe(995);
    expect(snapshot?.taskPercent).toBe(0);
    expect(snapshot?.hasStarted).toBe(false);
  });
});
