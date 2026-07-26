import { bearingDegrees, formatDuration, normalizeAngleDelta } from './geo';
import type { AppPreferences } from './preferences';
import { formatVerticalSpeed } from './preferences';
import type { EnrichedTrackPoint } from './taskProgress';

export type FlyingMode = 'circling' | 'glide';

export interface FlyingModeSecondState {
  mode: FlyingMode;
  /** Altitude gained since the current circling segment started (m). */
  thermalGainM: number;
  /** Seconds since the current circling segment started. */
  circlingDurationSec: number;
  /** Mean climb rate over the current circling segment (m/s). */
  averageThermalVarioMps: number;
  /** L/D over the recent sample window, when altitude was lost. */
  glideRatio: number | null;
  /** Mean L/D since the current glide segment started. */
  averageGlideRatio: number | null;
}

export interface FlyingModeTimeline {
  /** UTC ms at index 0 (start of first second bucket). */
  startTimeMs: number;
  seconds: FlyingModeSecondState[];
}

export interface CirclingDetectionSettings {
  sampleMs: number;
  turnRateDegPerS: number;
}

export function circlingDetectionFromPreferences(preferences: AppPreferences): CirclingDetectionSettings {
  return {
    sampleMs: preferences.circlingDetectionSampleSec * 1000,
    turnRateDegPerS: preferences.circlingTurnRateDegPerS,
  };
}

const MIN_POINT_DT_MS = 100;
const MIN_GLIDE_ALT_LOSS_M = 1;

interface SampleAtTime {
  displayAlt: number;
  cumulativeDistanceM: number;
}

function interpolateSampleAtTime(
  points: EnrichedTrackPoint[],
  timeMs: number,
): SampleAtTime | null {
  if (points.length === 0) return null;
  const firstMs = points[0].timeMs;
  const lastMs = points[points.length - 1].timeMs;
  if (timeMs <= firstMs) {
    const p = points[0];
    return { displayAlt: p.displayAlt, cumulativeDistanceM: p.cumulativeDistanceM };
  }
  if (timeMs >= lastMs) {
    const p = points[points.length - 1];
    return { displayAlt: p.displayAlt, cumulativeDistanceM: p.cumulativeDistanceM };
  }

  let low = 0;
  let high = points.length - 2;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const a = points[mid]!;
    const b = points[mid + 1]!;
    if (timeMs < a.timeMs) {
      high = mid - 1;
    } else if (timeMs > b.timeMs) {
      low = mid + 1;
    } else {
      const span = b.timeMs - a.timeMs;
      const ratio = span <= 0 ? 0 : (timeMs - a.timeMs) / span;
      return {
        displayAlt: a.displayAlt + (b.displayAlt - a.displayAlt) * ratio,
        cumulativeDistanceM:
          a.cumulativeDistanceM + (b.cumulativeDistanceM - a.cumulativeDistanceM) * ratio,
      };
    }
  }

  return null;
}

function interpolateScalarAtTime(
  points: EnrichedTrackPoint[],
  values: number[],
  timeMs: number,
): number {
  if (points.length === 0) return 0;
  const firstMs = points[0].timeMs;
  const lastMs = points[points.length - 1].timeMs;
  if (timeMs <= firstMs) return values[0] ?? 0;
  if (timeMs >= lastMs) return values[values.length - 1] ?? 0;

  let low = 0;
  let high = points.length - 2;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const a = points[mid]!;
    const b = points[mid + 1]!;
    if (timeMs < a.timeMs) {
      high = mid - 1;
    } else if (timeMs > b.timeMs) {
      low = mid + 1;
    } else {
      const span = b.timeMs - a.timeMs;
      const ratio = span <= 0 ? 0 : (timeMs - a.timeMs) / span;
      const va = values[mid] ?? 0;
      const vb = values[mid + 1] ?? va;
      return va + (vb - va) * ratio;
    }
  }

  return values[values.length - 1] ?? 0;
}

function buildCumulativeAbsHeadingDeg(points: EnrichedTrackPoint[]): number[] {
  const cumulative = new Array<number>(points.length);
  cumulative[0] = 0;
  let prevBearing: number | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const dtMs = to.timeMs - from.timeMs;
    let deltaDeg = 0;
    if (dtMs >= MIN_POINT_DT_MS) {
      const bearing = bearingDegrees(from, to);
      if (prevBearing !== null) {
        deltaDeg = Math.abs(normalizeAngleDelta(bearing - prevBearing));
      }
      prevBearing = bearing;
    }
    cumulative[index] = cumulative[index - 1]! + deltaDeg;
  }

  return cumulative;
}

