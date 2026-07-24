import { describe, expect, it } from 'vitest';
import {
  buildChartDistanceTicks,
  buildChartPathPixels,
  buildChartPolylineD,
  CHART_TROPHY_SIZE,
  chartClientXToTaskDistanceDisplay,
  chartPathLengthAtTime,
  chartPilotLabelOffsetX,
  chartPlotRect,
  clampChartTaskDistanceDisplay,
  countTaggedTurnpoints,
  formatChartDistanceTick,
  hasChartMaxProgressLink,
  isLeadingChartPilot,
  isTurnpointTagged,
  roundChartPixel,
  taskDistanceDisplayToPercent,
} from '../src/lib/chartAltitude';

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
    expect(isTurnpointTagged(turnpoints[0], 1, 4, 100)).toBe(false);
    expect(isTurnpointTagged(turnpoints[3], 1, 4, 100)).toBe(false);
  });

  it('tags a turnpoint once progress reaches it', () => {
    expect(isTurnpointTagged(turnpoints[1], 1, 4, 24.9)).toBe(false);
    expect(isTurnpointTagged(turnpoints[1], 1, 4, 25)).toBe(true);
    expect(isTurnpointTagged(turnpoints[1], 1, 4, 80)).toBe(true);
  });

  it('tags nothing before the task has started', () => {
    expect(isTurnpointTagged(turnpoints[1], 1, 4, 0)).toBe(false);
    expect(countTaggedTurnpoints(turnpoints, 1, 4, 0)).toBe(0);
  });

  it('counts a value that only changes when the tagged set changes', () => {
    expect(countTaggedTurnpoints(turnpoints, 1, 4, 10)).toBe(0);
    expect(countTaggedTurnpoints(turnpoints, 1, 4, 25)).toBe(1);
    expect(countTaggedTurnpoints(turnpoints, 1, 4, 59.9)).toBe(1);
    expect(countTaggedTurnpoints(turnpoints, 1, 4, 60)).toBe(2);
    expect(countTaggedTurnpoints(turnpoints, 1, 4, 100)).toBe(2);
  });
});
