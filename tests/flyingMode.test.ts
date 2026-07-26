import { describe, expect, it } from 'vitest';
import {
  circlingDetectionFromPreferences,
  computeFlyingModeTimeline,
  getFlyingModeStateAtTime,
} from '../src/lib/flyingMode';
import { createDefaultPreferences } from '../src/lib/preferences';
import type { EnrichedTrackPoint } from '../src/lib/taskProgress';

function buildCircularTrack(seconds: number): EnrichedTrackPoint[] {
  const center = { lat: 46, lon: 7 };
  const radiusDeg = 0.004;
  const startMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const points: EnrichedTrackPoint[] = [];

  for (let index = 0; index <= seconds; index += 1) {
    const angle = (index / seconds) * Math.PI * 2;
    points.push({
      lat: center.lat + radiusDeg * Math.cos(angle),
      lon: center.lon + radiusDeg * Math.sin(angle),
      alt: 1000 + index * 2,
      time: new Date(startMs + index * 1000),
      timeMs: startMs + index * 1000,
      legIndex: 0,
      hasStarted: true,
      finished: false,
      taskPercent: 0,
      displayAlt: 1000 + index * 2,
      cumulativeDistanceM: index * 40,
      maxTaskPercentSoFar: 0,
      altAtMaxTaskPercentSoFar: 1000,
    });
  }

  return points;
}

function buildStraightGlideTrack(seconds: number): EnrichedTrackPoint[] {
  const startMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const points: EnrichedTrackPoint[] = [];

  for (let index = 0; index <= seconds; index += 1) {
    points.push({
      lat: 46 + index * 0.01,
      lon: 7,
      alt: 2000 - index * 4,
      time: new Date(startMs + index * 1000),
      timeMs: startMs + index * 1000,
      legIndex: 0,
      hasStarted: true,
      finished: false,
      taskPercent: index,
      displayAlt: 2000 - index * 4,
      cumulativeDistanceM: index * 900,
      maxTaskPercentSoFar: index,
      altAtMaxTaskPercentSoFar: 2000,
    });
  }

  return points;
}

describe('computeFlyingModeTimeline', () => {
  const detection = circlingDetectionFromPreferences(createDefaultPreferences());

  it('marks sustained turns as circling with thermal stats', () => {
    const points = buildCircularTrack(24);
    const timeline = computeFlyingModeTimeline(points, detection);
    const mid = getFlyingModeStateAtTime(timeline, new Date(points[18]!.timeMs));

    expect(mid?.mode).toBe('circling');
    expect(mid!.circlingDurationSec).toBeGreaterThan(10);
    expect(mid!.thermalGainM).toBeGreaterThan(0);
    expect(mid!.averageThermalVarioMps).toBeGreaterThan(0);
  });

  it('marks straight descent as glide with L/D stats', () => {
    const points = buildStraightGlideTrack(30);
    const timeline = computeFlyingModeTimeline(points, detection);
    const late = getFlyingModeStateAtTime(timeline, new Date(points[25]!.timeMs));

    expect(late?.mode).toBe('glide');
    expect(late!.glideRatio).not.toBeNull();
    expect(late!.glideRatio!).toBeGreaterThan(5);
    expect(late!.averageGlideRatio).not.toBeNull();
  });
});
