import { describe, expect, it } from 'vitest';
import japiraTask from './fixtures/japira-2026-03-21.json';
import { haversine } from '../src/lib/geo';
import { progressLegStartPoint } from '../src/lib/taskMapStyle';
import { pointOnRouteAtProgress } from '../src/lib/taskProgressMarker';
import type { XcTask } from '../src/lib/types';
import { buildOptimizedRoute } from '../src/lib/xctask';

const route = buildOptimizedRoute(japiraTask as XcTask);

describe('pointOnRouteAtProgress leg 0', () => {
  it('measures leg-0 distance from the SSS cylinder rim, not the center', () => {
    const rim = progressLegStartPoint(route, 0)!;
    const center = route.progressPoints[0]!;
    const leg0 = route.progressLegDistances[0]!;
    const progressPercent = ((leg0 * 0.4) / route.progressTotalDistance) * 100;

    const onRoute = pointOnRouteAtProgress(route, progressPercent);
    expect(onRoute).not.toBeNull();
    if (!onRoute) return;

    expect(onRoute.legIndex).toBe(0);
    expect(haversine(rim, onRoute.point)).toBeCloseTo(leg0 * 0.4, 0);
    expect(haversine(center, onRoute.point)).toBeGreaterThan(haversine(rim, onRoute.point));
  });
});
