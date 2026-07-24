import type { EnrichedFlightTrack } from './taskProgress';

/**
 * Second-by-second summary of the whole field, built once when the review loads. Playback
 * and scrubbing read these arrays instead of sampling every pilot on every frame.
 */
export interface TaskFieldTimeline {
  trackIds: string[];
  startSecond: number;
  endSecond: number;
  /** Highest task % any pilot had reached by each second. Monotonically increasing. */
  runningMaxPercent: Float32Array;
  /** Index into `trackIds` of the pilot furthest along at each second, -1 when none started. */
  leaderIndex: Int16Array;
}

const EMPTY_TIMELINE: TaskFieldTimeline = {
  trackIds: [],
  startSecond: 0,
  endSecond: -1,
  runningMaxPercent: new Float32Array(0),
  leaderIndex: new Int16Array(0),
};

export function buildTaskFieldTimeline(
  tracks: EnrichedFlightTrack[],
  taskStart: Date | undefined,
  endTime: Date,
): TaskFieldTimeline {
  if (tracks.length === 0 || !taskStart) return EMPTY_TIMELINE;

  const startSecond = Math.floor(taskStart.getTime() / 1000);
  const endSecond = Math.floor(endTime.getTime() / 1000);
  if (endSecond < startSecond) return EMPTY_TIMELINE;

  const secondCount = endSecond - startSecond + 1;
  const runningMaxPercent = new Float32Array(secondCount);
  const leaderIndex = new Int16Array(secondCount).fill(-1);

  // One cursor per pilot so the whole field is walked once, not once per second.
  const cursors = new Int32Array(tracks.length);
  let runningMax = 0;

  for (let offset = 0; offset < secondCount; offset += 1) {
    const timeMs = (startSecond + offset) * 1000;
    let bestPercent = -1;
    let bestTrack = -1;

    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      const points = tracks[trackIndex].points;
      if (points.length === 0 || points[0].timeMs > timeMs) continue;

      let cursor = cursors[trackIndex];
      while (cursor + 1 < points.length && points[cursor + 1].timeMs <= timeMs) {
        cursor += 1;
      }
      cursors[trackIndex] = cursor;

      const point = points[cursor];
      if (!point.hasStarted || point.timeMs > timeMs) continue;

      if (
        point.taskPercent > bestPercent ||
        (point.taskPercent === bestPercent &&
          bestTrack >= 0 &&
          tracks[trackIndex].id.localeCompare(tracks[bestTrack].id) < 0)
      ) {
        bestPercent = point.taskPercent;
        bestTrack = trackIndex;
      }
    }

    if (bestPercent > runningMax) {
      runningMax = bestPercent;
    }
    runningMaxPercent[offset] = runningMax;
    leaderIndex[offset] = bestTrack;
  }

  return {
    trackIds: tracks.map((track) => track.id),
    startSecond,
    endSecond,
    runningMaxPercent,
    leaderIndex,
  };
}

function offsetForTime(timeline: TaskFieldTimeline, timeMs: number): number {
  if (timeline.endSecond < timeline.startSecond) return -1;
  const offset = Math.floor(timeMs / 1000) - timeline.startSecond;
  if (offset < 0) return -1;
  return Math.min(offset, timeline.endSecond - timeline.startSecond);
}

/** Highest task % the field had reached at `timeMs`, or 0 before the task starts. */
export function fieldRunningMaxPercentAt(timeline: TaskFieldTimeline, timeMs: number): number {
  const offset = offsetForTime(timeline, timeMs);
  return offset < 0 ? 0 : timeline.runningMaxPercent[offset];
}

export function fieldLeaderIdAt(timeline: TaskFieldTimeline, timeMs: number): string | null {
  const offset = offsetForTime(timeline, timeMs);
  if (offset < 0) return null;
  const trackIndex = timeline.leaderIndex[offset];
  return trackIndex < 0 ? null : (timeline.trackIds[trackIndex] ?? null);
}

/**
 * First time the field's running max reached `targetPercent`. Binary search, since
 * `runningMaxPercent` is monotonic.
 */
export function findFirstTimeFieldReachedPercent(
  timeline: TaskFieldTimeline,
  targetPercent: number,
): Date | null {
  const secondCount = timeline.endSecond - timeline.startSecond + 1;
  if (secondCount <= 0) return null;

  const target = Math.min(100, Math.max(0, targetPercent));
  if (target <= 0) return new Date(timeline.startSecond * 1000);
  if (timeline.runningMaxPercent[secondCount - 1] < target - 0.001) return null;

  let lo = 0;
  let hi = secondCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline.runningMaxPercent[mid] >= target - 0.001) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  return new Date((timeline.startSecond + lo) * 1000);
}

/** Share of task time each pilot spent furthest along, counted from the leader timeline. */
export function computeLeadPercentagesFromTimeline(
  timeline: TaskFieldTimeline,
  untilTimeMs: number,
): Map<string, number> {
  const leadPercentages = new Map<string, number>(timeline.trackIds.map((id) => [id, 0]));
  const lastOffset = offsetForTime(timeline, untilTimeMs);
  if (lastOffset < 0) return leadPercentages;

  const leadSeconds = new Int32Array(timeline.trackIds.length);
  for (let offset = 0; offset <= lastOffset; offset += 1) {
    const trackIndex = timeline.leaderIndex[offset];
    if (trackIndex >= 0) {
      leadSeconds[trackIndex] += 1;
    }
  }

  const totalSeconds = lastOffset + 1;
  for (let trackIndex = 0; trackIndex < timeline.trackIds.length; trackIndex += 1) {
    leadPercentages.set(
      timeline.trackIds[trackIndex],
      totalSeconds > 0 ? (leadSeconds[trackIndex] / totalSeconds) * 100 : 0,
    );
  }

  return leadPercentages;
}
