import { describe, expect, it } from 'vitest';
import {
  REVIEW_PLAYBACK_STEP_MS,
  seekPlaybackByDelta,
  seekTurnpointTime,
  stepPlaybackSpeed,
} from '../src/lib/reviewKeyboard';

describe('stepPlaybackSpeed', () => {
  it('steps through playback speeds', () => {
    expect(stepPlaybackSpeed(50, 1)).toBe(100);
    expect(stepPlaybackSpeed(50, -1)).toBe(20);
    expect(stepPlaybackSpeed(1, -1)).toBe(1);
    expect(stepPlaybackSpeed(100, 1)).toBe(100);
  });
});

describe('seekPlaybackByDelta', () => {
  it('steps within track bounds', () => {
    expect(
      seekPlaybackByDelta(10_000, REVIEW_PLAYBACK_STEP_MS, 0, 100_000).getTime(),
    ).toBe(40_000);
    expect(
      seekPlaybackByDelta(10_000, -REVIEW_PLAYBACK_STEP_MS, 0, 100_000).getTime(),
    ).toBe(0);
    expect(seekPlaybackByDelta(95_000, REVIEW_PLAYBACK_STEP_MS, 0, 100_000).getTime()).toBe(
      100_000,
    );
  });
});

describe('seekTurnpointTime', () => {
  const start = 500;
  const points = [start, 1000, 2000, 3000];

  it('seeks forward to the next marker', () => {
    expect(seekTurnpointTime(1500, points, 1)?.getTime()).toBe(2000);
    expect(seekTurnpointTime(3000, points, 1)?.getTime()).toBe(3000);
  });

  it('seeks backward to the previous marker', () => {
    expect(seekTurnpointTime(2500, points, -1)?.getTime()).toBe(2000);
    expect(seekTurnpointTime(1000, points, -1)?.getTime()).toBe(start);
    expect(seekTurnpointTime(start, points, -1)?.getTime()).toBe(start);
  });
});
