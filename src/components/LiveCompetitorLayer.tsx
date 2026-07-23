import { useEffect, useRef, type RefObject } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { clampDisplayAltitudeMeters, computeSpeedsAtTime, LANDED_COLOR } from '../lib/geo';
import { extractGliderType, pilotFirstName } from '../lib/igc';
import { formatAltitude, formatDistance, normalizePilotTrailLengthM, type AppPreferences } from '../lib/preferences';
import {
  buildCompletedRouteSegments,
  circleKey,
  getLeaderNextLegSegment,
  getTurnpointCirclePathOptions,
  getTurnpointColor,
  isCircleTagged,
  ROUTE_DASH_ARRAY,
  TASK_PROGRESS_LINE_COLOR,
  turnpointIcon,
  type TaskMapLayerRefs,
} from '../lib/taskMapStyle';
import { getTrackColor, getTrackSnapshotAtTime } from '../lib/tracks';
import { computeCompetitorPositions } from '../lib/competitors';
import { buildPilotTrailLatLngs } from '../lib/pilotTrail';
import { formatCompetitorLeaderboardPopupHtml } from '../lib/scoreboardDisplay';
import {
  computeTaskProgressMarker,
  getProgressLabelAnchor,
  getTaskCenter,
  type TaskProgressMarker,
  type TaskProgressMarkerCache,
} from '../lib/taskProgressMarker';
import { findLeaderAtTime, type EnrichedFlightTrack } from '../lib/taskProgress';
import type { OptimizedRoute, RoutePoint } from '../lib/types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOutwardTooltipDirection(dx: number, dy: number): L.Direction {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

function getProgressLabelClassName(direction: L.Direction): string {
  return `task-progress-map-label task-progress-map-label--${direction}`;
}

const PILOT_MARKER_SIZE_PX = 16;
const PILOT_MARKER_ANCHOR_PX = PILOT_MARKER_SIZE_PX / 2;
const PILOT_LABEL_UPDATE_INTERVAL_MS = 1000;

