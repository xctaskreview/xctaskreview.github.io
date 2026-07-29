import { isFlyingAltitudeMeters } from './geo';
import { chartAltitudeStep, metersToAltitudeUnit, type AltitudeUnit, type DistanceUnit } from './preferences';
import type { EnrichedFlightTrack } from './taskProgress';

export function clampChartTaskDistanceDisplay(value: number, maxDistance: number): number {
  if (!Number.isFinite(value) || maxDistance <= 0) return 0;
  return Math.min(Math.max(0, value), maxDistance);
}

export function chartClientXToTaskDistanceDisplay(
  clientX: number,
  hostRect: DOMRect,
  plotWidth: number,
  maxDistance: number,
  marginLeft: number,
  marginRight: number,
  yAxisWidth: number,
  domainMin = 0,
  domainMax?: number,
): number {
  if (plotWidth <= 0 || maxDistance <= 0) return 0;

  const domainHigh = domainMax ?? maxDistance;
  const domainSpan = domainHigh - domainMin;
  if (domainSpan <= 0) return domainMin;

  const plotInnerLeft = hostRect.left + marginLeft + yAxisWidth;
  const plotInnerWidth = plotWidth - marginLeft - marginRight - yAxisWidth;
  if (plotInnerWidth <= 0) return domainMin;

  const fraction = (clientX - plotInnerLeft) / plotInnerWidth;
  return clampChartTaskDistanceDisplay(domainMin + fraction * domainSpan, maxDistance);
}

const MIN_ZOOM_SPAN_FRACTION = 0.02;

/** Zoom the visible distance window; scale < 1 narrows (zoom in), > 1 widens (zoom out). */
export function zoomChartDistanceDomain(
  domain: [number, number],
  fullMax: number,
  center: number,
  scale: number,
): [number, number] {
  if (fullMax <= 0) return [0, 0];

  const [min, max] = domain;
  const span = Math.max(max - min, fullMax * MIN_ZOOM_SPAN_FRACTION);
  const minSpan = fullMax * MIN_ZOOM_SPAN_FRACTION;
  const newSpan = Math.min(fullMax, Math.max(minSpan, span * scale));
  const ratio = span > 0 ? (center - min) / span : 0.5;

  let newMin = center - ratio * newSpan;
  let newMax = newMin + newSpan;

  if (newMin < 0) {
    newMin = 0;
    newMax = newSpan;
  }
  if (newMax > fullMax) {
    newMax = fullMax;
    newMin = fullMax - newSpan;
  }

  return [newMin, newMax];
}

export function isFullChartDistanceDomain(
  domain: [number, number],
  fullMax: number,
  epsilon = 0.001,
): boolean {
  return domain[0] <= epsilon && domain[1] >= fullMax - epsilon;
}

/** Pan a zoomed chart window to follow a pilot; leaves full-task view unchanged. */
export function followChartDistanceDomainOnPilot(
  domain: [number, number] | null,
  fullMax: number,
  centerDistance: number,
  epsilon = 0.08,
): [number, number] | null {
  if (!domain || fullMax <= 0) return null;
  if (isFullChartDistanceDomain(domain, fullMax)) return null;

  const span = domain[1] - domain[0];
  if (span <= 0) return null;

  let min = centerDistance - span / 2;
  let max = centerDistance + span / 2;

  if (min < 0) {
    min = 0;
    max = span;
  }
  if (max > fullMax) {
    max = fullMax;
    min = max - span;
  }

  if (Math.abs(domain[0] - min) < epsilon && Math.abs(domain[1] - max) < epsilon) {
    return null;
  }
  return [min, max];
}

export function chartPlotInnerWidth(
  plotWidth: number,
  marginLeft: number,
  marginRight: number,
  yAxisWidth: number,
): number {
  return Math.max(0, plotWidth - marginLeft - marginRight - yAxisWidth);
}

