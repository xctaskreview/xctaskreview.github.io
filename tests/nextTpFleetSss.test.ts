import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { buildOptimizedRoute, getTaskStartTime } from '../src/lib/xctask';
import { enrichTracksWithTaskProgress } from '../src/lib/taskProgress';
import {
  buildTaskNextTurnpointTimeline,
  lookupFleetNextTurnpointTarget,
  resolveNextTurnpointTarget,
  resolvePlaybackNextProgressIndex,
} from '../src/lib/nextTurnpoint';
import { computeTaskTiming } from '../src/lib/tracks';
import { getProgressIndexForCircle } from '../src/lib/taskMapStyle';
import { getUniqueTurnpointCircles } from '../src/lib/xctask';
import { resolveMapNextTurnpointCircle } from '../src/lib/nextTurnpoint';

const BUNDLE = 'tests/fixtures/xcdemon-680-2026-07-19-review.zip';

describe('fleet SSS next TP (Potato Hill 680)', () => {
  it('shows SSS as next from task start until first SSS exit, then TP2', async () => {
    const zip = readFileSync(BUNDLE);
    const { session } = await importSessionBundle(
      new File([zip], '680.zip', { type: 'application/zip' }),
    );
    const route = buildOptimizedRoute(session.task);
    const circles = getUniqueTurnpointCircles(session.task);
    const ref = session.tracks[0]?.points[0]?.time ?? new Date();
    const taskStart = getTaskStartTime(session.task, ref)!;
    const enriched = enrichTracksWithTaskProgress(session.tracks, session.task, route, taskStart);
    const timing = computeTaskTiming(session.task, enriched);
    const fleet = buildTaskNextTurnpointTimeline(enriched, route, timing.taskStart);

    const t0 = timing.taskStart.getTime();
    const sssName = route.progressTurnpoints[0]?.name;
    expect(sssName).toBeTruthy();

    const atStart = lookupFleetNextTurnpointTarget(fleet, route, t0);
    expect(atStart?.progressIndex).toBe(0);
    expect(atStart?.name).toBe(sssName);
    expect(resolveMapNextTurnpointCircle(route, circles, atStart)).toBeTruthy();

    const fleetExitMs = fleet.milestones.find((m) => m.nextProgressIndex === 1)?.timeMs;
    expect(fleetExitMs).toBeTruthy();
    if (!fleetExitMs) return;

    const beforeExit = lookupFleetNextTurnpointTarget(fleet, route, fleetExitMs - 1000);
    expect(beforeExit?.progressIndex).toBe(0);

    const afterExit = lookupFleetNextTurnpointTarget(fleet, route, fleetExitMs + 1000);
    expect(afterExit?.progressIndex).toBe(1);
    expect(afterExit?.name).toBe(route.progressTurnpoints[1]?.name);

    const ruy = enriched.find((t) => /ruy/i.test(t.pilotName));
    if (ruy?.verification.sssCrossTime) {
      const ruyExitMs = ruy.verification.sssCrossTime.getTime();
      expect(ruyExitMs - t0).toBeLessThan(30_000);
      expect(fleetExitMs).toBeLessThanOrEqual(ruyExitMs + 1000);
      const atRuyExit = lookupFleetNextTurnpointTarget(fleet, route, ruyExitMs + 500);
      expect(atRuyExit?.progressIndex).toBe(1);
    }

    const casey = enriched.find((t) => t.pilotName.toLowerCase().includes('casey'));
    expect(casey).toBeTruthy();
    if (!casey) return;

    const caseyExit = casey.verification.sssCrossTime?.getTime();
    expect(caseyExit).toBeTruthy();
    if (!caseyExit) return;

    const idxBefore = resolvePlaybackNextProgressIndex(fleet, casey, caseyExit - 2000);
    const idxAfter = resolvePlaybackNextProgressIndex(fleet, casey, caseyExit + 2000);
    expect(idxBefore).toBe(0);
    expect(idxAfter).toBe(1);

    const tp2Enter = casey.verification.crossings.find(
      (c) => c.inSequence && c.role === 'TURN' && c.direction === 'ENTER',
    );
    if (tp2Enter && tp2Enter.time.getTime() > caseyExit + 5000) {
      const between = resolvePlaybackNextProgressIndex(
        fleet,
        casey,
        caseyExit + Math.floor((tp2Enter.time.getTime() - caseyExit) / 2),
      );
      expect(between).toBe(1);
      expect(resolveNextTurnpointTarget(route, between)?.name).toBe(route.progressTurnpoints[1]?.name);
    }
  });
});
