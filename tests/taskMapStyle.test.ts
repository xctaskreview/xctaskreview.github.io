import { describe, expect, it } from 'vitest';
import japiraTask from './fixtures/japira-2026-03-21.json';
import type { XcTask } from '../src/lib/types';
import { buildOptimizedRoute, getUniqueTurnpointCircles } from '../src/lib/xctask';
import {
  findCircleForProgressIndex,
  getProgressIndexForCircle,
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
