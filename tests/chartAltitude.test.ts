import { describe, expect, it } from 'vitest';
import {
  buildChartAltitudeTicks,
  buildChartDistanceTicks,
  buildChartPathPixels,
  buildChartPolylineD,
  CHART_TROPHY_SIZE,
  chartClientXToTaskDistanceDisplay,
  chartPathLengthAtTime,
  chartPilotLabelOffsetX,
  chartPlotRect,
  clampChartTaskDistanceDisplay,
  countChartTaggedTurnpointsByMilestone,
  formatChartAltitudeAxisTick,
  formatChartDistanceAxisTick,
  formatChartDistanceTick,
  hasChartMaxProgressLink,
  isChartTurnpointTaggedByMilestone,
  followChartDistanceDomainOnPilot,
  isLeadingChartPilot,
  roundChartPixel,
  taskDistanceDisplayToPercent,
} from '../src/lib/chartAltitude';
import { chartMaxTaskPercentForDisplay } from '../src/lib/taskProgress';

describe('chart path pixels', () => {
  it('builds a path string and cumulative segment lengths', () => {
    const toX = (value: number) => value * 10;
    const toY = (value: number) => value * 2;
    const pixels = buildChartPathPixels(
      [
        { taskDistance: 0, altitude: 0 },
        { taskDistance: 3, altitude: 4 },
        { taskDistance: 3, altitude: 8 },
      ],
      toX,
      toY,
    );

    expect(pixels.d).toBe('M0,0L30,8L30,16');
    expect(pixels.cumulativeLength[0]).toBe(0);
    expect(pixels.cumulativeLength[1]).toBeCloseTo(Math.hypot(30, 8), 5);
    expect(pixels.cumulativeLength[2]).toBeCloseTo(Math.hypot(30, 8) + 8, 5);
    expect(pixels.totalLength).toBeCloseTo(Math.hypot(30, 8) + 8, 5);
  });

  it('interpolates flown length between path vertices by time', () => {
    const pixels = buildChartPathPixels(
      [
        { taskDistance: 0, altitude: 0 },
        { taskDistance: 10, altitude: 0 },
      ],
      (x) => x,
      () => 0,
    );
    const timesMs = new Float64Array([0, 1000]);

    expect(chartPathLengthAtTime(pixels, timesMs, 500, 0)).toBeCloseTo(5, 5);
    expect(chartPathLengthAtTime(pixels, timesMs, 1000, 0)).toBeCloseTo(10, 5);
    expect(chartPathLengthAtTime(pixels, timesMs, 2000, 0)).toBeCloseTo(10, 5);
    expect(chartPathLengthAtTime(pixels, timesMs, 500, -1)).toBe(0);
  });
});

describe('chart distance axis', () => {
  it('builds round distance ticks within the task length', () => {
    const maxDistance = 30.293761332973567;
    const ticks = buildChartDistanceTicks(maxDistance);
    expect(ticks).toEqual([0, 10, 20, 30]);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(maxDistance);
  });

  it('uses coarse steps for long tasks and finer steps when zoomed in', () => {
    expect(buildChartDistanceTicks(100)).toEqual([0, 50, 100]);
    expect(buildChartDistanceTicks(80, 5, 20)).toEqual([20, 40, 60, 80]);
    expect(buildChartDistanceTicks(30)).toEqual([0, 10, 20, 30]);
    expect(buildChartDistanceTicks(22)).toEqual([0, 5, 10, 15, 20]);
    expect(buildChartDistanceTicks(4, 5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(buildChartDistanceTicks(14, 5, 10)).toEqual([10, 11, 12, 13, 14]);
  });

  it('formats axis ticks in thousands', () => {
    expect(formatChartDistanceAxisTick(10)).toBe('10');
    expect(formatChartDistanceAxisTick(30.293761332973567)).toBe('30');
    expect(formatChartAltitudeAxisTick(2500)).toBe('3k');
  });

  it('limits altitude ticks to at most five labels', () => {
    const ticks = buildChartAltitudeTicks(1000, 9000);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]).toBe(1000);
    expect(ticks.at(-1)).toBe(9000);
    expect(buildChartAltitudeTicks(1000, 9000)).toEqual([1000, 2500, 5000, 7500, 9000]);
  });

  it('formats the goal tick without rounding up past the task distance label', () => {
    const maxDistance = 30.293761332973567;
    expect(formatChartDistanceTick(maxDistance, maxDistance, 'km')).toBe('30.3');
  });

  it('clamps plotted distances to the task length', () => {
    expect(clampChartTaskDistanceDisplay(31.5, 30.293761332973567)).toBe(30.293761332973567);
  });

  it('maps chart pointer x to task distance along the plot width', () => {
    const maxDistance = 100;
    const plotWidth = 400;
    const marginLeft = 8;
    const marginRight = 12;
    const yAxisWidth = 56;
    const plotInnerLeft = marginLeft + yAxisWidth;
    const plotInnerWidth = plotWidth - marginLeft - marginRight - yAxisWidth;
    const hostRect = { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) };
    const clientX = plotInnerLeft + plotInnerWidth / 2;
    const distance = chartClientXToTaskDistanceDisplay(
      clientX,
      hostRect as DOMRect,
      plotWidth,
      maxDistance,
      marginLeft,
      marginRight,
      yAxisWidth,
    );
    expect(distance).toBeCloseTo(50, 5);
    expect(taskDistanceDisplayToPercent(distance, maxDistance)).toBeCloseTo(50, 5);
  });
});