/** Total width `sampleMs`, centered on `timeMs` and clamped to the track. */
function symmetricSampleWindowMs(
  points: EnrichedTrackPoint[],
  timeMs: number,
  sampleMs: number,
): { startMs: number; endMs: number } {
  const trackStartMs = points[0]!.timeMs;
  const trackEndMs = points[points.length - 1]!.timeMs;
  const halfMs = sampleMs / 2;
  let startMs = Math.max(trackStartMs, timeMs - halfMs);
  let endMs = Math.min(trackEndMs, timeMs + halfMs);
  if (endMs <= startMs) {
    endMs = Math.min(trackEndMs, startMs + MIN_POINT_DT_MS);
  }
  return { startMs, endMs };
}

function headingChangeRateDegPerS(
  points: EnrichedTrackPoint[],
  cumulativeAbsHeadingDeg: number[],
  timeMs: number,
  sampleMs: number,
): number {
  const { startMs, endMs } = symmetricSampleWindowMs(points, timeMs, sampleMs);
  const durationSec = (endMs - startMs) / 1000;
  if (durationSec <= 0) return 0;

  const startTurn = interpolateScalarAtTime(points, cumulativeAbsHeadingDeg, startMs);
  const endTurn = interpolateScalarAtTime(points, cumulativeAbsHeadingDeg, endMs);
  return Math.max(0, endTurn - startTurn) / durationSec;
}

function headingChangeDegInWindow(
  points: EnrichedTrackPoint[],
  cumulativeAbsHeadingDeg: number[],
  timeMs: number,
  sampleMs: number,
): number {
  const { startMs, endMs } = symmetricSampleWindowMs(points, timeMs, sampleMs);
  const startTurn = interpolateScalarAtTime(points, cumulativeAbsHeadingDeg, startMs);
  const endTurn = interpolateScalarAtTime(points, cumulativeAbsHeadingDeg, endMs);
  return Math.max(0, endTurn - startTurn);
}

/** Ignore gentle course corrections that briefly exceed the turn-rate threshold. */
function minCirclingHeadingChangeDeg(turnRateDegPerS: number, sampleMs: number): number {
  const windowSec = sampleMs / 1000;
  return Math.max(45, turnRateDegPerS * windowSec * 0.85);
}

function horizontalDistanceInWindow(
  points: EnrichedTrackPoint[],
  windowStartMs: number,
  windowEndMs: number,
): number {
  const start = interpolateSampleAtTime(points, windowStartMs);
  const end = interpolateSampleAtTime(points, windowEndMs);
  if (!start || !end) return 0;
  return Math.max(0, end.cumulativeDistanceM - start.cumulativeDistanceM);
}

function instantGlideRatio(
  points: EnrichedTrackPoint[],
  timeMs: number,
  sampleMs: number,
): number | null {
  const { startMs, endMs } = symmetricSampleWindowMs(points, timeMs, sampleMs);
  const start = interpolateSampleAtTime(points, startMs);
  const end = interpolateSampleAtTime(points, endMs);
  if (!start || !end) return null;
  const altLossM = start.displayAlt - end.displayAlt;
  if (altLossM < MIN_GLIDE_ALT_LOSS_M) return null;
  const distanceM = horizontalDistanceInWindow(points, startMs, endMs);
  if (distanceM <= 0) return null;
  return distanceM / altLossM;
}

function averageGlideRatio(
  glideStartAlt: number,
  glideStartDist: number,
  currentAlt: number,
  currentDist: number,
): number | null {
  const altLossM = glideStartAlt - currentAlt;
  if (altLossM < MIN_GLIDE_ALT_LOSS_M) return null;
  const distanceM = currentDist - glideStartDist;
  if (distanceM <= 0) return null;
  return distanceM / altLossM;
}

function emptySecondState(): FlyingModeSecondState {
  return {
    mode: 'glide',
    thermalGainM: 0,
    circlingDurationSec: 0,
    averageThermalVarioMps: 0,
    glideRatio: null,
    averageGlideRatio: null,
  };
}

