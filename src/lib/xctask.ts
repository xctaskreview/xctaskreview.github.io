import type { LatLon, OptimizedRoute, RoutePoint, XcTask } from './types';
import { computeOptimizedRoute } from './route';
import { haversine, parseIsoDate, parseLocalTimeOnDate, parseUtcTimeOnDate } from './geo';

export function parseXcTask(text: string): XcTask {
  const task = JSON.parse(text) as XcTask;
  if (!task.turnpoints?.length) {
    throw new Error('Task file has no turnpoints');
  }
  return task;
}

export function getRoutePoints(task: XcTask): RoutePoint[] {
  return task.turnpoints.map((tp, index) => ({
    lat: tp.waypoint.lat,
    lon: tp.waypoint.lon,
    name: tp.waypoint.name,
    radius: tp.radius,
    type: tp.type,
    number: index + 1,
  }));
}

export function getGoalIndex(task: XcTask): number {
  const essIndex = task.turnpoints.findIndex((tp) => tp.type === 'ESS');
  if (essIndex >= 0) return essIndex;
  return task.turnpoints.length - 1;
}

export function buildOptimizedRoute(task: XcTask): OptimizedRoute {
  const routePoints = getRoutePoints(task);
  const centers = routePoints.map((p) => ({ lat: p.lat, lon: p.lon }));
  const radii = routePoints.map((p) => p.radius);
  const { fixes, totalDistance, legDistances } = computeOptimizedRoute(centers, radii);

  const cumulativeDistances = [0];
  for (const leg of legDistances) {
    cumulativeDistances.push(cumulativeDistances[cumulativeDistances.length - 1] + leg);
  }

  const sssIndex = task.turnpoints.findIndex((tp) => tp.type === 'SSS');
  const goalIndex = getGoalIndex(task);
  const startIndex = sssIndex >= 0 ? sssIndex : 0;

  const progressPoints = fixes.slice(startIndex, goalIndex + 1);
  const progressLegDistances = legDistances.slice(startIndex, goalIndex);
  const progressCumulativeDistances = [0];
  for (const leg of progressLegDistances) {
    progressCumulativeDistances.push(progressCumulativeDistances[progressCumulativeDistances.length - 1] + leg);
  }
  const progressTotalDistance = progressCumulativeDistances[progressCumulativeDistances.length - 1];

  const progressTurnpoints = task.turnpoints.slice(startIndex, goalIndex + 1).map((tp, i) => ({
    number: startIndex + i + 1,
    name: tp.waypoint.name,
    taskPercent:
      progressTotalDistance > 0
        ? (progressCumulativeDistances[i] / progressTotalDistance) * 100
        : 0,
    taskKm: progressCumulativeDistances[i] / 1000,
  }));

  const sssTp = task.turnpoints[startIndex];
  const goalTp = task.turnpoints[goalIndex];

  return {
    points: fixes,
    legDistances,
    totalDistance,
    cumulativeDistances,
    progressPoints,
    progressLegDistances,
    progressCumulativeDistances,
    progressTotalDistance,
    progressTurnpoints,
    sssIndex: startIndex,
    goalIndex,
    sssCenter: { lat: sssTp.waypoint.lat, lon: sssTp.waypoint.lon },
    sssRadius: sssTp.radius,
    goalCenter: { lat: goalTp.waypoint.lat, lon: goalTp.waypoint.lon },
    goalRadius: goalTp.radius,
  };
}

export function getTaskStartTime(task: XcTask, referenceDate: Date): Date | undefined {
  const gate = task.sss?.timeGates?.[0];
  if (!gate) return undefined;

  const date =
    task.eventDate !== undefined ? parseIsoDate(task.eventDate) : referenceDate;

  if (task.timeZone) {
    return parseLocalTimeOnDate(gate, date, task.timeZone);
  }

  return parseUtcTimeOnDate(gate, date);
}

