import { describe, expect, it } from 'vitest';
import {
  buildTaskFieldTimeline,
  computeLeadPercentagesFromTimeline,
  fieldLeaderIdAt,
  fieldRunningMaxPercentAt,
  findFirstTimeFieldReachedPercent,
} from '../src/lib/taskTimeline';
import type { EnrichedFlightTrack, EnrichedTrackPoint } from '../src/lib/taskProgress';
import { computeFlyingModeTimeline } from '../src/lib/flyingMode';
import { createDefaultPreferences } from '../src/lib/preferences';

const TASK_START_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

/** Pilot whose task % rises by `percentPerSecond` from task start. */
function buildTrack(id: string, percentPerSecond: number, seconds: number): EnrichedFlightTrack {
  const points: EnrichedTrackPoint[] = Array.from({ length: seconds }, (_, index) => {
    const taskPercent = Math.min(100, index * percentPerSecond);
    return {
      lat: 46,
      lon: 7,
      alt: 1500,
      time: new Date(TASK_START_MS + index * 1000),
      timeMs: TASK_START_MS + index * 1000,
      taskPercent,
      legIndex: 1,
      hasStarted: true,
      finished: false,
      displayAlt: 1500,
      cumulativeDistanceM: index * 10,
      maxTaskPercentSoFar: taskPercent,
      altAtMaxTaskPercentSoFar: 1500,
    };
  });

  return {
    id,
    pilotName: id,
    firstName: id,
    fileName: `${id}.igc`,
    points,
    flyingModeTimeline: computeFlyingModeTimeline(
      points,
      {
        sampleMs: createDefaultPreferences().circlingDetectionSampleSec * 1000,
        turnRateDegPerS: createDefaultPreferences().circlingTurnRateDegPerS,
      },
    ),
  };
}

describe('buildTaskFieldTimeline', () => {
  const slow = buildTrack('slow', 0.5, 100);
  const fast = buildTrack('fast', 1, 100);
  const timeline = buildTaskFieldTimeline(
    [slow, fast],
    new Date(TASK_START_MS),
    new Date(TASK_START_MS + 99 * 1000),
  );

  it('records the running max of the field, never decreasing', () => {
    expect(fieldRunningMaxPercentAt(timeline, TASK_START_MS)).toBe(0);
    expect(fieldRunningMaxPercentAt(timeline, TASK_START_MS + 10 * 1000)).toBeCloseTo(10, 5);
    expect(fieldRunningMaxPercentAt(timeline, TASK_START_MS + 50 * 1000)).toBeCloseTo(50, 5);

    for (let offset = 1; offset < timeline.runningMaxPercent.length; offset += 1) {
      expect(timeline.runningMaxPercent[offset]).toBeGreaterThanOrEqual(
        timeline.runningMaxPercent[offset - 1],
      );
    }
  });

  it('names the pilot furthest along at each second', () => {
    expect(fieldLeaderIdAt(timeline, TASK_START_MS + 30 * 1000)).toBe('fast');
    expect(fieldLeaderIdAt(timeline, TASK_START_MS - 5000)).toBeNull();
  });

  it('finds the first time the field reached a target percent', () => {
    const reached = findFirstTimeFieldReachedPercent(timeline, 25);
    expect(reached?.getTime()).toBe(TASK_START_MS + 25 * 1000);
    expect(findFirstTimeFieldReachedPercent(timeline, 250)).toBeNull();
  });

  it('credits lead time to the pilot who was ahead', () => {
    const leadPercentages = computeLeadPercentagesFromTimeline(
      timeline,
      TASK_START_MS + 99 * 1000,
    );
    expect(leadPercentages.get('fast')).toBeGreaterThan(90);
    expect(leadPercentages.get('slow')).toBeLessThan(10);
  });

  it('stays inert without tracks or a task start', () => {
    const empty = buildTaskFieldTimeline([], new Date(TASK_START_MS), new Date(TASK_START_MS));
    expect(fieldRunningMaxPercentAt(empty, TASK_START_MS)).toBe(0);
    expect(fieldLeaderIdAt(empty, TASK_START_MS)).toBeNull();
    expect(findFirstTimeFieldReachedPercent(empty, 10)).toBeNull();
    expect(fieldLeaderIdAt(buildTaskFieldTimeline([slow], undefined, new Date()), TASK_START_MS))
      .toBeNull();
  });
});
