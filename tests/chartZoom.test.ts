import { describe, expect, it } from 'vitest';
import {
  buildChartDistanceTicks,
  chartClientXToTaskDistanceDisplay,
  isFullChartDistanceDomain,
  panChartDistanceDomain,
  zoomChartDistanceDomain,
} from '../src/lib/chartAltitude';

describe('zoomChartDistanceDomain', () => {
  it('narrows around the cursor when zooming in', () => {
    const next = zoomChartDistanceDomain([0, 100], 100, 50, 0.5);
    expect(next[1] - next[0]).toBeLessThan(100);
    expect(next[0]).toBeGreaterThanOrEqual(0);
    expect(next[1]).toBeLessThanOrEqual(100);
  });

  it('returns full domain when zoomed out from full view', () => {
    const next = zoomChartDistanceDomain([0, 100], 100, 50, 1.5);
    expect(isFullChartDistanceDomain(next, 100)).toBe(true);
  });
});

describe('chartClientXToTaskDistanceDisplay with domain', () => {
  it('maps the plot center to the domain midpoint', () => {
    const plotWidth = 200;
    const marginLeft = 8;
    const marginRight = 12;
    const yAxisWidth = 56;
    const hostLeft = 100;
    const plotInnerLeft = hostLeft + marginLeft + yAxisWidth;
    const plotInnerWidth = plotWidth - marginLeft - marginRight - yAxisWidth;
    const clientX = plotInnerLeft + plotInnerWidth / 2;
    const hostRect = { left: hostLeft, top: 0, width: plotWidth, height: 100 } as DOMRect;
    const distance = chartClientXToTaskDistanceDisplay(
      clientX,
      hostRect,
      plotWidth,
      100,
      marginLeft,
      marginRight,
      yAxisWidth,
      20,
      80,
    );
    expect(distance).toBeCloseTo(50, 5);
  });
});

describe('buildChartDistanceTicks', () => {
  it('includes min and max for a zoom window on a 20 km step grid', () => {
    expect(buildChartDistanceTicks(80, 5, 20)).toEqual([20, 40, 60, 80]);
  });
});

describe('panChartDistanceDomain', () => {
  it('shifts left when dragging the chart right', () => {
    const next = panChartDistanceDomain([20, 80], 100, -10);
    expect(next[0]).toBe(10);
    expect(next[1]).toBe(70);
  });

  it('clamps at task start', () => {
    const next = panChartDistanceDomain([5, 55], 100, -20);
    expect(next).toEqual([0, 50]);
  });
});
