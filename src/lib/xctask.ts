import type { EditableTurnpointRow, LatLon, OptimizedRoute, RoutePoint, TaskEditDraft, Turnpoint, TurnpointTypeOption, XcTask } from './types';
import { computeOptimizedRoute } from './route';
import { haversine, parseIsoDate, parseLocalTimeOnDate, parseUtcTimeOnDate } from './geo';

export function parseXcTask(text: string): XcTask {
  const task = JSON.parse(text) as XcTask;
  if (!task.turnpoints?.length) {
    throw new Error('Task file has no turnpoints');
  }
  return task;
}

export function getTaskStartGate(task: XcTask): string {
  return task.sss?.timeGates?.[0] ?? '';
}

function normalizeTimeGate(timeGate: string): string {
  const match = timeGate.trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?(Z)?$/i);
  if (!match) throw new Error('Start time must be HH:MM or HH:MM:SS');
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}${match[4] ?? ''}`;
}

let turnpointRowKeyCounter = 0;

function nextTurnpointRowKey(): string {
  turnpointRowKeyCounter += 1;
  return `tp-row-${turnpointRowKeyCounter}`;
}

function editableRowFromTurnpoint(tp: Turnpoint): EditableTurnpointRow {
  let type: TurnpointTypeOption = tp.type ?? '';
  if (!type) {
    const label = tp.waypoint.name.trim();
    if (isStartTurnpointLabel(label)) type = 'SSS';
    else if (isEndTurnpointLabel(label)) type = 'ESS';
  }

  return {
    key: nextTurnpointRowKey(),
    name: tp.waypoint.name,
    lat: String(tp.waypoint.lat),
    lon: String(tp.waypoint.lon),
    radius: String(tp.radius),
    type,
    altSmoothed: tp.waypoint.altSmoothed,
    description: tp.waypoint.description,
  };
}

export function createEmptyTurnpointRow(template?: EditableTurnpointRow): EditableTurnpointRow {
  return {
    key: nextTurnpointRowKey(),
    name: template ? `${template.name || 'TP'} copy` : 'TP',
    lat: template?.lat ?? '0',
    lon: template?.lon ?? '0',
    radius: template?.radius ?? '400',
    type: '',
    altSmoothed: template?.altSmoothed,
    description: template?.description,
  };
}

export function createTaskEditDraft(task: XcTask): TaskEditDraft {
  return {
    turnpoints: task.turnpoints.map(editableRowFromTurnpoint),
    startTime: getTaskStartGate(task),
  };
}

export function taskEditDraftEquals(task: XcTask, draft: TaskEditDraft): boolean {
  const current = createTaskEditDraft(task);
  if (current.startTime !== draft.startTime.trim() || current.turnpoints.length !== draft.turnpoints.length) {
    return false;
  }
  return current.turnpoints.every((row, i) => {
    const edited = draft.turnpoints[i];
    return (
      row.name === edited.name.trim() &&
      row.lat === edited.lat.trim() &&
      row.lon === edited.lon.trim() &&
      row.radius === edited.radius.trim() &&
      row.type === edited.type
    );
  });
}

function turnpointsEffectivelyEqual(a: Turnpoint[], b: Turnpoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tp, index) => {
    const other = b[index];
    return (
      tp.radius === other.radius &&
      (tp.type ?? '') === (other.type ?? '') &&
      tp.waypoint.name === other.waypoint.name &&
      tp.waypoint.lat === other.waypoint.lat &&
      tp.waypoint.lon === other.waypoint.lon
    );
  });
}

export function taskEffectivelyEquals(a: XcTask, b: XcTask): boolean {
  const aGate = a.sss?.timeGates?.[0] ?? '';
  const bGate = b.sss?.timeGates?.[0] ?? '';
  let aNormalized = aGate;
  let bNormalized = bGate;
  try {
    if (aGate) aNormalized = normalizeTimeGate(aGate);
    if (bGate) bNormalized = normalizeTimeGate(bGate);
  } catch {
    return false;
  }
  return aNormalized === bNormalized && turnpointsEffectivelyEqual(a.turnpoints, b.turnpoints);
}

export function applyTaskEditDraft(baseTask: XcTask, draft: TaskEditDraft): XcTask {
  if (!draft.turnpoints.length) throw new Error('Task must have at least one turnpoint');

  const turnpoints: Turnpoint[] = draft.turnpoints.map((row, index) => {
    const name = row.name.trim();
    if (!name) throw new Error(`Turnpoint ${index + 1}: name is required`);

    const lat = Number(row.lat);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`Turnpoint ${index + 1}: latitude must be between -90 and 90`);
    }

    const lon = Number(row.lon);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new Error(`Turnpoint ${index + 1}: longitude must be between -180 and 180`);
    }

    const radius = Number(row.radius);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error(`Turnpoint ${index + 1}: radius must be a positive number`);
    }

    const waypoint = {
      name,
      lat,
      lon,
      ...(row.altSmoothed !== undefined ? { altSmoothed: row.altSmoothed } : {}),
      ...(row.description !== undefined ? { description: row.description } : {}),
    };

    return {
      radius,
      type: row.type || undefined,
      waypoint,
    };
  });

  const startTime = draft.startTime.trim();
  let sss = baseTask.sss;
  if (startTime) {
    sss = {
      ...baseTask.sss,
      type: baseTask.sss?.type ?? 'RACE',
      direction: baseTask.sss?.direction ?? 'EXIT',
      timeGates: [normalizeTimeGate(startTime)],
    };
  } else if (sss?.timeGates?.length) {
    sss = { ...sss, timeGates: [] };
  }

  return { ...baseTask, turnpoints, sss };
}

export function tryApplyTaskEditDraft(baseTask: XcTask, draft: TaskEditDraft): XcTask | null {
  try {
    return applyTaskEditDraft(baseTask, draft);
  } catch {
    return null;
  }
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

export function getTurnpointLabel(tp: Turnpoint): string {
  return tp.waypoint.name.trim();
}

export function isStartTurnpointLabel(label: string): boolean {
  const upper = label.toUpperCase();
  return upper.endsWith('SS') && !upper.endsWith('ES');
}

export function isEndTurnpointLabel(label: string): boolean {
  return label.toUpperCase().trim().endsWith('ES');
}

export function getStartIndex(task: XcTask): number {
  const ssSuffixIndex = task.turnpoints.findIndex((tp) =>
    isStartTurnpointLabel(getTurnpointLabel(tp)),
  );
  if (ssSuffixIndex >= 0) return ssSuffixIndex;
  const sssIndex = task.turnpoints.findIndex((tp) => tp.type === 'SSS');
  if (sssIndex >= 0) return sssIndex;
  return 0;
}

export function getGoalIndex(task: XcTask): number {
  const esSuffixIndex = task.turnpoints.findIndex((tp) =>
    isEndTurnpointLabel(getTurnpointLabel(tp)),
  );
  if (esSuffixIndex >= 0) return esSuffixIndex;
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

  const startIndex = getStartIndex(task);
  const goalIndex = getGoalIndex(task);

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
