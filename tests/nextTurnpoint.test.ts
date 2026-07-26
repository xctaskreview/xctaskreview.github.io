import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  buildPilotNextTurnpointMilestones,
  buildTaskNextTurnpointTimeline,
  lookupFleetNextTurnpointTarget,
  lookupNextProgressIndex,
  lookupPilotNextTurnpointTarget,
} from '../src/lib/nextTurnpoint';
import { enrichTrackWithTaskProgress } from '../src/lib/taskProgress';
import { parseIgc } from '../src/lib/igc';
import { buildOptimizedRoute, getTaskStartTime, parseXcTask } from '../src/lib/xctask';
import { EMPTY_PILOT_VERIFICATION } from './helpers/emptyVerification';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);
const WILSON_IGC = new URL(
  '../tmp/civl-japira/tracks/2026-03-21-WILSON-ROBERTO-KOTZRIEB.63820.igc',
  import.meta.url,
);

describe('next turnpoint milestones', () => {
  it('starts at SSS on task start and advances on SSS exit then TP enter', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const taskStart = getTaskStartTime(task, new Date('2026-03-21T12:00:00.000Z'))!;

    let igcText: string;
    try {
      igcText = readFileSync(WILSON_IGC, 'utf8');
    } catch {
      return;
    }

    const track = parseIgc(igcText, 'wilson.igc');
    const enriched = enrichTrackWithTaskProgress(track, task, route, taskStart);
    const taskStartMs = taskStart.getTime();

    expect(lookupNextProgressIndex(enriched.nextTurnpointMilestones, taskStartMs, taskStartMs)).toBe(
      0,
    );

    const sssExit = enriched.verification.sssCrossTime;
    expect(sssExit).toBeTruthy();
    if (!sssExit) return;

    const beforeExitMs = sssExit.getTime() - 1000;
    expect(
      lookupPilotNextTurnpointTarget(enriched.nextTurnpointMilestones, route, taskStartMs, beforeExitMs)
        ?.progressIndex,
    ).toBe(0);

    const afterExitMs = sssExit.getTime() + 1000;
    expect(
      lookupPilotNextTurnpointTarget(enriched.nextTurnpointMilestones, route, taskStartMs, afterExitMs)
        ?.progressIndex,
    ).toBe(1);

    const firstEnter = enriched.verification.crossings.find(
      (crossing) => crossing.inSequence && crossing.role === 'TURN' && crossing.direction === 'ENTER',
    );
    expect(firstEnter).toBeTruthy();
    if (!firstEnter) return;

    const afterFirstEnterMs = firstEnter.time.getTime() + 1000;
    expect(
      lookupPilotNextTurnpointTarget(
        enriched.nextTurnpointMilestones,
        route,
        taskStartMs,
        afterFirstEnterMs,
      )?.progressIndex,
    ).toBe(2);
  });

  it('fleet timeline uses earliest pilot time to leave SSS phase', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const taskStart = getTaskStartTime(task, new Date('2026-03-21T12:00:00.000Z'))!;
    const taskStartMs = taskStart.getTime();

    const earlyExitMs = taskStartMs + 120_000;
    const lateExitMs = taskStartMs + 180_000;

    const pilotEarly = {
      id: 'early',
      pilotName: 'Early',
      firstName: 'Early',
      fileName: 'early.igc',
      points: [],
      flyingModeTimeline: { startTimeMs: taskStartMs, seconds: [] },
      verification: EMPTY_PILOT_VERIFICATION,
      nextTurnpointMilestones: buildPilotNextTurnpointMilestones(
        {
          ...EMPTY_PILOT_VERIFICATION,
          crossings: [
            {
              turnpointIndex: route.sssIndex,
              name: 'JP001',
              role: 'SSS',
              direction: 'EXIT',
              time: new Date(earlyExitMs),
              inSequence: true,
            },
          ],
          sssCrossTime: new Date(earlyExitMs),
        },
        route,
        taskStartMs,
      ),
    };

    const pilotLate = {
      ...pilotEarly,
      id: 'late',
      nextTurnpointMilestones: buildPilotNextTurnpointMilestones(
        {
          ...EMPTY_PILOT_VERIFICATION,
          crossings: [
            {
              turnpointIndex: route.sssIndex,
              name: 'JP001',
              role: 'SSS',
              direction: 'EXIT',
              time: new Date(lateExitMs),
              inSequence: true,
            },
          ],
          sssCrossTime: new Date(lateExitMs),
        },
        route,
        taskStartMs,
      ),
    };

    const fleet = buildTaskNextTurnpointTimeline([pilotEarly, pilotLate], route, taskStart);
    expect(fleet.milestones.find((entry) => entry.nextProgressIndex === 1)?.timeMs).toBe(
      earlyExitMs,
    );

    expect(lookupFleetNextTurnpointTarget(fleet, route, taskStartMs + 150_000)?.progressIndex).toBe(
      1,
    );
  });

  it('advances next TP after SSS exit before the task start gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const taskStart = getTaskStartTime(task, new Date('2026-03-21T12:00:00.000Z'))!;
    const taskStartMs = taskStart.getTime();
    const earlyExitMs = taskStartMs - 90_000;

    const milestones = buildPilotNextTurnpointMilestones(
      {
        ...EMPTY_PILOT_VERIFICATION,
        crossings: [
          {
            turnpointIndex: route.sssIndex,
            name: 'JP001',
            role: 'SSS',
            direction: 'EXIT',
            time: new Date(earlyExitMs),
            inSequence: true,
          },
        ],
        sssCrossTime: new Date(earlyExitMs),
      },
      route,
      taskStartMs,
    );

    expect(lookupNextProgressIndex(milestones, taskStartMs, taskStartMs + 60_000)).toBe(1);
    expect(
      lookupPilotNextTurnpointTarget(milestones, route, taskStartMs, taskStartMs + 60_000)
        ?.progressIndex,
    ).toBe(1);
  });
});
