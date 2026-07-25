import L from 'leaflet';
import type { LatLon, OptimizedRoute, ProgressTurnpoint, RoutePoint } from './types';

export const TASK_PROGRESS_COLOR = '#059669';
export const TASK_PROGRESS_LINE_COLOR = TASK_PROGRESS_COLOR;
export const ROUTE_DASH_ARRAY = '6 5';

export interface TaskMapLayerRefs {
  circles: Map<string, L.Circle>;
  markers: Map<string, L.Marker>;
}

const GOAL_COLOR = '#dc2626';
const START_COLOR = '#2563eb';
const DEFAULT_TURNPOINT_COLOR = '#64748b';
const LANDING_COLOR = DEFAULT_TURNPOINT_COLOR;

export { DEFAULT_TURNPOINT_COLOR, GOAL_COLOR, LANDING_COLOR, START_COLOR };

export const ROUTE_LEG_COLOR = '#111827';
export const TURNPOINT_CIRCLE_WEIGHT = 2;
export const TURNPOINT_FILL_OPACITY = 0.08;
export const NEXT_TURNPOINT_FILL_OPACITY = 0.35;
export const ROUTE_LEG_WEIGHT = 1.5;
export const COMPLETED_LEG_WEIGHT = 12;
export const COMPLETED_LEG_OPACITY = 0.45;
export const PROGRESS_INDICATOR_WEIGHT = 2.5;
export const PROGRESS_INDICATOR_OPACITY = 0.95;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function circleKey(circle: RoutePoint): string {
  return `${circle.name ?? ''}-${circle.lat.toFixed(6)}-${circle.lon.toFixed(6)}-${circle.radius}`;
}

function matchesGoal(circle: RoutePoint, route: OptimizedRoute): boolean {
  return (
    circle.lat === route.goalCenter.lat &&
    circle.lon === route.goalCenter.lon &&
    circle.radius === route.goalRadius
  );
}

export function isLandingTurnpoint(circle: RoutePoint, route: OptimizedRoute): boolean {
  if (circle.number === undefined) return false;
  return circle.number - 1 > route.goalIndex;
}

export function isPreStartTurnpoint(circle: RoutePoint, route: OptimizedRoute): boolean {
  if (circle.number === undefined) return false;
  return circle.number - 1 < route.sssIndex;
}

export function isNonTaskTurnpoint(circle: RoutePoint, route: OptimizedRoute): boolean {
  return isPreStartTurnpoint(circle, route) || isLandingTurnpoint(circle, route);
}

export function getDefaultTurnpointColor(circle: RoutePoint, route: OptimizedRoute): string {
  if (matchesGoal(circle, route)) return GOAL_COLOR;
  if (circle.type === 'SSS') return START_COLOR;
  if (circle.type === 'ESS') return GOAL_COLOR;
  if (isNonTaskTurnpoint(circle, route)) return LANDING_COLOR;
  return DEFAULT_TURNPOINT_COLOR;
}

export function isStartTurnpoint(circle: RoutePoint, route: OptimizedRoute): boolean {
  if (circle.type === 'SSS') return true;
  return getProgressIndexForCircle(circle, route) === 0;
}

export function isGoalTurnpoint(circle: RoutePoint, route: OptimizedRoute): boolean {
  if (matchesGoal(circle, route)) return true;
  if (circle.type === 'ESS') return true;
  const index = getProgressIndexForCircle(circle, route);
  return index >= 0 && index === route.progressTurnpoints.length - 1;
}

export function isGoalProgressTurnpoint(tpNumber: number, route: OptimizedRoute): boolean {
  return tpNumber === route.goalIndex + 1;
}

export function getTurnpointColor(
  circle: RoutePoint,
  route: OptimizedRoute,
  tagged: boolean,
  progressColor: string = TASK_PROGRESS_COLOR,
): string {
  if (
    isStartTurnpoint(circle, route) ||
    isGoalTurnpoint(circle, route) ||
    isNonTaskTurnpoint(circle, route)
  ) {
    return getDefaultTurnpointColor(circle, route);
  }
  return tagged ? progressColor : getDefaultTurnpointColor(circle, route);
}

export function getTurnpointCirclePathOptions(
  circle: RoutePoint,
  route: OptimizedRoute,
  tagged: boolean,
  fillHighlight = false,
  progressColor: string = TASK_PROGRESS_COLOR,
): L.PathOptions {
  const color = getTurnpointColor(circle, route, tagged, progressColor);
  const highlightNext = fillHighlight && !tagged;

  return {
    color,
    weight: TURNPOINT_CIRCLE_WEIGHT,
    fillColor: highlightNext ? progressColor : color,
    fillOpacity: highlightNext ? NEXT_TURNPOINT_FILL_OPACITY : TURNPOINT_FILL_OPACITY,
    dashArray: isNonTaskTurnpoint(circle, route) ? ROUTE_DASH_ARRAY : undefined,
  };
}

