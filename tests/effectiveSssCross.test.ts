import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buildOptimizedRoute, getTaskStartTime, parseXcTask } from '../src/lib/xctask';
import {
  computePilotTaskVerification,
  resolveEffectiveSssCrossTime,
} from '../src/lib/taskVerification';
import type { TrackPoint } from '../src/lib/types';
import { lookupPilotNextTurnpointTarget } from '../src/lib/nextTurnpoint';
import { enrichTrackWithTaskProgress } from '../src/lib/taskProgress';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);

function point(time: Date, lat: number, lon: number): TrackPoint {
  return { time, lat, lon, alt: 1000 };
}

describe('resolveEffectiveSssCrossTime', () => {
  it('uses the latest SSS exit before the next TP enter', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const referenceDate = new Date('2026-03-21T12:00:00.000Z');
    const taskStart = getTaskStartTime(task, referenceDate)!;
    const sss = route.sssCenter;
    const earlyExit = new Date(taskStart.getTime() - 120_000);
    const lateExit = new Date(taskStart.getTime() + 83_000);

    const points = [
      point(new Date(earlyExit.getTime() - 60_000), sss.lat, sss.lon),
      point(earlyExit, -23.85, -50.35),
      point(new Date(taskStart.getTime() + 30_000), sss.lat, sss.lon),
      point(new Date(taskStart.getTime() + 60_000), sss.lat, sss.lon),
      point(lateExit, -23.86, -50.36),
    ];

    const { verification } = computePilotTaskVerification(
      points,
      task,
      route,
      referenceDate,
      taskStart.getTime(),
    );

    expect(resolveEffectiveSssCrossTime(verification.crossings, route)?.getTime()).toBe(
      lateExit.getTime(),
    );
    expect(verification.sssCrossTime?.getTime()).toBe(lateExit.getTime());
    expect(verification.earlyStart).toBe(false);

    const enriched = enrichTrackWithTaskProgress(
      { id: 't', pilotName: 'Test', fileName: 't.igc', points },
      task,
      route,
      taskStart,
    );

    const taskStartMs = taskStart.getTime();
    expect(
      lookupPilotNextTurnpointTarget(
        enriched.nextTurnpointMilestones,
        route,
        taskStartMs,
        taskStartMs + 60_000,
      )?.progressIndex,
    ).toBe(0);
    expect(
      lookupPilotNextTurnpointTarget(
        enriched.nextTurnpointMilestones,
        route,
        taskStartMs,
        lateExit.getTime() + 1000,
      )?.progressIndex,
    ).toBe(1);
  });
});
