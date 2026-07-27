import { describe, expect, it } from 'vitest';
import { computeTurnpointReachTimes } from '../src/lib/taskProgressMarker';
import { buildPilotNextTurnpointMilestones } from '../src/lib/nextTurnpoint';
import { buildOptimizedRoute, parseXcTask } from '../src/lib/xctask';
import { readFileSync } from 'fs';
import type { EnrichedFlightTrack } from '../src/lib/taskProgress';
import { EMPTY_PILOT_VERIFICATION } from './helpers/emptyVerification';
import { computeFlyingModeTimeline } from '../src/lib/flyingMode';
import { createDefaultPreferences } from '../src/lib/preferences';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);

describe('computeTurnpointReachTimes crossing times', () => {
  it('uses verification enter times even when legIndex lags until after the gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const taskStartMs = Date.parse('2026-03-21T16:00:00.000Z');
    const enterBeforeGateMs = taskStartMs - 120_000;
    const startIndex = route.sssIndex;
    const tp2Index = startIndex + 1;

    const verification = {
      ...EMPTY_PILOT_VERIFICATION,
      crossings: [
        {
          turnpointIndex: startIndex,
          name: 'JP001',
          role: 'SSS' as const,
          direction: 'EXIT' as const,
          time: new Date(taskStartMs - 180_000),
          inSequence: true,
        },
        {
          turnpointIndex: tp2Index,
          name: 'TP2',
          role: 'TURN' as const,
          direction: 'ENTER' as const,
          time: new Date(enterBeforeGateMs),
          inSequence: true,
        },
      ],
      sssCrossTime: new Date(taskStartMs - 180_000),
    };

    const milestones = buildPilotNextTurnpointMilestones(verification, route, taskStartMs);
    expect(milestones.find((m) => m.nextProgressIndex === 2)?.timeMs).toBe(enterBeforeGateMs);

    const track: EnrichedFlightTrack = {
      id: 't',
      pilotName: 'Test',
      firstName: 'Test',
      fileName: 't.igc',
      points: [],
      flyingModeTimeline: computeFlyingModeTimeline([], {
        sampleMs: createDefaultPreferences().circlingDetectionSampleSec * 1000,
        turnRateDegPerS: createDefaultPreferences().circlingTurnRateDegPerS,
      }),
      verification,
      nextTurnpointMilestones: milestones,
      taskStartMs,
    };

    const markers = computeTurnpointReachTimes(
      [track],
      route,
      new Date(taskStartMs),
      new Date(taskStartMs + 3600_000),
      [],
      { trackIds: [], startSecond: 0, endSecond: 0, runningMaxPercent: new Float32Array(0), leaderIndex: new Int16Array(0) },
    );

    const tagged = markers.find((m) => m.index === 1);
    expect(tagged?.time.getTime()).toBe(enterBeforeGateMs);
  });
});