export function turnpointIcon(color: string, name: string): L.DivIcon {
  return L.divIcon({
    className: 'turnpoint-marker-container',
    html: `<div class="turnpoint-marker-column">
      <div class="turnpoint-cross" style="color:${color}"></div>
      <span class="turnpoint-label" style="color:${color}">${escapeHtml(name)}</span>
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function getProgressIndexForCircle(circle: RoutePoint, route: OptimizedRoute): number {
  if (circle.number === undefined) return -1;

  const progressIndex = circle.number - 1 - route.sssIndex;
  if (progressIndex >= 0 && progressIndex < route.progressPoints.length) {
    return progressIndex;
  }

  return -1;
}

export function findCircleForProgressIndex(
  progressIndex: number,
  route: OptimizedRoute,
  circles: RoutePoint[],
): RoutePoint | undefined {
  for (const circle of circles) {
    if (getProgressIndexForCircle(circle, route) === progressIndex) {
      return circle;
    }
  }

  const tp = route.progressTurnpoints[progressIndex];
  if (tp?.number !== undefined) {
    return circles.find((circle) => circle.number === tp.number);
  }

  return undefined;
}

export function getTaggedTurnpointProgressIndices(
  route: OptimizedRoute,
  progressPercent: number,
): Set<number> {
  const tagged = new Set<number>();
  if (progressPercent <= 0 || route.progressTotalDistance <= 0) {
    return tagged;
  }

  const targetDistance = (progressPercent / 100) * route.progressTotalDistance;
  for (let i = 0; i < route.progressCumulativeDistances.length; i += 1) {
    if (targetDistance >= route.progressCumulativeDistances[i]) {
      tagged.add(i);
    }
  }

  return tagged;
}

export function isCircleTagged(
  circle: RoutePoint,
  route: OptimizedRoute,
  progressPercent: number,
): boolean {
  const index = getProgressIndexForCircle(circle, route);
  if (index < 0) return false;
  return getTaggedTurnpointProgressIndices(route, progressPercent).has(index);
}

export function buildCompletedRouteSegments(
  route: OptimizedRoute,
  progressPercent: number,
): LatLon[][] {
  if (progressPercent <= 0 || route.progressTotalDistance <= 0) {
    return [];
  }

  const targetDistance = (progressPercent / 100) * route.progressTotalDistance;
  const segments: LatLon[][] = [];

  for (let legIndex = 0; legIndex < route.progressLegDistances.length; legIndex += 1) {
    const legStartDistance = route.progressCumulativeDistances[legIndex] ?? 0;
    const legEndDistance = route.progressCumulativeDistances[legIndex + 1] ?? legStartDistance;
    const legStart = route.progressPoints[legIndex];
    const legEnd = route.progressPoints[legIndex + 1] ?? legStart;

    if (targetDistance >= legEndDistance) {
      segments.push([legStart, legEnd]);
      continue;
    }

    if (targetDistance > legStartDistance) {
      const legLength = route.progressLegDistances[legIndex] ?? 0;
      const fraction =
        legLength > 0 ? Math.max(0, Math.min(1, (targetDistance - legStartDistance) / legLength)) : 0;
      segments.push([
        legStart,
        {
          lat: legStart.lat + (legEnd.lat - legStart.lat) * fraction,
          lon: legStart.lon + (legEnd.lon - legStart.lon) * fraction,
        },
      ]);
    }

    break;
  }

  return segments;
}

export interface RouteLegSegment {
  legNumber: number;
  from: ProgressTurnpoint;
  to: ProgressTurnpoint;
  points: [LatLon, LatLon];
}

export function getProgressRouteLegs(route: OptimizedRoute): RouteLegSegment[] {
  const legs: RouteLegSegment[] = [];

  for (let legIndex = 0; legIndex < route.progressLegDistances.length; legIndex += 1) {
    const from = route.progressTurnpoints[legIndex];
    const to = route.progressTurnpoints[legIndex + 1];
    const start = route.progressPoints[legIndex];
    const end = route.progressPoints[legIndex + 1];
    if (!from || !to || !start || !end) continue;

    legs.push({
      legNumber: legIndex + 1,
      from,
      to,
      points: [start, end],
    });
  }

  return legs;
}

export function formatProgressTurnpointLabel(turnpoint: ProgressTurnpoint): string {
  return `#${turnpoint.number} ${turnpoint.name}`;
}

export function getPostGoalRouteSegments(route: OptimizedRoute): [LatLon, LatLon][] {
  const segments: [LatLon, LatLon][] = [];

  for (let index = route.goalIndex; index < route.points.length - 1; index += 1) {
    segments.push([route.points[index], route.points[index + 1]]);
  }

  return segments;
}

export function getLeaderNextLegSegment(
  route: OptimizedRoute,
  legIndex: number,
  hasStarted: boolean,
  finished: boolean,
): [LatLon, LatLon] | null {
  if (!hasStarted || finished) return null;
  if (legIndex < 0 || legIndex >= route.progressLegDistances.length) return null;

  const start = route.progressPoints[legIndex];
  const end = route.progressPoints[legIndex + 1];
  if (!start || !end) return null;

  return [start, end];
}
