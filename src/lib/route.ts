import type { LatLon } from './types';
import { createLocalProjection, haversine } from './geo';

interface PlanarPoint {
  x: number;
  y: number;
  radius: number;
  fx: number;
  fy: number;
}

function createPoint(x: number, y: number, radius = 0): PlanarPoint {
  return { x, y, radius, fx: x, fy: y };
}

function createPointFromFix(point: PlanarPoint): PlanarPoint {
  return createPoint(point.fx, point.fy, point.radius);
}

function createPointFromCenter(point: PlanarPoint): PlanarPoint {
  return createPoint(point.x, point.y, point.radius);
}

function projectOnCircle(c: PlanarPoint, x: number, y: number, len: number): void {
  if (len === 0) {
    c.fx = c.radius + c.x;
    c.fy = c.y;
    return;
  }
  c.fx = c.radius * ((x - c.x) / len) + c.x;
  c.fy = c.radius * ((y - c.y) / len) + c.y;
}

function getIntersectionPoints(
  c: PlanarPoint,
  a: PlanarPoint,
  b: PlanarPoint,
  distAB: number,
): [PlanarPoint, PlanarPoint, PlanarPoint] {
  const dx = (b.x - a.x) / distAB;
  const dy = (b.y - a.y) / distAB;
  const t2 = dx * (c.x - a.x) + dy * (c.y - a.y);
  const ex = t2 * dx + a.x;
  const ey = t2 * dy + a.y;
  const dt2 = c.radius ** 2 - (ex - c.x) ** 2 - (ey - c.y) ** 2;
  const dt = dt2 > 0 ? Math.sqrt(dt2) : 0;
  return [
    createPoint((t2 - dt) * dx + a.x, (t2 - dt) * dy + a.y),
    createPoint((t2 + dt) * dx + a.x, (t2 + dt) * dy + a.y),
    createPoint(ex, ey),
  ];
}

function getRelativeDistances(
  c: PlanarPoint,
  a: PlanarPoint,
  b: PlanarPoint,
): [number, number, number, number] {
  const distAC = Math.hypot(a.x - c.x, a.y - c.y);
  const distBC = Math.hypot(b.x - c.x, b.y - c.y);
  const len2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const distAB = Math.sqrt(len2);

  let distCtoAB: number;
  if (len2 === 0) {
    distCtoAB = distAC;
  } else {
    const t = ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / len2;
    if (t < 0) distCtoAB = distAC;
    else if (t > 1) distCtoAB = distBC;
    else {
      const cpx = t * (b.x - a.x) + a.x;
      const cpy = t * (b.y - a.y) + a.y;
      distCtoAB = Math.hypot(cpx - c.x, cpy - c.y);
    }
  }

  return [distAC, distBC, distAB, distCtoAB];
}

function setIntersection1(c: PlanarPoint, a: PlanarPoint, b: PlanarPoint, distAB: number): void {
  const [s1, s2] = getIntersectionPoints(c, a, b, distAB);
  const as1 = Math.hypot(a.x - s1.x, a.y - s1.y);
  const bs1 = Math.hypot(b.x - s1.x, b.y - s1.y);
  if (Math.abs(as1 + bs1 - distAB) < 0.0001) {
    c.fx = s1.x;
    c.fy = s1.y;
  } else {
    c.fx = s2.x;
    c.fy = s2.y;
  }
}

function setIntersection2(c: PlanarPoint, a: PlanarPoint, b: PlanarPoint, distAB: number): void {
  const [s1, s2, e] = getIntersectionPoints(c, a, b, distAB);
  const as1 = Math.hypot(a.x - s1.x, a.y - s1.y);
  const es1 = Math.hypot(e.x - s1.x, e.y - s1.y);
  const ae = Math.hypot(a.x - e.x, a.y - e.y);
  if (Math.abs(as1 + es1 - ae) < 0.0001) {
    c.fx = s1.x;
    c.fy = s1.y;
  } else {
    c.fx = s2.x;
    c.fy = s2.y;
  }
}

function setReflection(c: PlanarPoint, a: PlanarPoint, b: PlanarPoint): void {
  const af = Math.hypot(a.x - c.fx, a.y - c.fy);
  const bf = Math.hypot(b.x - c.fx, b.y - c.fy);
  const t = af / (af + bf);
  const kx = t * (b.x - a.x) + a.x;
  const ky = t * (b.y - a.y) + a.y;
  const kc = Math.hypot(kx - c.x, ky - c.y);
  projectOnCircle(c, kx, ky, kc);
}

