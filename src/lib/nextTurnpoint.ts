import { findCircleForProgressIndex } from './taskMapStyle';
import { resolveEffectiveSssCrossTime, type PilotTaskVerification } from './taskVerification';
import type { OptimizedRoute, RoutePoint } from './types';

export interface NextTurnpointMilestone {
  timeMs: number;
  /** Index into `route.progressTurnpoints` for the active “next” cylinder. */
  nextProgressIndex: number;
}

export interface TaskNextTurnpointTimeline {
  taskStartMs: number;
  milestones: NextTurnpointMilestone[];
}

export interface NextTurnpointTarget {
  progressIndex: number;
  name: string;
  number: number | null;
  radiusM: number | null;
}

export function consolidateNextTurnpointMilestones(
  milestones: NextTurnpointMilestone[],
): NextTurnpointMilestone[] {
  if (milestones.length === 0) return milestones;

  const sorted = [...milestones].sort((a, b) => a.timeMs - b.timeMs);
  const out: NextTurnpointMilestone[] = [];
  let maxNext = sorted[0]!.nextProgressIndex - 1;

  for (const milestone of sorted) {
    if (milestone.nextProgressIndex <= maxNext) continue;
    maxNext = milestone.nextProgressIndex;
    const last = out[out.length - 1];
    if (last && last.timeMs === milestone.timeMs) {
      last.nextProgressIndex = milestone.nextProgressIndex;
    } else {
      out.push({ ...milestone });
    }
  }

  return out;
}

/** Per-pilot next TP milestones from in-sequence crossings (SSS on exit, others on enter). */
export function buildPilotNextTurnpointMilestones(
  verification: PilotTaskVerification,
  route: OptimizedRoute,
  taskStartMs: number | undefined,
): NextTurnpointMilestone[] {
  if (taskStartMs === undefined) return [];

  const startIndex = route.sssIndex;
  const milestones: NextTurnpointMilestone[] = [{ timeMs: 0, nextProgressIndex: 0 }];

  const effectiveSss = resolveEffectiveSssCrossTime(verification.crossings, route);
  if (effectiveSss) {
    milestones.push({ timeMs: effectiveSss.getTime(), nextProgressIndex: 1 });
  }

  for (const crossing of verification.crossings) {
    if (!crossing.inSequence) continue;
    if (crossing.time.getTime() < taskStartMs) continue;

    if (crossing.role === 'SSS') continue;

    if (crossing.direction !== 'ENTER') continue;
    const progressIndex = crossing.turnpointIndex - startIndex;
    milestones.push({
      timeMs: crossing.time.getTime(),
      nextProgressIndex: progressIndex + 1,
    });
  }

  return consolidateNextTurnpointMilestones(milestones);
}

export function lookupNextProgressIndex(
  milestones: NextTurnpointMilestone[],
  taskStartMs: number,
  timeMs: number,
  options?: { allowBeforeTaskStart?: boolean },
): number {
  if (milestones.length === 0) return -1;
  if (!options?.allowBeforeTaskStart && timeMs < taskStartMs) return -1;

  let bestIndex = -1;
  for (const milestone of milestones) {
    if (milestone.timeMs > timeMs) continue;
    if (milestone.nextProgressIndex > bestIndex) {
      bestIndex = milestone.nextProgressIndex;
    }
  }

  return bestIndex;
}

export function resolveNextTurnpointTarget(
  route: OptimizedRoute,
  nextProgressIndex: number,
): NextTurnpointTarget | null {
  if (nextProgressIndex < 0) return null;

  if (nextProgressIndex >= route.progressTurnpoints.length) {
    return {
      progressIndex: nextProgressIndex,
      name: 'Goal',
      number: null,
      radiusM: route.goalRadius,
    };
  }

  const tp = route.progressTurnpoints[nextProgressIndex];
  if (!tp) return null;

  return {
    progressIndex: nextProgressIndex,
    name: tp.name,
    number: tp.number,
    radiusM: tp.radius,
  };
}

export function lookupPilotNextTurnpointTarget(
  milestones: NextTurnpointMilestone[],
  route: OptimizedRoute,
  taskStartMs: number | undefined,
  timeMs: number,
): NextTurnpointTarget | null {
  if (taskStartMs === undefined) return null;
  const index = lookupNextProgressIndex(milestones, taskStartMs, timeMs, {
    allowBeforeTaskStart: true,
  });
  return resolveNextTurnpointTarget(route, index);
}

/** Fleet next TP: earliest time any pilot reaches each forward milestone. */
export function buildTaskNextTurnpointTimeline(
  tracks: { nextTurnpointMilestones: NextTurnpointMilestone[] }[],
  route: OptimizedRoute,
  taskStart: Date | undefined,
): TaskNextTurnpointTimeline {
  if (!taskStart || tracks.length === 0) {
    return { taskStartMs: taskStart?.getTime() ?? 0, milestones: [] };
  }

  const taskStartMs = taskStart.getTime();
  const maxNextIndex = route.progressTurnpoints.length;
  const milestones: NextTurnpointMilestone[] = [{ timeMs: taskStartMs, nextProgressIndex: 0 }];

  for (let targetNext = 1; targetNext <= maxNextIndex; targetNext += 1) {
    let minTime: number | null = null;
    for (const track of tracks) {
      const hit = track.nextTurnpointMilestones.find(
        (entry) => entry.nextProgressIndex === targetNext,
      );
      if (!hit) continue;
      if (minTime === null || hit.timeMs < minTime) {
        minTime = hit.timeMs;
      }
    }
    if (minTime !== null) {
      milestones.push({ timeMs: minTime, nextProgressIndex: targetNext });
    }
  }

  return {
    taskStartMs,
    milestones: consolidateNextTurnpointMilestones(milestones),
  };
}

export function lookupFleetNextTurnpointTarget(
  timeline: TaskNextTurnpointTimeline,
  route: OptimizedRoute,
  timeMs: number,
): NextTurnpointTarget | null {
  const index = lookupNextProgressIndex(timeline.milestones, timeline.taskStartMs, timeMs);
  return resolveNextTurnpointTarget(route, index);
}

export function resolveMapNextTurnpointCircle(
  route: OptimizedRoute,
  circles: RoutePoint[],
  target: NextTurnpointTarget | null,
): RoutePoint | undefined {
  if (!target) return undefined;
  if (target.number != null) {
    const byNumber = circles.find((circle) => circle.number === target.number);
    if (byNumber) return byNumber;
  }
  if (target.name === 'Goal') {
    return circles.find(
      (circle) =>
        circle.lat === route.goalCenter.lat &&
        circle.lon === route.goalCenter.lon &&
        circle.radius === route.goalRadius,
    );
  }
  return findCircleForProgressIndex(target.progressIndex, route, circles);
}
