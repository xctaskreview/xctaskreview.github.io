import { describe, expect, it } from 'vitest';
import {
  buildPilotFullPathGeometry,
  buildPilotFutureTrailLatLngs,
  findPathIndexAtOrBefore,
  pathChunkCount,
  pathChunkEndIndex,
  pathChunkIndexForPoint,
  pathChunkStartIndex,
  PATH_CHUNK_SIZE,
} from '../src/lib/pilotTrail';
import { getPilotMaxProgressAtTime, type EnrichedFlightTrack } from '../src/lib/taskProgress';
import type { OptimizedRoute } from '../src/lib/types';

const emptyRoute: OptimizedRoute = {
  points: [],
  legDistances: [],
  totalDistance: 0,
  cumulativeDistances: [],
  progressPoints: [],
  progressLegDistances: [],
  progressCumulativeDistances: [],
  progressGoalApproachDistance: 0,
  progressTotalDistance: 0,
  progressTurnpoints: [],
  sssIndex: 0,
  goalIndex: 0,
  sssCenter: { lat: 0, lon: 0 },
  sssRadius: 0,
  goalCenter: { lat: 0, lon: 0 },
  goalRadius: 0,
};

const START_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

function buildTrack(pointCount: number): EnrichedFlightTrack {
  return {
    id: 'track',
    pilotName: 'Pilot',
    fileName: 'pilot.igc',
    points: Array.from({ length: pointCount }, (_, index) => {
      const taskPercent = (index / pointCount) * 100;
      return {
        lat: 46 + index * 0.0001,
        lon: 7 + index * 0.0001,
        alt: 1500,
        time: new Date(START_MS + index * 1000),
        timeMs: START_MS + index * 1000,
        taskPercent,
        legIndex: 1,
        hasStarted: true,
        finished: false,
        displayAlt: 1500,
        cumulativeDistanceM: index * 13,
        maxTaskPercentSoFar: taskPercent,
        altAtMaxTaskPercentSoFar: 1500,
      };
    }),
  };
}

describe('full path geometry', () => {
  it('keeps every track point', () => {
    const track = buildTrack(12000);
    const geometry = buildPilotFullPathGeometry(track);

    expect(geometry.pointCount).toBe(12000);
    expect(geometry.latLngs).toHaveLength(12000);
    expect(geometry.latLngs[4321]).toEqual([track.points[4321].lat, track.points[4321].lon]);
    expect(geometry.timesMs[4321]).toBe(track.points[4321].time.getTime());
  });

  it('chunks cover the whole path and share endpoints', () => {
    const geometry = buildPilotFullPathGeometry(buildTrack(3000));
    const chunks = pathChunkCount(geometry.pointCount);

    expect(pathChunkStartIndex(0)).toBe(0);
    expect(pathChunkEndIndex(chunks - 1, geometry.pointCount)).toBe(geometry.pointCount - 1);

    for (let chunk = 1; chunk < chunks; chunk += 1) {
      expect(pathChunkStartIndex(chunk)).toBe(pathChunkEndIndex(chunk - 1, geometry.pointCount));
    }
  });

  it('maps a point index to the chunk that contains it', () => {
    const geometry = buildPilotFullPathGeometry(buildTrack(3000));
    const chunks = pathChunkCount(geometry.pointCount);

    expect(pathChunkIndexForPoint(0, geometry.pointCount)).toBe(0);
    expect(pathChunkIndexForPoint(PATH_CHUNK_SIZE, geometry.pointCount)).toBe(1);
    expect(pathChunkIndexForPoint(geometry.pointCount - 1, geometry.pointCount)).toBe(chunks - 1);
  });
});

describe('findPathIndexAtOrBefore', () => {
  const geometry = buildPilotFullPathGeometry(buildTrack(5000));

  it('matches binary search results from any cursor hint', () => {
    for (const target of [0, 1, 137, 2500, 4998, 4999]) {
      const timeMs = geometry.timesMs[target];
      expect(findPathIndexAtOrBefore(geometry.timesMs, timeMs, -1)).toBe(target);
      expect(findPathIndexAtOrBefore(geometry.timesMs, timeMs, target)).toBe(target);
      expect(findPathIndexAtOrBefore(geometry.timesMs, timeMs, 4999)).toBe(target);
    }
  });

  it('advances incrementally while time moves forward', () => {
    let cursor = -1;
    for (let index = 0; index < 200; index += 1) {
      cursor = findPathIndexAtOrBefore(geometry.timesMs, geometry.timesMs[index] + 500, cursor);
      expect(cursor).toBe(index);
    }
  });

  it('reports -1 before the track starts and clamps after it ends', () => {
    expect(findPathIndexAtOrBefore(geometry.timesMs, START_MS - 1000, -1)).toBe(-1);
    expect(findPathIndexAtOrBefore(geometry.timesMs, START_MS + 10_000_000, 0)).toBe(4999);
  });
});

describe('buildPilotFutureTrailLatLngs', () => {
  it('starts at the interpolated head and follows remaining geometry', () => {
    const track = buildTrack(100);
    const geometry = buildPilotFullPathGeometry(track);
    const time = new Date(START_MS + 50 * 1000);
    const cursor = { index: -1 };

    const latLngs = buildPilotFutureTrailLatLngs(geometry, track, time, emptyRoute, cursor);

    expect(latLngs[0]).toEqual([track.points[50].lat, track.points[50].lon]);
    expect(latLngs[latLngs.length - 1]).toEqual([
      track.points[99].lat,
      track.points[99].lon,
    ]);
    expect(latLngs.length).toBe(50);
    expect(cursor.index).toBe(50);
  });

  it('returns empty when the pilot is at the last point', () => {
    const track = buildTrack(10);
    const geometry = buildPilotFullPathGeometry(track);
    const cursor = { index: -1 };

    expect(
      buildPilotFutureTrailLatLngs(
        geometry,
        track,
        new Date(START_MS + 9 * 1000),
        emptyRoute,
        cursor,
      ),
    ).toEqual([]);
  });
});

describe('getPilotMaxProgressAtTime', () => {
  it('reads the prefix max instead of scanning the track', () => {
    const track = buildTrack(50000);
    for (let index = 40000; index < track.points.length; index += 1) {
      track.points[index] = {
        ...track.points[index],
        maxTaskPercentSoFar: 99,
        altAtMaxTaskPercentSoFar: 2750,
      };
    }

    const maxProgress = getPilotMaxProgressAtTime(track, new Date(START_MS + 45000 * 1000));
    expect(maxProgress?.taskPercent).toBe(99);
    expect(maxProgress?.alt).toBe(2750);
  });
});
