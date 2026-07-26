import { haversine } from './geo';
import type { LatLon, OptimizedRoute, TrackPoint, Turnpoint, XcTask } from './types';
import {
  getEssTurnpointIndex,
  getGoalIndex,
  getStartIndex,
  getTaskDeadlineTime,
  parseTaskTimeOnReferenceDate,
} from './xctask';

export type CylinderDirection = 'ENTER' | 'EXIT';
export type ControlRole = 'SSS' | 'TURN' | 'ESS' | 'GOAL';

export interface TaskControlZone {
  turnpointIndex: number;
  name: string;
  center: LatLon;
  radius: number;
  direction: CylinderDirection;
  role: ControlRole;
}

export interface TurnpointCrossing {
  turnpointIndex: number;
  name: string;
  role: ControlRole;
  direction: CylinderDirection;
  time: Date;
  /** False when crossed out of task order. */
  inSequence: boolean;
}

export interface PilotTaskVerification {
  crossings: TurnpointCrossing[];
  sssCrossTime: Date | null;
  assignedStartGate: string | null;
  assignedStartGateTime: Date | null;
  earlyStart: boolean;
  earlyStartSeconds: number;
  essCrossTime: Date | null;
  goalCrossTime: Date | null;
  landingTime: Date | null;
  /** Speed-section time (SSS cross → ESS cross), seconds. */
  taskTimeSeconds: number | null;
  deadline: Date | null;
  cappedAtDeadline: boolean;
  medianFixIntervalSec: number | null;
  warnings: string[];
}

export interface PointTaskProgressState {
  legIndex: number;
  hasStarted: boolean;
  finished: boolean;
}

function normalizeDirection(value: string | undefined): CylinderDirection {
  return value?.toUpperCase() === 'ENTER' ? 'ENTER' : 'EXIT';
}

function pointInCylinder(point: LatLon, center: LatLon, radius: number): boolean {
  return haversine(point, center) <= radius;
}

function roleForTurnpoint(tp: Turnpoint, index: number, essIndex: number | null, goalIndex: number): ControlRole {
  if (tp.type === 'SSS') return 'SSS';
  if (tp.type === 'ESS' || (essIndex !== null && index === essIndex)) return 'ESS';
  if (index === goalIndex) return 'GOAL';
  return 'TURN';
}

export function buildTaskControlZones(task: XcTask): TaskControlZone[] {
  const startIndex = getStartIndex(task);
  const goalIndex = getGoalIndex(task);
  const essIndex = getEssTurnpointIndex(task);
  const sssDirection = normalizeDirection(task.sss?.direction);

  const zones: TaskControlZone[] = [];
  for (let index = startIndex; index <= goalIndex; index += 1) {
    const tp = task.turnpoints[index];
    if (!tp) continue;
    const role = roleForTurnpoint(tp, index, essIndex, goalIndex);
    const direction = role === 'SSS' ? sssDirection : 'ENTER';
    zones.push({
      turnpointIndex: index,
      name: tp.waypoint.name,
      center: { lat: tp.waypoint.lat, lon: tp.waypoint.lon },
      radius: tp.radius,
      direction,
      role,
    });
  }
  return zones;
}

function detectCrossing(
  wasInside: boolean,
  isInside: boolean,
  direction: CylinderDirection,
): boolean {
  if (direction === 'ENTER') return !wasInside && isInside;
  return wasInside && !isInside;
}

function resolveAssignedStartGate(
  task: XcTask,
  referenceDate: Date,
  sssCrossTime: Date,
): { gate: string | null; gateTime: Date | null; earlyStart: boolean; earlyStartSeconds: number } {
  const gates = task.sss?.timeGates ?? [];
  if (gates.length === 0) {
    return { gate: null, gateTime: null, earlyStart: false, earlyStartSeconds: 0 };
  }

  const parsed = gates
    .map((gate) => ({
      gate,
      time: parseTaskTimeOnReferenceDate(gate, task, referenceDate),
    }))
    .filter((entry): entry is { gate: string; time: Date } => entry.time !== undefined)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (parsed.length === 0) {
    return { gate: gates[0] ?? null, gateTime: null, earlyStart: false, earlyStartSeconds: 0 };
  }

  const crossMs = sssCrossTime.getTime();
  const first = parsed[0];
  if (crossMs < first.time.getTime()) {
    const earlyStartSeconds = Math.max(0, Math.round((first.time.getTime() - crossMs) / 1000));
    return { gate: first.gate, gateTime: first.time, earlyStart: true, earlyStartSeconds };
  }

  let assigned = first;
  for (const entry of parsed) {
    if (entry.time.getTime() <= crossMs) assigned = entry;
  }
  return { gate: assigned.gate, gateTime: assigned.time, earlyStart: false, earlyStartSeconds: 0 };
}

/**
 * Race SSS exit: latest SSS cylinder exit before the pilot enters the next turnpoint
 * (includes re-exits after an early start).
 */
export function resolveEffectiveSssCrossTime(
  crossings: TurnpointCrossing[],
  route: OptimizedRoute,
): Date | null {
  const startIndex = route.sssIndex;

  let nextTpEnterMs: number | null = null;
  for (const crossing of crossings) {
    if (!crossing.inSequence) continue;
    if (crossing.direction !== 'ENTER') continue;
    if (crossing.turnpointIndex <= startIndex) continue;
    nextTpEnterMs = crossing.time.getTime();
    break;
  }

  let latestExit: Date | null = null;
  for (const crossing of crossings) {
    if (crossing.role !== 'SSS' || crossing.direction !== 'EXIT') continue;
    const exitMs = crossing.time.getTime();
    if (nextTpEnterMs !== null && exitMs >= nextTpEnterMs) continue;
    if (!latestExit || exitMs > latestExit.getTime()) {
      latestExit = crossing.time;
    }
  }

  return latestExit;
}

