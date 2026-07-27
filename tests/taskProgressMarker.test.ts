import { describe, expect, it } from 'vitest';
import japiraTask from './fixtures/japira-2026-03-21.json';
import { haversine } from '../src/lib/geo';
import { progressLegStartPoint } from '../src/lib/taskMapStyle';
import { computeTurnpointReachTimes, pointOnRouteAtProgress } from '../src/lib/taskProgressMarker';
import type { XcTask } from '../src/lib/types';
import { buildOptimizedRoute } from '../src/lib/xctask';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { enrichTracksWithTaskProgress } from '../src/lib/taskProgress';
import { buildTaskFieldTimeline } from '../src/lib/taskTimeline';
import { computeTaskTiming } from '../src/lib/tracks';
import { getTaskStartTime, getUniqueTurnpointCircles } from '../src/lib/xctask';

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

describe('computeTurnpointReachTimes', () => {
  it('uses first pilot cylinder crossings for slider times, not field geographic progress', async () => {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures',
      'xcdemon-680-2026-07-19-review.zip',
    );
    const buffer = readFileSync(fixturePath);
    const file = new File([buffer], path.basename(fixturePath), { type: 'application/zip' });
    const { session } = await importSessionBundle(file);
    const route = buildOptimizedRoute(session.task);
    const circles = getUniqueTurnpointCircles(session.task);
    const ref = session.tracks[0]?.points[0]?.time ?? new Date();
    const taskStart = getTaskStartTime(session.task, ref)!;
    const enriched = enrichTracksWithTaskProgress(session.tracks, session.task, route, taskStart);
    const timing = computeTaskTiming(session.task, enriched);
    const fieldTimeline = buildTaskFieldTimeline(enriched, timing.taskStart, timing.trackEnd);
    const markers = computeTurnpointReachTimes(
      enriched,
      route,
      taskStart,
      timing.trackEnd,
      circles,
      fieldTimeline,
    );

    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker.time.getTime()).toBe(marker.firstTagTime.getTime());
    }

    const tp2 = markers.find((marker) => marker.number === 2);
    expect(tp2?.firstPilot).toBe('Casey Gerstle');
    expect(tp2?.time.toISOString()).toBe('2026-07-19T20:32:53.000Z');
  });
});
