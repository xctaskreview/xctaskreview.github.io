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
): number {
  if (plotWidth <= 0 || maxDistance <= 0) return 0;

  const plotInnerLeft = hostRect.left + marginLeft + yAxisWidth;
  const plotInnerWidth = plotWidth - marginLeft - marginRight - yAxisWidth;
  if (plotInnerWidth <= 0) return 0;

  const fraction = (clientX - plotInnerLeft) / plotInnerWidth;
  return clampChartTaskDistanceDisplay(fraction * maxDistance, maxDistance);
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

export function taskDistanceDisplayToPercent(taskDistance: number, maxDistance: number): number {
  if (maxDistance <= 0) return 0;
  return (clampChartTaskDistanceDisplay(taskDistance, maxDistance) / maxDistance) * 100;
}

export function buildChartDistanceTicks(maxDistance: number, segments = 5): number[] {
  if (maxDistance <= 0) return [0];
  if (segments <= 0) return [0, maxDistance];

  const step = maxDistance / segments;
  return Array.from({ length: segments + 1 }, (_, index) =>
    index === segments ? maxDistance : index * step,
  );
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