function createCompetitorIcon(
  color: string,
  firstName: string,
  altitudeLabel: string,
  landed: boolean,
): L.DivIcon {
  const markerColor = landed ? LANDED_COLOR : color;
  const labelBoxClass = landed ? 'competitor-label-box landed' : 'competitor-label-box';

  return L.divIcon({
    className: 'competitor-marker-container',
    html: `<div class="competitor-marker-column${landed ? ' landed' : ''}">
      <div class="competitor-marker" style="background:${markerColor}"></div>
      <div class="${labelBoxClass}">
        <span class="competitor-label">${escapeHtml(firstName)}</span>
        <span class="competitor-alt">${escapeHtml(altitudeLabel)}</span>
      </div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [PILOT_MARKER_ANCHOR_PX, PILOT_MARKER_ANCHOR_PX],
  });
}

interface MarkerEntry {
  marker: L.Marker;
  labelBoxEl: HTMLDivElement | null;
  labelEl: HTMLSpanElement | null;
  altEl: HTMLSpanElement | null;
  markerEl: HTMLDivElement | null;
  columnEl: HTMLDivElement | null;
  color: string;
  firstName: string;
  landed: boolean;
}

interface TrailEntry {
  polyline: L.Polyline;
  color: string;
}

interface LiveCompetitorLayerProps {
  tracks: EnrichedFlightTrack[];
  route: OptimizedRoute;
  circles: RoutePoint[];
  layerRefs: RefObject<TaskMapLayerRefs>;
  trackColors: Record<string, string>;
  currentTimeRef: RefObject<Date>;
  preferences: AppPreferences;
  playing: boolean;
  pausedTime: Date;
  taskStart?: Date;
  trackKey: string;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
  leadPercentages: Map<string, number>;
}

export function LiveCompetitorLayer({
  tracks,
  route,
  circles,
  layerRefs,
  trackColors,
  currentTimeRef,
  preferences,
  playing,
  pausedTime,
  taskStart,
  trackKey,
  taskProgressMarkerRef,
  leadPercentages,
}: LiveCompetitorLayerProps) {
  const map = useMap();
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const trailsRef = useRef<Map<string, TrailEntry>>(new Map());
  const progressLineRef = useRef<L.Polyline | null>(null);
  const completedRouteRef = useRef<L.Polyline | null>(null);
  const leaderNextLegLineRef = useRef<L.Polyline | null>(null);
  const leaderNextTpKeyRef = useRef<string | null>(null);
  const progressLabelRef = useRef<{ marker: L.Marker; labelEl: HTMLDivElement | null } | null>(null);
  const progressCacheRef = useRef<TaskProgressMarkerCache | null>(null);
  const taggedTurnpointStateRef = useRef<Map<string, boolean>>(new Map());
  const tracksRef = useRef(tracks);
  const routeRef = useRef(route);
  const circlesRef = useRef(circles);
  const trackColorsRef = useRef(trackColors);
  const preferencesRef = useRef(preferences);
  const taskStartRef = useRef(taskStart);
  const trackKeyRef = useRef(trackKey);
  const leadPercentagesRef = useRef(leadPercentages);
  const taskCenterRef = useRef(getTaskCenter(route));

  tracksRef.current = tracks;
  routeRef.current = route;
  circlesRef.current = circles;
  trackColorsRef.current = trackColors;
  preferencesRef.current = preferences;
  taskStartRef.current = taskStart;
  trackKeyRef.current = trackKey;
  leadPercentagesRef.current = leadPercentages;
  taskCenterRef.current = getTaskCenter(route);

  useEffect(() => {
    const leaderNextLegLine = L.polyline([], {
      color: '#111827',
      weight: 3.5,
      opacity: 1,
      dashArray: ROUTE_DASH_ARRAY,
      interactive: false,
    });
    leaderNextLegLine.addTo(map);
    leaderNextLegLineRef.current = leaderNextLegLine;

    const completedRoute = L.polyline([], {
      color: TASK_PROGRESS_LINE_COLOR,
      weight: 3,
      opacity: 0.95,
      dashArray: ROUTE_DASH_ARRAY,
    });
    completedRoute.addTo(map);
    completedRouteRef.current = completedRoute;

    const progressLine = L.polyline([], {
      color: TASK_PROGRESS_LINE_COLOR,
      weight: 2.5,
      opacity: 0.95,
    });
    progressLine.addTo(map);
    progressLineRef.current = progressLine;

    const labelMarker = L.marker([0, 0], {
      icon: L.divIcon({
        className: 'task-progress-label-container',
        html: '<div class="task-progress-map-label task-progress-map-label--right"></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
      zIndexOffset: 1200,
    });
    labelMarker.addTo(map);
    progressLabelRef.current = {
      marker: labelMarker,
      labelEl: labelMarker.getElement()?.querySelector<HTMLDivElement>('.task-progress-map-label') ?? null,
    };

    return () => {
      progressLine.remove();
      progressLineRef.current = null;
      completedRoute.remove();
      completedRouteRef.current = null;
      leaderNextLegLine.remove();
      leaderNextLegLineRef.current = null;
      leaderNextTpKeyRef.current = null;
      labelMarker.remove();
      progressLabelRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const markers = markersRef.current;
    const trails = trailsRef.current;
    const activeIds = new Set(tracks.map((track) => track.id));

    for (const id of [...markers.keys()]) {
      if (!activeIds.has(id)) {
        markers.get(id)?.marker.remove();
        markers.delete(id);
      }
    }

    for (const id of [...trails.keys()]) {
      if (!activeIds.has(id)) {
        trails.get(id)?.polyline.remove();
        trails.delete(id);
      }
    }

    for (const [index, track] of tracks.entries()) {
      const color = getTrackColor(track.id, trackColors, index);

      if (!trails.has(track.id)) {
        const polyline = L.polyline([], {
          color,
          weight: 3,
          opacity: 0.85,
          interactive: false,
        });
        polyline.addTo(map);
        trails.set(track.id, { polyline, color });
      }

      if (markers.has(track.id)) continue;

      const firstName = pilotFirstName(track.pilotName);
      const icon = createCompetitorIcon(color, firstName, '—', false);
      const marker = L.marker([0, 0], { icon, zIndexOffset: 1000 });
      marker.bindPopup('');
      marker.addTo(map);

      const element = marker.getElement();
      const columnEl = element?.querySelector<HTMLDivElement>('.competitor-marker-column') ?? null;
      const markerEl = element?.querySelector<HTMLDivElement>('.competitor-marker') ?? null;
      const labelBoxEl = element?.querySelector<HTMLDivElement>('.competitor-label-box') ?? null;
      const labelEl = element?.querySelector<HTMLSpanElement>('.competitor-label') ?? null;
      const altEl = element?.querySelector<HTMLSpanElement>('.competitor-alt') ?? null;

      markers.set(track.id, {
        marker,
        labelBoxEl,
        labelEl,
        altEl,
        markerEl,
        columnEl,
        color,
        firstName,
        landed: false,
      });
    }
  }, [tracks, trackColors, map]);

  useEffect(() => {
    return () => {
      for (const entry of markersRef.current.values()) {
        entry.marker.remove();
      }
      markersRef.current.clear();
      for (const entry of trailsRef.current.values()) {
        entry.polyline.remove();
      }
      trailsRef.current.clear();
      progressCacheRef.current = null;
      taskProgressMarkerRef.current = null;
    };
  }, [map, taskProgressMarkerRef]);

  useEffect(() => {
    const taskDistanceKm = route.progressTotalDistance / 1000;

    const syncTrail = (track: EnrichedFlightTrack, time: Date, landed: boolean) => {
      const trailEntry = trailsRef.current.get(track.id);
      if (!trailEntry) return;

      const trailLengthM = normalizePilotTrailLengthM(preferencesRef.current.pilotTrailLengthM);
      if (trailLengthM <= 0) {
        trailEntry.polyline.setLatLngs([]);
        return;
      }

      const latLngs = buildPilotTrailLatLngs(track, time, trailLengthM, routeRef.current);
      trailEntry.polyline.setLatLngs(latLngs);

      const trailColor = landed ? LANDED_COLOR : (trackColorsRef.current[track.id] ?? trailEntry.color);
      if (trailEntry.color !== trailColor) {
        trailEntry.polyline.setStyle({ color: trailColor });
        trailEntry.color = trailColor;
      }
    };

    const syncMarker = (
      track: EnrichedFlightTrack,
      time: Date,
      position?: number,
      updateLabels = true,
    ) => {
      const entry = markersRef.current.get(track.id);
      if (!entry) return;

      const snapshot = getTrackSnapshotAtTime(track, time, routeRef.current);
      if (!snapshot) {
        entry.marker.setOpacity(0);
        syncTrail(track, time, false);
        return;
      }

      entry.marker.setOpacity(1);
      entry.marker.setLatLng([snapshot.lat, snapshot.lon]);
      entry.marker.setZIndexOffset(snapshot.landed ? 900 : 1000);

      const prefs = preferencesRef.current;
      const altLabel = formatAltitude(clampDisplayAltitudeMeters(snapshot.alt), prefs.altitudeUnit);
      const taskKm = (snapshot.taskPercent / 100) * taskDistanceKm;
      const speeds =
        snapshot.landed ? { groundSpeedMps: 0, verticalSpeedMps: 0 } : computeSpeedsAtTime(track.points, time);
      const markerColor = trackColorsRef.current[track.id] ?? entry.color;

      if (updateLabels) {
        if (entry.labelEl && position !== undefined) {
          entry.labelEl.textContent = `#${position} ${entry.firstName}`;
        }

        if (entry.altEl) {
          entry.altEl.textContent = altLabel;
        }

        if (position !== undefined) {
          entry.marker.setPopupContent(
            formatCompetitorLeaderboardPopupHtml(
              {
                id: track.id,
                pilotName: track.pilotName,
                firstName: entry.firstName,
                gliderType: track.gliderType ?? extractGliderType(track),
                lat: snapshot.lat,
                lon: snapshot.lon,
                alt: clampDisplayAltitudeMeters(snapshot.alt),
                taskPercent: snapshot.taskPercent,
                taskKm,
                color: markerColor,
                landed: snapshot.landed,
                groundSpeedMps: speeds.groundSpeedMps,
                verticalSpeedMps: speeds.verticalSpeedMps,
                nextTurnpointName: snapshot.nextTurnpointName,
                leadPercent: leadPercentagesRef.current.get(track.id) ?? 0,
                position,
              },
              prefs,
            ),
          );
        }
      }

      if (entry.landed !== snapshot.landed || entry.color !== markerColor) {
        entry.landed = snapshot.landed;
        entry.color = markerColor;
        const displayColor = snapshot.landed ? LANDED_COLOR : markerColor;
        if (entry.markerEl) {
          entry.markerEl.style.background = displayColor;
        }
        if (entry.columnEl) {
          entry.columnEl.classList.toggle('landed', snapshot.landed);
        }
      }

      syncTrail(track, time, snapshot.landed);
    };

    const resetLeaderNextTurnpointCircle = () => {
      const layers = layerRefs.current;
      const previousKey = leaderNextTpKeyRef.current;
      if (layers && previousKey) {
        const circle = circlesRef.current.find((entry) => circleKey(entry) === previousKey);
        if (circle) {
          const tagged = taggedTurnpointStateRef.current.get(previousKey) ?? false;
          layers.circles.get(previousKey)?.setStyle(
            getTurnpointCirclePathOptions(circle, routeRef.current, tagged),
          );
        }
        leaderNextTpKeyRef.current = null;
      }
    };

    const resetLeaderNextTurnpointHighlight = () => {
      leaderNextLegLineRef.current?.setLatLngs([]);
      resetLeaderNextTurnpointCircle();
    };

    const updateLeaderNextTurnpointHighlight = (time: Date) => {
      const line = leaderNextLegLineRef.current;
      if (!line) return;

      const currentTaskStart = taskStartRef.current;
      if (!currentTaskStart || time.getTime() < currentTaskStart.getTime()) {
        resetLeaderNextTurnpointHighlight();
        return;
      }

      const leaderId = findLeaderAtTime(tracksRef.current, time.getTime(), routeRef.current);
      if (!leaderId) {
        resetLeaderNextTurnpointHighlight();
        return;
      }

      const leader = tracksRef.current.find((track) => track.id === leaderId);
      if (!leader) {
        resetLeaderNextTurnpointHighlight();
        return;
      }

      const snapshot = getTrackSnapshotAtTime(leader, time, routeRef.current);
      if (!snapshot?.hasStarted || snapshot.finished) {
        resetLeaderNextTurnpointHighlight();
        return;
      }

      const segment = getLeaderNextLegSegment(
        routeRef.current,
        snapshot.legIndex,
        snapshot.hasStarted,
        snapshot.finished,
      );
      if (!segment) {
        resetLeaderNextTurnpointHighlight();
        return;
      }

      line.setLatLngs(segment.map((point) => [point.lat, point.lon] as L.LatLngTuple));
      completedRouteRef.current?.bringToFront();
      progressLineRef.current?.bringToFront();

      const nextIndex = snapshot.legIndex + 1;
      const nextTp = routeRef.current.progressTurnpoints[nextIndex];
      const nextCircle = nextTp
        ? circlesRef.current.find((circle) => circle.number === nextTp.number)
        : undefined;
      const nextKey = nextCircle ? circleKey(nextCircle) : null;

      if (nextKey === leaderNextTpKeyRef.current) return;

      resetLeaderNextTurnpointCircle();

      const layers = layerRefs.current;
      if (!layers || !nextCircle || !nextKey) return;

      leaderNextTpKeyRef.current = nextKey;
      const tagged = taggedTurnpointStateRef.current.get(nextKey) ?? false;
      layers.circles.get(nextKey)?.setStyle(
        getTurnpointCirclePathOptions(nextCircle, routeRef.current, tagged, 4.5),
      );
    };

    const resetTaskProgressVisuals = () => {
      completedRouteRef.current?.setLatLngs([]);
      taggedTurnpointStateRef.current.clear();
      resetLeaderNextTurnpointHighlight();

      const layers = layerRefs.current;
      if (!layers) return;

      for (const circle of circlesRef.current) {
        const key = circleKey(circle);
        const markerKey = `${key}-marker`;
        const color = getTurnpointColor(circle, routeRef.current, false);
        layers.circles.get(key)?.setStyle(getTurnpointCirclePathOptions(circle, routeRef.current, false));
        layers.markers.get(markerKey)?.setIcon(turnpointIcon(color, circle.name ?? 'TP'));
      }
    };

    const updateTaskProgressVisuals = (progressPercent: number) => {
      const completedRoute = completedRouteRef.current;
      if (completedRoute) {
        const segments = buildCompletedRouteSegments(routeRef.current, progressPercent);
        completedRoute.setLatLngs(
          segments.map((segment) =>
            segment.map((point) => [point.lat, point.lon] as L.LatLngTuple),
          ),
        );
        completedRoute.bringToFront();
        progressLineRef.current?.bringToFront();
      }

      const layers = layerRefs.current;
      if (!layers) return;

      for (const circle of circlesRef.current) {
        const key = circleKey(circle);
        const markerKey = `${key}-marker`;
        const tagged = isCircleTagged(circle, routeRef.current, progressPercent);
        const prevTagged = taggedTurnpointStateRef.current.get(key);
        if (prevTagged === tagged) continue;

        taggedTurnpointStateRef.current.set(key, tagged);
        const color = getTurnpointColor(circle, routeRef.current, tagged);
        layers.circles.get(key)?.setStyle(getTurnpointCirclePathOptions(circle, routeRef.current, tagged));
        layers.markers.get(markerKey)?.setIcon(turnpointIcon(color, circle.name ?? 'TP'));
      }
    };

    const updateProgressLine = (time: Date) => {
      const progressLine = progressLineRef.current;
      const progressLabel = progressLabelRef.current;
      const currentTaskStart = taskStartRef.current;

      const hideProgressLine = () => {
        progressLine?.setLatLngs([]);
        if (progressLabel?.labelEl) {
          progressLabel.labelEl.style.display = 'none';
        }
        taskProgressMarkerRef.current = null;
        resetTaskProgressVisuals();
      };

      if (!progressLine || !currentTaskStart) {
        hideProgressLine();
        return;
      }

      const marker = computeTaskProgressMarker(
        tracksRef.current,
        routeRef.current,
        currentTaskStart,
        time,
        progressCacheRef,
        trackKeyRef.current,
      );

      if (!marker) {
        hideProgressLine();
        return;
      }

      progressLine.setLatLngs(marker.line.map((point) => [point.lat, point.lon]));
      progressLine.bringToFront();
      taskProgressMarkerRef.current = marker;
      updateTaskProgressVisuals(marker.taskPercent);

      if (progressLabel) {
        const prefs = preferencesRef.current;
        const label =
          `${formatDistance(marker.taskKm, prefs.distanceUnit)} / ${Math.round(marker.taskPercent)}%` +
          `<br>Leg ${marker.legNumber}`;
        const taskCenter = taskCenterRef.current;
        const anchor = getProgressLabelAnchor(marker.line, taskCenter);
        const anchorPoint = map.latLngToLayerPoint([anchor.lat, anchor.lon]);
        const centerPoint = map.latLngToLayerPoint([taskCenter.lat, taskCenter.lon]);
        const direction = getOutwardTooltipDirection(
          anchorPoint.x - centerPoint.x,
          anchorPoint.y - centerPoint.y,
        );

        progressLabel.marker.setLatLng([anchor.lat, anchor.lon]);

        let labelEl = progressLabel.labelEl;
        if (!labelEl) {
          labelEl = progressLabel.marker.getElement()?.querySelector<HTMLDivElement>('.task-progress-map-label') ?? null;
          progressLabel.labelEl = labelEl;
        }

        if (labelEl) {
          labelEl.style.display = 'block';
          labelEl.className = getProgressLabelClassName(direction);
          labelEl.innerHTML = label;
        }
      }
    };

    const syncAll = (time: Date, updateLabels = true) => {
      const positions = computeCompetitorPositions(
        tracksRef.current,
        trackColorsRef.current,
        routeRef.current,
        time,
      );

      for (const track of tracksRef.current) {
        syncMarker(track, time, positions.get(track.id), updateLabels);
      }
      updateProgressLine(time);
      updateLeaderNextTurnpointHighlight(time);
    };

    if (!playing) {
      syncAll(pausedTime, true);
    }

    const refreshProgressLabelOnMove = () => {
      if (playing) return;
      updateProgressLine(pausedTime);
    };
    map.on('move', refreshProgressLabelOnMove);

    if (!playing) {
      return () => {
        map.off('move', refreshProgressLabelOnMove);
      };
    }

    let rafId = 0;
    let lastLabelUpdateMs = 0;
    const loop = () => {
      const now = Date.now();
      const updateLabels = now - lastLabelUpdateMs >= PILOT_LABEL_UPDATE_INTERVAL_MS;
      if (updateLabels) {
        lastLabelUpdateMs = now;
      }

      syncAll(currentTimeRef.current, updateLabels);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      map.off('move', refreshProgressLabelOnMove);
      cancelAnimationFrame(rafId);
    };
  }, [playing, pausedTime, currentTimeRef, route, circles, layerRefs, taskProgressMarkerRef, map]);

  return null;
}