function medianFixIntervalSec(points: TrackPoint[]): number | null {
  if (points.length < 2) return null;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const delta = (points[i].time.getTime() - points[i - 1].time.getTime()) / 1000;
    if (delta > 0 && delta < 120) deltas.push(delta);
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

export function computePilotTaskVerification(
  points: TrackPoint[],
  task: XcTask,
  route: OptimizedRoute,
  referenceDate: Date,
  taskStartMs?: number,
): { verification: PilotTaskVerification; pointStates: PointTaskProgressState[] } {
  const zones = buildTaskControlZones(task);
  const deadline = getTaskDeadlineTime(task, referenceDate) ?? null;
  const deadlineMs = deadline?.getTime() ?? null;
  const essIndex = getEssTurnpointIndex(task);
  const goalIndex = getGoalIndex(task);
  const startIndex = route.sssIndex;

  const inside = zones.map(() => false);
  let nextZone = 0;
  const crossings: TurnpointCrossing[] = [];
  let sssCrossTime: Date | null = null;
  let essCrossTime: Date | null = null;
  let goalCrossTime: Date | null = null;
  let currentLeg = -1;
  let finished = false;

  const pointStates: PointTaskProgressState[] = [];

  const warnings: string[] = [];
  const medianInterval = medianFixIntervalSec(points);
  if (medianInterval !== null && medianInterval > 5.5) {
    warnings.push(`Track log interval ~${medianInterval.toFixed(0)} s (competition rules expect ≤5 s).`);
  }

  for (const point of points) {
    const afterStart = taskStartMs === undefined || point.time.getTime() >= taskStartMs;
    const beforeDeadline = deadlineMs === null || point.time.getTime() <= deadlineMs;

    for (let z = 0; z < zones.length; z += 1) {
      const zone = zones[z];
      const wasInside = inside[z];
      const isInside = pointInCylinder(point, zone.center, zone.radius);
      if (detectCrossing(wasInside, isInside, zone.direction)) {
        const inSequence = z === nextZone;
        crossings.push({
          turnpointIndex: zone.turnpointIndex,
          name: zone.name,
          role: zone.role,
          direction: zone.direction,
          time: point.time,
          inSequence,
        });
        if (inSequence) {
          nextZone += 1;
          if (zone.role === 'SSS') {
            sssCrossTime = point.time;
            currentLeg = 0;
          } else if (
            afterStart &&
            !finished &&
            beforeDeadline &&
            zone.turnpointIndex === goalIndex
          ) {
            finished = true;
            goalCrossTime = point.time;
            currentLeg = Math.max(currentLeg, goalIndex - startIndex);
          } else if (afterStart && !finished && beforeDeadline) {
            currentLeg = zone.turnpointIndex - startIndex;
            if (essIndex !== null && zone.turnpointIndex === essIndex) {
              essCrossTime = point.time;
            }
          }
        }
      }
      inside[z] = isInside;
    }

    pointStates.push({
      legIndex: currentLeg,
      hasStarted: false,
      finished,
    });
  }

  const effectiveSssCrossTime = resolveEffectiveSssCrossTime(crossings, route) ?? sssCrossTime;
  sssCrossTime = effectiveSssCrossTime;
  const effectiveSssMs = sssCrossTime?.getTime() ?? null;

  if (effectiveSssMs !== null) {
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i]!;
      const state = pointStates[i]!;
      const afterStart = taskStartMs === undefined || point.time.getTime() >= taskStartMs;
      state.hasStarted =
        afterStart && point.time.getTime() >= effectiveSssMs;
    }
  }

  let assignedStartGate: string | null = null;
  let assignedStartGateTime: Date | null = null;
  let earlyStart = false;
  let earlyStartSeconds = 0;
  if (sssCrossTime) {
    const gate = resolveAssignedStartGate(task, referenceDate, sssCrossTime);
    assignedStartGate = gate.gate;
    assignedStartGateTime = gate.gateTime;
    earlyStart = gate.earlyStart;
    earlyStartSeconds = gate.earlyStartSeconds;
    if (earlyStart) {
      warnings.push(`Early start: SSS crossed ${earlyStartSeconds}s before first start gate.`);
    }
  }

  if (sssCrossTime && !essCrossTime && goalCrossTime) {
    essCrossTime = goalCrossTime;
  }

  let taskTimeSeconds: number | null = null;
  if (sssCrossTime && essCrossTime) {
    taskTimeSeconds = Math.max(0, Math.round((essCrossTime.getTime() - sssCrossTime.getTime()) / 1000));
  }

  const cappedAtDeadline = deadlineMs !== null && points.some((p) => p.time.getTime() > deadlineMs);

  if (cappedAtDeadline) {
    warnings.push('Task deadline set — progress shown only until deadline (GAP scoring).');
  }

  const landingTime = points.length > 0 ? points[points.length - 1].time : null;

  return {
    verification: {
      crossings,
      sssCrossTime,
      assignedStartGate,
      assignedStartGateTime,
      earlyStart,
      earlyStartSeconds,
      essCrossTime,
      goalCrossTime,
      landingTime,
      taskTimeSeconds,
      deadline,
      cappedAtDeadline,
      medianFixIntervalSec: medianInterval,
      warnings,
    },
    pointStates,
  };
}

/** End of speed section (ESS cross, or goal when the task has no separate ESS). */
export function getPilotSpeedSectionFinishTime(track: {
  verification: PilotTaskVerification;
}): Date | undefined {
  const { essCrossTime, goalCrossTime } = track.verification;
  if (essCrossTime) return essCrossTime;
  return goalCrossTime ?? undefined;
}