describe('chart polyline', () => {
  it('builds a plain polyline through every point', () => {
    const d = buildChartPolylineD(
      [
        { taskDistance: 0, altitude: 0 },
        { taskDistance: 1, altitude: 2 },
        { taskDistance: 2, altitude: 4 },
      ],
      (value) => value * 10,
      (value) => value * 5,
    );

    expect(d).toBe('M0,0L10,10L20,20');
  });

  it('rounds to sub-pixel precision so an unmoved point rewrites the same string', () => {
    expect(roundChartPixel(12.34567)).toBe(12.35);
    expect(
      buildChartPolylineD(
        [
          { taskDistance: 0, altitude: 0 },
          { taskDistance: 1, altitude: 1 },
        ],
        (value) => value * 12.345678,
        (value) => value * 0.1,
      ),
    ).toBe('M0,0L12.35,0.1');
  });

  it('returns nothing for a trail that has no segment yet', () => {
    expect(buildChartPolylineD([], (x) => x, (y) => y)).toBe('');
    expect(buildChartPolylineD([{ taskDistance: 1, altitude: 1 }], (x) => x, (y) => y)).toBe('');
  });
});

describe('chart plot rect', () => {
  it('reads the plot area from the axis ranges, y axis being inverted', () => {
    const rect = chartPlotRect([64, 400], [188, 12]);

    expect(rect).toEqual({
      left: 64,
      right: 400,
      top: 12,
      bottom: 188,
      width: 336,
      height: 176,
    });
  });
});

describe('pilot marker layout', () => {
  it('shifts the name label past the trophy for the leader only', () => {
    expect(chartPilotLabelOffsetX(false)).toBe(10);
    expect(chartPilotLabelOffsetX(true)).toBe(10 + CHART_TROPHY_SIZE + 2);
  });
});

describe('max progress link', () => {
  it('hides the link while the pilot sits on their own best progress', () => {
    expect(hasChartMaxProgressLink(10, 1500, 10, 1500)).toBe(false);
    expect(hasChartMaxProgressLink(10, 1500, 10.005, 1500.5)).toBe(false);
  });

  it('shows the link once distance or altitude has drifted', () => {
    expect(hasChartMaxProgressLink(10, 1500, 10.02, 1500)).toBe(true);
    expect(hasChartMaxProgressLink(10, 1500, 10, 1502)).toBe(true);
  });
});

describe('chart leader selection', () => {
  it('takes the first pilot seen when there is no leader yet', () => {
    expect(isLeadingChartPilot(0, 'Ana', 0, null)).toBe(true);
  });

  it('prefers the pilot furthest along the task', () => {
    expect(isLeadingChartPilot(51, 'Zoe', 50, 'Ana')).toBe(true);
    expect(isLeadingChartPilot(49, 'Ana', 50, 'Zoe')).toBe(false);
  });

  it('breaks ties on name so the badge does not flicker between equal pilots', () => {
    expect(isLeadingChartPilot(50, 'Ana', 50, 'Zoe')).toBe(true);
    expect(isLeadingChartPilot(50, 'Zoe', 50, 'Ana')).toBe(false);
  });
});

describe('tagged turnpoints', () => {
  const turnpoints = [
    { number: 1, taskPercent: 0 },
    { number: 2, taskPercent: 25 },
    { number: 3, taskPercent: 60 },
    { number: 4, taskPercent: 100 },
  ];

  it('never tags the start or the goal', () => {
    expect(isChartTurnpointTaggedByMilestone(0, 1, 1, 4, 4)).toBe(false);
    expect(isChartTurnpointTaggedByMilestone(3, 4, 1, 4, 4)).toBe(false);
  });

  it('tags a turnpoint once the fleet milestone passes it', () => {
    expect(isChartTurnpointTaggedByMilestone(1, 2, 1, 4, 1)).toBe(false);
    expect(isChartTurnpointTaggedByMilestone(1, 2, 1, 4, 2)).toBe(true);
    expect(isChartTurnpointTaggedByMilestone(2, 3, 1, 4, 2)).toBe(false);
    expect(isChartTurnpointTaggedByMilestone(2, 3, 1, 4, 3)).toBe(true);
  });

  it('counts tagged turnpoints from milestones', () => {
    expect(countChartTaggedTurnpointsByMilestone(turnpoints, 1, 4, 0)).toBe(0);
    expect(countChartTaggedTurnpointsByMilestone(turnpoints, 1, 4, 2)).toBe(1);
    expect(countChartTaggedTurnpointsByMilestone(turnpoints, 1, 4, 3)).toBe(2);
    expect(countChartTaggedTurnpointsByMilestone(turnpoints, 1, 4, 4)).toBe(2);
  });
});

describe('followChartDistanceDomainOnPilot', () => {
  it('does nothing when the chart shows the full task', () => {
    expect(followChartDistanceDomainOnPilot(null, 100, 40)).toBeNull();
    expect(followChartDistanceDomainOnPilot([0, 100], 100, 40)).toBeNull();
  });

  it('pans a zoomed window to center on the pilot', () => {
    expect(followChartDistanceDomainOnPilot([10, 30], 100, 25)).toEqual([15, 35]);
  });

  it('clamps pan at task start and end', () => {
    expect(followChartDistanceDomainOnPilot([10, 30], 100, 5)).toEqual([0, 20]);
    expect(followChartDistanceDomainOnPilot([70, 90], 100, 95)).toEqual([80, 100]);
  });
});

describe('chart task progress display', () => {
  it('does not snap markers to 100% when the goal flag is set but geometry is short', () => {
    expect(chartMaxTaskPercentForDisplay(99.2, 100)).toBe(99.2);
    expect(chartMaxTaskPercentForDisplay(100, 100)).toBe(100);
    expect(chartMaxTaskPercentForDisplay(96, 94)).toBe(96);
  });
});