function pointOnCircle(
  c: PlanarPoint,
  a: PlanarPoint,
  b: PlanarPoint,
  distAC: number,
  distBC: number,
  distAB: number,
  distCtoAB: number,
): boolean {
  if (Math.abs(distAC - c.radius) < 0.0001) {
    c.fx = a.x;
    c.fy = a.y;
    return true;
  }
  if (Math.abs(distBC - c.radius) < 0.0001) {
    if (distCtoAB < c.radius && distAC > c.radius) {
      setIntersection2(c, a, b, distAB);
    } else {
      c.fx = b.x;
      c.fy = b.y;
    }
    return true;
  }
  return false;
}

function processCylinder(c: PlanarPoint, a: PlanarPoint, b: PlanarPoint): void {
  const [distAC, distBC, distAB, distCtoAB] = getRelativeDistances(c, a, b);

  if (distAB === 0) {
    projectOnCircle(c, a.x, a.y, distAC);
  } else if (pointOnCircle(c, a, b, distAC, distBC, distAB, distCtoAB)) {
    return;
  } else if (distCtoAB < c.radius) {
    if (distAC < c.radius && distBC < c.radius) {
      setReflection(c, a, b);
    } else if (
      (distAC < c.radius && distBC > c.radius) ||
      (distAC > c.radius && distBC < c.radius)
    ) {
      setIntersection1(c, a, b, distAB);
    } else if (distAC > c.radius && distBC > c.radius) {
      setIntersection2(c, a, b, distAB);
    }
  } else {
    setReflection(c, a, b);
  }
}

function getTargetPoints(
  points: PlanarPoint[],
  count: number,
  index: number,
): [PlanarPoint, PlanarPoint, PlanarPoint] {
  const c = points[index];
  const a = createPointFromFix(points[index - 1]);
  const b = index === count - 1 ? createPointFromCenter(c) : createPointFromFix(points[index + 1]);
  return [c, a, b];
}

function optimizePath(points: PlanarPoint[], count: number): number {
  let distance = 0;
  for (let index = 1; index < count; index++) {
    const [c, a, b] = getTargetPoints(points, count, index);
    processCylinder(c, a, b);
    distance += Math.hypot(a.x - c.fx, a.y - c.fy);
  }
  return distance;
}

function getShortestPathPlanar(points: PlanarPoint[]): PlanarPoint[] {
  const tolerance = 1.0;
  const maxIterations = 200;
  let lastDistance = Number.MAX_VALUE;
  let finished = false;
  let opsCount = maxIterations;

  while (!finished && opsCount-- > 0) {
    const distance = optimizePath(points, points.length);
    finished = lastDistance - distance < tolerance;
    lastDistance = distance;
  }

  return points;
}

export function computeOptimizedRoute(
  centers: LatLon[],
  radii: number[],
): { fixes: LatLon[]; totalDistance: number; legDistances: number[] } {
  if (centers.length === 0) {
    return { fixes: [], totalDistance: 0, legDistances: [] };
  }

  const origin = centers[0];
  const projection = createLocalProjection(origin);
  const planarPoints = centers.map((center, i) => {
    const local = projection.toLocal(center);
    return createPoint(local.x, local.y, radii[i] ?? 0);
  });

  getShortestPathPlanar(planarPoints);

  const fixes = planarPoints.map((p) => projection.toLatLon(p.fx, p.fy));
  const legDistances: number[] = [];
  let totalDistance = 0;

  for (let i = 1; i < fixes.length; i++) {
    const leg = haversine(fixes[i - 1], fixes[i]);
    legDistances.push(leg);
    totalDistance += leg;
  }

  return { fixes, totalDistance, legDistances };
}

export function progressAlongRoute(
  position: LatLon,
  routeFixes: LatLon[],
  legDistances: number[],
): number {
  if (routeFixes.length < 2 || legDistances.length === 0) return 0;

  const origin = routeFixes[0];
  const projection = createLocalProjection(origin);
  const p = projection.toLocal(position);
  let bestDistance = 0;
  let bestAlong = 0;
  let cumulative = 0;

  for (let i = 0; i < routeFixes.length - 1; i++) {
    const a = projection.toLocal(routeFixes[i]);
    const b = projection.toLocal(routeFixes[i + 1]);
    const result = distancePointToSegmentPlanar(p, a, b);
    if (result.distance < bestDistance || i === 0) {
      bestDistance = result.distance;
      bestAlong = cumulative + result.t * legDistances[i];
    }
    cumulative += legDistances[i];
  }

  return bestAlong;
}

function distancePointToSegmentPlanar(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return { distance: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return { distance: Math.hypot(p.x - px, p.y - py), t };
}
