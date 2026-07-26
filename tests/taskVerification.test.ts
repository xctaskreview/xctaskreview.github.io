import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buildOptimizedRoute, getTaskStartTime, parseXcTask } from '../src/lib/xctask';
import { computePilotTaskVerification } from '../src/lib/taskVerification';
import type { TrackPoint } from '../src/lib/types';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);

function point(time: string, lat: number, lon: number): TrackPoint {
  return { time: new Date(time), lat, lon, alt: 1000 };
}

describe('taskVerification', () => {
  it('includes separate ESS and goal indices on Japira task route', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    expect(route.essTurnpointIndex).toBe(6);
    expect(route.goalIndex).toBe(7);
    expect(route.progressTurnpoints.length).toBe(7);
  });

  it('detects SSS exit and assigns start gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const referenceDate = new Date('2026-03-21T12:00:00.000Z');
    const taskStart = getTaskStartTime(task, referenceDate)!;
    const sss = route.sssCenter;

    const points = [
      point(new Date(taskStart.getTime() - 120_000), sss.lat, sss.lon),
      point(new Date(taskStart.getTime() + 60_000), sss.lat, sss.lon),
      point(new Date(taskStart.getTime() + 120_000), -23.85, -50.35),
    ];

    const { verification, pointStates } = computePilotTaskVerification(
      points,
      task,
      route,
      referenceDate,
      taskStart.getTime(),
    );

    expect(verification.sssCrossTime).not.toBeNull();
    expect(verification.assignedStartGate).toBe('13:00:00');
    expect(verification.earlyStart).toBe(false);
    expect(pointStates.at(-1)?.hasStarted).toBe(true);
  });

  it('flags early start before first gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const referenceDate = new Date('2026-03-21T12:00:00.000Z');
    const taskStart = getTaskStartTime(task, referenceDate)!;
    const sss = route.sssCenter;
    const crossTime = new Date(taskStart.getTime() - 90_000);

    const points = [
      point(new Date(crossTime.getTime() - 60_000), sss.lat, sss.lon),
      point(crossTime, -23.85, -50.35),
    ];

    const { verification } = computePilotTaskVerification(
      points,
      task,
      route,
      referenceDate,
      taskStart.getTime(),
    );

    expect(verification.earlyStart).toBe(true);
    expect(verification.earlyStartSeconds).toBeGreaterThan(0);
  });

  it('treats early SSS exit as started after the task start gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const referenceDate = new Date('2026-03-21T12:00:00.000Z');
    const taskStart = getTaskStartTime(task, referenceDate)!;
    const sss = route.sssCenter;
    const crossTime = new Date(taskStart.getTime() - 90_000);

    const points = [
      point(new Date(crossTime.getTime() - 60_000), sss.lat, sss.lon),
      point(crossTime, -23.85, -50.35),
      point(new Date(taskStart.getTime() + 60_000), -23.86, -50.36),
    ];

    const { verification, pointStates } = computePilotTaskVerification(
      points,
      task,
      route,
      referenceDate,
      taskStart.getTime(),
    );

    expect(verification.earlyStart).toBe(true);
    expect(pointStates[1]?.hasStarted).toBe(false);
    expect(pointStates.at(-1)?.hasStarted).toBe(true);
    expect(pointStates.at(-1)?.legIndex).toBe(0);
  });
});
