import { describe, expect, it } from 'vitest';
import japiraTask from './fixtures/japira-2026-03-21.json';
import type { XcTask } from '../src/lib/types';
import { buildOptimizedRoute, getUniqueTurnpointCircles } from '../src/lib/xctask';
import { haversine } from '../src/lib/geo';
import {
  findCircleForProgressIndex,
  buildCompletedRouteSegments,
  getLeaderNextLegSegment,
  getProgressIndexForCircle,
  getTaggedTurnpointProgressIndices,
  getTurnpointCirclePathOptions,
  NEXT_TURNPOINT_FILL_OPACITY,
  TURNPOINT_FILL_OPACITY,
} from '../src/lib/taskMapStyle';

const task = japiraTask as XcTask;
const route = buildOptimizedRoute(task);
const circles = getUniqueTurnpointCircles(task);

describe('getProgressIndexForCircle with duplicate JP001', () => {
  it('does not map takeoff JP001 to SSS progress index', () => {
    const takeoff = circles.find((c) => c.number === 1);
    expect(takeoff?.name).toBe('JP001');
    expect(getProgressIndexForCircle(takeoff!, route)).toBe(-1);
  });

  it('maps SSS cylinder to progress index 0', () => {
    const sss = circles.find((c) => c.type === 'SSS');
    expect(getProgressIndexForCircle(sss!, route)).toBe(0);
  });

  it('maps return JP001 (3000 m) to progress index 3, not 0', () => {
    const returnJp001 = circles.find((c) => c.number === 5);
    expect(returnJp001?.radius).toBe(3000);
    expect(getProgressIndexForCircle(returnJp001!, route)).toBe(3);
  });
});

describe('getTaggedTurnpointProgressIndices', () => {
  it('does not tag SSS on small field progress before the first racing leg is reached', () => {
    const tagged = getTaggedTurnpointProgressIndices(route, 0.5);
    expect(tagged.has(0)).toBe(false);
  });
});

describe('adjustProgressDistancesForSssCylinderExit', () => {
  it('shortens leg 0 to SSS exit → next fix', () => {
    const legStart = getLeaderNextLegSegment(route, 0, true, false)![0];
    expect(route.progressLegDistances[0]).toBeCloseTo(haversine(legStart, route.progressPoints[1]!), 0);
  });
});

describe('buildCompletedRouteSegments', () => {
  it('starts leg-0 progress on the SSS cylinder', () => {
    const segments = buildCompletedRouteSegments(route, 1);
    expect(segments.length).toBeGreaterThan(0);
    const start = segments[0]![0]!;
    expect(haversine(start, route.sssCenter)).toBeCloseTo(route.sssRadius, -1);
  });
});

describe('getLeaderNextLegSegment', () => {
  it('starts the first leg on the SSS cylinder toward the next turnpoint', () => {
    const segment = getLeaderNextLegSegment(route, 0, true, false);
    expect(segment).not.toBeNull();
    const [start, end] = segment!;
    expect(haversine(start, route.sssCenter)).toBeCloseTo(route.sssRadius, -1);
    expect(haversine(start, route.sssCenter)).toBeGreaterThan(1000);
    expect(end).toEqual(route.progressPoints[1]);
  });
});

describe('findCircleForProgressIndex', () => {
  it('resolves 4th race turnpoint to JP001 3000 m circle', () => {
    const circle = findCircleForProgressIndex(3, route, circles);
    expect(circle?.number).toBe(5);
    expect(circle?.radius).toBe(3000);
  });
});

describe('getTurnpointCirclePathOptions', () => {
  it('drops next-TP highlight once tagged', () => {
    const tp = circles.find((c) => c.number === 5)!;
    const highlighted = getTurnpointCirclePathOptions(tp, route, false, true);
    const tagged = getTurnpointCirclePathOptions(tp, route, true, true);
    expect(highlighted.fillOpacity).toBe(NEXT_TURNPOINT_FILL_OPACITY);
    expect(tagged.fillOpacity).toBe(TURNPOINT_FILL_OPACITY);
  });
});