/** Shift the visible distance window; negative shift shows lower distances (drag chart right). */
export function panChartDistanceDomain(
  domain: [number, number],
  fullMax: number,
  shiftDistance: number,
): [number, number] {
  if (fullMax <= 0 || shiftDistance === 0) return domain;

  const [min, max] = domain;
  const span = max - min;
  if (span <= 0) return domain;

  let newMin = min + shiftDistance;
  let newMax = newMin + span;

  if (newMin < 0) {
    newMin = 0;
    newMax = span;
  }
  if (newMax > fullMax) {
    newMax = fullMax;
    newMin = fullMax - span;
  }

  return [newMin, newMax];
}

/**
 * Pixel geometry of a full pilot path in the plot area. Both chart axes have fixed domains
 * during playback, so this is built once and only the drawn *length* changes with time.
 */
export interface ChartPathPixels {
  d: string;
  /** Path length in pixels up to each point, matching what SVG dash lengths measure. */
  cumulativeLength: Float64Array;
  totalLength: number;
}

/** Sub-pixel precision, so a redrawn frame settles on the same attribute string. */
export function roundChartPixel(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildChartPathPixels(
  points: { taskDistance: number; altitude: number }[],
  toX: (value: number) => number,
  toY: (value: number) => number,
): ChartPathPixels {
  const count = points.length;
  const cumulativeLength = new Float64Array(count);
  if (count === 0) return { d: '', cumulativeLength, totalLength: 0 };

  const segments: string[] = new Array(count);
  let previousX = roundChartPixel(toX(points[0].taskDistance));
  let previousY = roundChartPixel(toY(points[0].altitude));
  segments[0] = `M${previousX},${previousY}`;
  let totalLength = 0;

  for (let index = 1; index < count; index += 1) {
    const x = roundChartPixel(toX(points[index].taskDistance));
    const y = roundChartPixel(toY(points[index].altitude));
    totalLength += Math.hypot(x - previousX, y - previousY);
    cumulativeLength[index] = totalLength;
    segments[index] = `L${x},${y}`;
    previousX = x;
    previousY = y;
  }

  return { d: segments.join(''), cumulativeLength, totalLength };
}

/**
 * Length of path already flown at `timeMs`. The live position sits on the straight segment
 * between two path vertices, so the time ratio maps directly onto pixel length.
 */
export function chartPathLengthAtTime(
  pixels: ChartPathPixels,
  timesMs: Float64Array,
  timeMs: number,
  index: number,
): number {
  if (index < 0) return 0;

  const { cumulativeLength, totalLength } = pixels;
  if (index >= cumulativeLength.length - 1) return totalLength;

  const spanMs = timesMs[index + 1] - timesMs[index];
  const ratio = spanMs <= 0 ? 0 : Math.min(1, Math.max(0, (timeMs - timesMs[index]) / spanMs));
  return cumulativeLength[index] + (cumulativeLength[index + 1] - cumulativeLength[index]) * ratio;
}

/** Plain polyline for short trails, which need a `d` but never a dash length. */
export function buildChartPolylineD(
  points: { taskDistance: number; altitude: number }[],
  toX: (value: number) => number,
  toY: (value: number) => number,
): string {
  if (points.length < 2) return '';

  let d = '';
  for (let index = 0; index < points.length; index += 1) {
    const x = roundChartPixel(toX(points[index].taskDistance));
    const y = roundChartPixel(toY(points[index].altitude));
    d += `${index === 0 ? 'M' : 'L'}${x},${y}`;
  }
  return d;
}

export interface ChartPlotRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Plot area in pixels, read back from the axis scale ranges so the live layer never has to
 * assume the chart margins or axis widths it was configured with.
 */
export function chartPlotRect(xRange: number[], yRange: number[]): ChartPlotRect {
  const left = Math.min(xRange[0], xRange[1]);
  const right = Math.max(xRange[0], xRange[1]);
  const top = Math.min(yRange[0], yRange[1]);
  const bottom = Math.max(yRange[0], yRange[1]);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** Marker geometry shared by the pilot label and the trophy badge in front of it. */
export const CHART_PILOT_MARKER_RADIUS = 7;
export const CHART_PILOT_MARKER_FOCUS_SCALE = 1.5;
export const CHART_PILOT_LABEL_GAP = 10;
export const CHART_TROPHY_SIZE = 12;

export function chartPilotLabelOffsetX(isLeader: boolean): number {
  return CHART_PILOT_LABEL_GAP + (isLeader ? CHART_TROPHY_SIZE + 2 : 0);
}

/** The dashed link is pointless once the pilot sits on top of their own best progress. */
export function hasChartMaxProgressLink(
  currentDistance: number,
  currentAltitude: number,
  maxDistance: number,
  maxAltitude: number,
): boolean {
  return Math.abs(maxDistance - currentDistance) > 0.01 || Math.abs(maxAltitude - currentAltitude) > 1;
}

/** Furthest along the task wins, ties go to the alphabetically first pilot. */
export function isLeadingChartPilot(
  taskPercent: number,
  pilotName: string,
  leaderTaskPercent: number,
  leaderPilotName: string | null,
): boolean {
  if (leaderPilotName === null) return true;
  if (taskPercent !== leaderTaskPercent) return taskPercent > leaderTaskPercent;
  return pilotName.localeCompare(leaderPilotName) < 0;
}

export function isTurnpointTagged(
  turnpoint: { number: number; taskPercent: number },
  startNumber: number,
  goalNumber: number,
  progressPercent: number,
): boolean {
  if (turnpoint.number === startNumber || turnpoint.number === goalNumber) return false;
  return progressPercent > 0 && progressPercent >= turnpoint.taskPercent - 0.001;
}

/**
 * Turnpoints are ordered by task percent and the tagged test is monotonic in progress, so
 * this count changes exactly when the tagged set does. The live layer uses it to decide the
 * handful of moments where turnpoint colours actually need a React render.
 */
export function countTaggedTurnpoints(
  turnpoints: { number: number; taskPercent: number }[],
  startNumber: number,
  goalNumber: number,
  progressPercent: number,
): number {
  let count = 0;
  for (const turnpoint of turnpoints) {
    if (isTurnpointTagged(turnpoint, startNumber, goalNumber, progressPercent)) count += 1;
  }
  return count;
}

export function isChartTurnpointTaggedByMilestone(
  progressIndex: number,
  turnpointNumber: number,
  startNumber: number,
  goalNumber: number,
  nextProgressIndex: number,
): boolean {
  if (turnpointNumber === startNumber || turnpointNumber === goalNumber) return false;
  return progressIndex >= 0 && progressIndex < nextProgressIndex;
}

export function countChartTaggedTurnpointsByMilestone(
  turnpoints: { number: number }[],
  startNumber: number,
  goalNumber: number,
  nextProgressIndex: number,
): number {
  let count = 0;
  for (let index = 0; index < turnpoints.length; index += 1) {
    if (
      isChartTurnpointTaggedByMilestone(
        index,
        turnpoints[index]!.number,
        startNumber,
        goalNumber,
        nextProgressIndex,
      )
    ) {
      count += 1;
    }
  }
  return count;
}

export function taskDistanceDisplayToPercent(taskDistance: number, maxDistance: number): number {
  if (maxDistance <= 0) return 0;
  return (clampChartTaskDistanceDisplay(taskDistance, maxDistance) / maxDistance) * 100;
}

const CHART_DISTANCE_TICK_STEPS = [1, 2, 5, 10, 20, 50, 100] as const;
const CHART_ALTITUDE_TICK_STEPS = [1000, 2000, 2500, 5000, 10000] as const;

function buildAlignedChartTicks(min: number, max: number, step: number): number[] {
  if (max <= min) return [min];
  if (step <= 0) return [min, max];

  const ticks: number[] = [min];
  let value = Math.ceil(min / step) * step;
  if (value <= min + 1e-9) {
    value += step;
  }

  while (value < max - 1e-9) {
    ticks.push(value);
    value += step;
  }

  if (Math.abs(ticks[ticks.length - 1] - max) > 1e-9) {
    ticks.push(max);
  }

  return ticks;
}

/** Step-aligned ticks only (no fractional task length on the axis). */
function buildRoundGridTicks(min: number, max: number, step: number): number[] {
  if (max <= min || step <= 0) return [];

  const start = min <= 1e-9 ? 0 : Math.ceil(min / step) * step;
  const end = Math.floor(max / step) * step;
  if (end + 1e-9 < start) return [];

  const ticks: number[] = [];
  for (let value = start; value <= end + 1e-9; value += step) {
    ticks.push(value);
  }
  return ticks;
}

function buildChartTicksWithSteps(
  min: number,
  max: number,
  steps: readonly number[],
  maxTickCount: number,
  buildTicks: (min: number, max: number, step: number) => number[] = buildAlignedChartTicks,
): number[] {
  if (max <= min) return [min];

  let bestTicks: number[] | null = null;
  let bestStep = Infinity;

  for (const step of steps) {
    const ticks = buildTicks(min, max, step);
    if (ticks.length === 0 || ticks.length > maxTickCount) continue;
    if (
      !bestTicks ||
      ticks.length > bestTicks.length ||
      (ticks.length === bestTicks.length && step < bestStep)
    ) {
      bestTicks = ticks;
      bestStep = step;
    }
  }

  if (bestTicks) return bestTicks;

  const span = max - min;
  const coarsest = steps[steps.length - 1] ?? 1000;
  const fallbackStep = Math.max(
    coarsest,
    Math.ceil(span / Math.max(1, maxTickCount - 1) / coarsest) * coarsest,
  );
  return buildTicks(min, max, fallbackStep);
}

/** At most `maxTickCount` ticks on 1/2/5/10/20/50/100 km (or mi) intervals; respects zoom window. */
export function buildChartDistanceTicks(
  maxDistance: number,
  maxTickCount = 5,
  minDistance = 0,
): number[] {
  return buildChartTicksWithSteps(
    minDistance,
    maxDistance,
    CHART_DISTANCE_TICK_STEPS,
    maxTickCount,
    buildRoundGridTicks,
  );
}

/** At most `maxTickCount` altitude labels on 1k/2k/5k/10k display-unit steps. */
export function buildChartAltitudeTicks(
  minAltitude: number,
  maxAltitude: number,
  maxTickCount = 5,
): number[] {
  return buildChartTicksWithSteps(minAltitude, maxAltitude, CHART_ALTITUDE_TICK_STEPS, maxTickCount);
}

/** X-axis labels in the active distance unit (km or mi), whole numbers only. */
export function formatChartDistanceAxisTick(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value));
}

