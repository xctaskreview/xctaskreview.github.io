import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  enrichTracksWithTaskProgress,
  formatSssCrossDelaySec,
  getPilotSssCrossDelaySec,
} from '../src/lib/taskProgress';
import { buildOptimizedRoute, getTaskStartTime, parseXcTask } from '../src/lib/xctask';
import { computePilotTaskVerification } from '../src/lib/taskVerification';
import type { TrackPoint } from '../src/lib/types';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);

function point(time: string, lat: number, lon: number): TrackPoint {
  return { time: new Date(time), lat, lon, alt: 1000 };
}

describe('getPilotSssCrossDelaySec', () => {
  it('is positive (early) when SSS was crossed before the start gate', () => {
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

    const track = {
      id: 't',
      pilotName: 'Test',
      firstName: 'Test',
      fileName: 't.igc',
      points: [],
      verification,
    } as Parameters<typeof getPilotSssCrossDelaySec>[0];

    expect(getPilotSssCrossDelaySec(track, taskStart)).toBe(90);
    expect(formatSssCrossDelaySec(90)).toBe('+01:30');
  });

  it('is negative (late) when SSS exit is after the assigned gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const referenceDate = new Date('2026-03-21T12:00:00.000Z');
    const taskStart = getTaskStartTime(task, referenceDate)!;
    const sss = route.sssCenter;

    const points = [
      point(new Date(taskStart.getTime() - 120_000), sss.lat, sss.lon),
      point(new Date(taskStart.getTime() + 60_000), sss.lat, sss.lon),
      point(new Date(taskStart.getTime() + 83_000), -23.85, -50.35),
    ];

    const enriched = enrichTracksWithTaskProgress(
      [{ id: 't', pilotName: 'Test', fileName: 't.igc', points }],
      task,
      route,
      taskStart,
    );

    expect(getPilotSssCrossDelaySec(enriched[0]!, taskStart)).toBe(-83);
    expect(formatSssCrossDelaySec(-83)).toBe('-01:23');
  });
});
