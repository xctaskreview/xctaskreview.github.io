import { describe, expect, it } from 'vitest';
import {
  buildChartDistanceTicks,
  clampChartTaskDistanceDisplay,
  formatChartDistanceTick,
} from '../src/lib/chartAltitude';

describe('chart distance axis', () => {
  it('builds ticks that end exactly at the task distance', () => {
    const maxDistance = 30.293761332973567;
    const ticks = buildChartDistanceTicks(maxDistance);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(maxDistance);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(maxDistance);
  });

  it('formats the goal tick without rounding up past the task distance label', () => {
    const maxDistance = 30.293761332973567;
    expect(formatChartDistanceTick(maxDistance, maxDistance, 'km')).toBe('30.3');
  });

  it('clamps plotted distances to the task length', () => {
    expect(clampChartTaskDistanceDisplay(31.5, 30.293761332973567)).toBe(30.293761332973567);
  });
});