export function getUniqueTurnpointCircles(task: XcTask): RoutePoint[] {
  const seen = new Set<string>();
  const circles: RoutePoint[] = [];

  for (const [index, tp] of task.turnpoints.entries()) {
    const key = `${tp.waypoint.name}:${tp.waypoint.lat.toFixed(6)}:${tp.waypoint.lon.toFixed(6)}:${tp.radius}`;
    if (seen.has(key)) continue;
    seen.add(key);
    circles.push({
      lat: tp.waypoint.lat,
      lon: tp.waypoint.lon,
      name: tp.waypoint.name,
      radius: tp.radius,
      type: tp.type,
      number: index + 1,
    });
  }

  return circles;
}

export function getUniqueTurnpointMarkers(circles: RoutePoint[]): RoutePoint[] {
  const seen = new Set<string>();
  const markers: RoutePoint[] = [];

  for (const circle of circles) {
    const key = `${circle.name ?? ''}:${circle.lat.toFixed(6)}:${circle.lon.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push(circle);
  }

  return markers;
}

export function getTaskBounds(task: XcTask): [[number, number], [number, number]] {
  const points = task.turnpoints.map((tp) => ({ lat: tp.waypoint.lat, lon: tp.waypoint.lon }));
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;

  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lonSpan = Math.max(maxLon - minLon, 0.002);
  // Tight fit on turnpoint centers only; cylinder radii may extend off-screen.
  const fillRatio = 0.995;
  const marginRatio = (1 / fillRatio - 1) / 2;
  const padLat = latSpan * marginRatio;
  const padLon = lonSpan * marginRatio;

  return [
    [minLat - padLat, minLon - padLon],
    [maxLat + padLat, maxLon + padLon],
  ];
}

export function getCenterDistance(task: XcTask): number {
  const routePoints = getRoutePoints(task);
  let total = 0;
  for (let i = 1; i < routePoints.length; i++) {
    total += haversine(routePoints[i - 1], routePoints[i]);
  }
  return total;
}

export interface TaskDisplayInfo {
  name: string;
  embeddedLocation: string | null;
  center: LatLon;
}

function readTaskStringField(task: XcTask, keys: Array<keyof XcTask>): string | null {
  for (const key of keys) {
    const value = task[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function getTaskDisplayInfo(task: XcTask, fileName: string): TaskDisplayInfo {
  const name =
    readTaskStringField(task, ['name', 'taskName', 'title']) ??
    fileName.replace(/\.(xctsk|json)$/i, '').replace(/^.*[/\\]/, '');

  const locationParts = [
    readTaskStringField(task, ['location', 'flyingSite']),
    [readTaskStringField(task, ['city']), readTaskStringField(task, ['region']), readTaskStringField(task, ['country'])]
      .filter(Boolean)
      .join(', '),
  ].filter((part) => part && part.length > 0) as string[];

  const embeddedLocation = locationParts[0] ?? (locationParts[1] || null);
  const points = task.turnpoints.map((tp) => ({ lat: tp.waypoint.lat, lon: tp.waypoint.lon }));
  const center = {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
  };

  return { name, embeddedLocation, center };
}

export function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

export async function resolveTaskLocationLabel(task: XcTask, fileName: string): Promise<string> {
  const info = getTaskDisplayInfo(task, fileName);
  if (info.embeddedLocation) return info.embeddedLocation;

  const coordinateLabel = formatCoordinates(info.center.lat, info.center.lon);

  try {
    const params = new URLSearchParams({
      format: 'json',
      lat: info.center.lat.toFixed(5),
      lon: info.center.lon.toFixed(5),
      zoom: '10',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return coordinateLabel;

    const data = (await response.json()) as { display_name?: string };
    if (data.display_name?.trim()) {
      const parts = data.display_name.split(',').map((part) => part.trim()).slice(0, 3);
      return parts.join(', ');
    }
  } catch {
    // Fall back to coordinates when reverse geocoding is unavailable.
  }

  return coordinateLabel;
}
