import { formatDuration } from './geo';
import { formatDistance, type DistanceUnit } from './preferences';
import type { TurnpointReachMarker } from './taskProgressMarker';
import type { OptimizedRoute, RoutePoint, TaskTiming } from './types';

export interface TurnpointTooltipDetails {
  number: number;
  name: string;
  taskPercent: number;
  taskKm: number;
  radiusM: number;
  firstPilot: string;
  firstTagTime: Date;
}

export interface TurnpointTooltipOptions {
  distanceUnit: DistanceUnit;
  taskStart?: Date;
}

export function formatTurnpointHoverLabel(
  details: TurnpointTooltipDetails,
  options: TurnpointTooltipOptions,
): string {
  const elapsed =
    options.taskStart !== undefined
      ? formatDuration(Math.max(0, details.firstTagTime.getTime() - options.taskStart.getTime()))
      : '—';

  return [
    `#${details.number} ${details.name}`,
    `Task ${details.taskPercent.toFixed(1)}% · ${formatDistance(details.taskKm, options.distanceUnit)} · ${details.radiusM} m radius`,
    `${elapsed} elapsed · ${details.firstPilot}`,
  ].join('\n');
}

export function turnpointTooltipLines(tooltip: string): string[] {
  return tooltip.split('\n');
}

function findCircleByNumber(circles: RoutePoint[], number: number): RoutePoint | undefined {
  return circles.find((circle) => circle.number === number);
}

function findProgressTurnpoint(route: OptimizedRoute, number: number) {
  return route.progressTurnpoints.find((turnpoint) => turnpoint.number === number);
}

export function buildTurnpointTooltipFromCircle(
  circle: RoutePoint,
  route: OptimizedRoute,
  reachMarker: TurnpointReachMarker | undefined,
  options: TurnpointTooltipOptions,
): string {
  const number = circle.number ?? 0;
  const progressTurnpoint = number > 0 ? findProgressTurnpoint(route, number) : undefined;

  return formatTurnpointHoverLabel(
    {
      number,
      name: circle.name ?? 'Turnpoint',
      taskPercent: progressTurnpoint?.taskPercent ?? reachMarker?.taskPercent ?? 0,
      taskKm: progressTurnpoint?.taskKm ?? reachMarker?.taskKm ?? 0,
      radiusM: circle.radius,
      firstPilot: reachMarker?.firstPilot ?? '—',
      firstTagTime: reachMarker?.firstTagTime ?? options.taskStart ?? new Date(0),
    },
    options,
  );
}

export function buildStartTurnpointTooltip(
  route: OptimizedRoute,
  circles: RoutePoint[],
  options: TurnpointTooltipOptions & { taskStart: Date },
): string | undefined {
  const startTurnpoint = route.progressTurnpoints[0];
  if (!startTurnpoint) return undefined;

  const circle = findCircleByNumber(circles, startTurnpoint.number);
  if (!circle) return undefined;

  return formatTurnpointHoverLabel(
    {
      number: startTurnpoint.number,
      name: startTurnpoint.name,
      taskPercent: startTurnpoint.taskPercent,
      taskKm: startTurnpoint.taskKm,
      radiusM: circle.radius,
      firstPilot: '—',
      firstTagTime: options.taskStart,
    },
    options,
  );
}

export function buildFinishTurnpointTooltip(
  route: OptimizedRoute,
  circles: RoutePoint[],
  timing: TaskTiming,
  options: TurnpointTooltipOptions,
): string | undefined {
  if (!timing.fastestFinish) return undefined;

  const goalTurnpoint = route.progressTurnpoints[route.progressTurnpoints.length - 1];
  if (!goalTurnpoint) return undefined;

  const circle = findCircleByNumber(circles, goalTurnpoint.number);

  return formatTurnpointHoverLabel(
    {
      number: goalTurnpoint.number,
      name: goalTurnpoint.name,
      taskPercent: goalTurnpoint.taskPercent,
      taskKm: goalTurnpoint.taskKm,
      radiusM: circle?.radius ?? 0,
      firstPilot: timing.fastestPilot ?? '—',
      firstTagTime: timing.fastestFinish,
    },
    options,
  );
}

export function buildReachMarkerMap(
  markers: TurnpointReachMarker[],
): Map<number, TurnpointReachMarker> {
  return new Map(markers.map((marker) => [marker.number, marker]));
}