/** Compact y-axis labels in thousands of the altitude display unit (e.g. 1k, 2k). */
export function formatChartAltitudeAxisTick(value: number): string {
  if (!Number.isFinite(value)) return '';
  return `${Math.round(value / 1000)}k`;
}

export function formatChartDistanceTick(
  value: number,
  maxDistance: number,
  unit: DistanceUnit,
): string {
  if (!Number.isFinite(value)) return '';
  const decimals =
    unit === 'mi' ? (maxDistance < 10 ? 2 : maxDistance < 100 ? 1 : 0) : maxDistance < 10 ? 1 : maxDistance < 100 ? 1 : 0;
  return value.toFixed(decimals);
}

export function computeChartAltitudeRange(
  tracks: EnrichedFlightTrack[],
  altitudeUnit: AltitudeUnit,
): { min: number; max: number; step: number } {
  const step = chartAltitudeStep(altitudeUnit);
  let minMeters = Infinity;
  let maxMeters = -Infinity;

  for (const track of tracks) {
    for (const point of track.points) {
      if (!isFlyingAltitudeMeters(point.alt)) continue;
      minMeters = Math.min(minMeters, point.alt);
      maxMeters = Math.max(maxMeters, point.alt);
    }
  }

  if (!Number.isFinite(minMeters) || !Number.isFinite(maxMeters)) {
    return { min: 0, max: step * 2, step };
  }

  const minDisplay = metersToAltitudeUnit(minMeters, altitudeUnit);
  const maxDisplay = metersToAltitudeUnit(maxMeters, altitudeUnit);
  let min = Math.floor(minDisplay / step) * step;
  let max = Math.ceil(maxDisplay / step) * step;

  if (max <= min) {
    max = min + step;
  }

  return { min, max, step };
}
