import { describe, expect, it } from 'vitest';
import { timeMsToLinearPercent, timeMsToSliderPercent } from '../src/lib/sliderTrack';

describe('timeMsToSliderPercent', () => {
  const start = 0;
  const end = 1000;
  const width = 200;

  it('places the thumb center at the inset when value is min', () => {
    expect(timeMsToSliderPercent(start, end, start, width)).toBe(4);
  });

  it('places the thumb center at width minus inset when value is max', () => {
    expect(timeMsToSliderPercent(start, end, end, width)).toBe(96);
  });

  it('places mid time at the center of the shell', () => {
    expect(timeMsToSliderPercent(start, end, 500, width)).toBe(50);
  });

  it('matches linear mapping when inset is zero', () => {
    expect(timeMsToSliderPercent(start, end, 250, 0)).toBe(0);
    expect(timeMsToLinearPercent(start, end, 250)).toBe(25);
  });
});