/** Classify circling vs glide each second and accumulate segment metrics. */
export function computeFlyingModeTimeline(
  points: EnrichedTrackPoint[],
  detection: CirclingDetectionSettings,
): FlyingModeTimeline {
  if (points.length < 2) {
    return { startTimeMs: points[0]?.timeMs ?? 0, seconds: [] };
  }

  const startSec = Math.floor(points[0].timeMs / 1000);
  const endSec = Math.floor(points[points.length - 1].timeMs / 1000);
  const startTimeMs = startSec * 1000;
  const seconds: FlyingModeSecondState[] = [];
  const cumulativeAbsHeadingDeg = buildCumulativeAbsHeadingDeg(points);
  const { sampleMs, turnRateDegPerS } = detection;

  let mode: FlyingMode = 'glide';
  let circlingStartMs = startTimeMs;
  let circlingStartAlt = points[0].displayAlt;
  let glideStartAlt = points[0].displayAlt;
  let glideStartDist = points[0].cumulativeDistanceM;

  for (let sec = startSec; sec <= endSec; sec += 1) {
    const timeMs = sec * 1000;
    const sample = interpolateSampleAtTime(points, timeMs);
    if (!sample) {
      seconds.push(emptySecondState());
      continue;
    }

    const measuredTurnRateDegPerS = headingChangeRateDegPerS(
      points,
      cumulativeAbsHeadingDeg,
      timeMs,
      sampleMs,
    );
    const headingChangeDeg = headingChangeDegInWindow(
      points,
      cumulativeAbsHeadingDeg,
      timeMs,
      sampleMs,
    );
    const minHeadingChangeDeg = minCirclingHeadingChangeDeg(turnRateDegPerS, sampleMs);
    const nextMode: FlyingMode =
      measuredTurnRateDegPerS >= turnRateDegPerS && headingChangeDeg >= minHeadingChangeDeg
        ? 'circling'
        : 'glide';

    if (nextMode !== mode) {
      mode = nextMode;
      if (mode === 'circling') {
        circlingStartMs = timeMs;
        circlingStartAlt = sample.displayAlt;
      } else {
        glideStartAlt = sample.displayAlt;
        glideStartDist = sample.cumulativeDistanceM;
      }
    }

    const circlingDurationSec = Math.max(0, (timeMs - circlingStartMs) / 1000);
    const thermalGainM = sample.displayAlt - circlingStartAlt;
    const averageThermalVarioMps =
      mode === 'circling' && circlingDurationSec > 0 ? thermalGainM / circlingDurationSec : 0;

    const glideRatio =
      mode === 'glide' ? instantGlideRatio(points, timeMs, sampleMs) : null;
    const averageGlideRatioValue =
      mode === 'glide'
        ? averageGlideRatio(
            glideStartAlt,
            glideStartDist,
            sample.displayAlt,
            sample.cumulativeDistanceM,
          )
        : null;

    seconds.push({
      mode,
      thermalGainM: mode === 'circling' ? thermalGainM : 0,
      circlingDurationSec: mode === 'circling' ? circlingDurationSec : 0,
      averageThermalVarioMps: mode === 'circling' ? averageThermalVarioMps : 0,
      glideRatio,
      averageGlideRatio: averageGlideRatioValue,
    });
  }

  return { startTimeMs, seconds };
}

export function getFlyingModeStateAtTime(
  timeline: FlyingModeTimeline,
  time: Date,
): FlyingModeSecondState | null {
  if (timeline.seconds.length === 0) return null;
  const index = Math.floor(time.getTime() / 1000) - Math.floor(timeline.startTimeMs / 1000);
  if (index < 0 || index >= timeline.seconds.length) return null;
  return timeline.seconds[index] ?? null;
}

function formatGlideRatioShort(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return '—';
  return `${ratio.toFixed(1)}:1`;
}

/** Compact mode line for map markers and chart labels. */
export function formatFlyingModeMapLine(
  state: FlyingModeSecondState | null,
  preferences: AppPreferences,
): string {
  if (!state) return '';
  if (state.mode === 'circling') {
    const gainSign = state.thermalGainM >= 0 ? '+' : '';
    const gain = `${gainSign}${Math.round(state.thermalGainM)} m`;
    const avg = formatVerticalSpeed(state.averageThermalVarioMps, preferences.verticalSpeedUnit);
    const time = formatDuration(state.circlingDurationSec * 1000);
    return `${gain} · avg ${avg} · ${time}`;
  }
  return `L/D ${formatGlideRatioShort(state.glideRatio)} · avg ${formatGlideRatioShort(state.averageGlideRatio)}`;
}
