import { useEffect, useRef, type RefObject } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { clampDisplayAltitudeMeters, LANDED_COLOR } from '../lib/geo';
import { pilotFirstName } from '../lib/igc';
import { formatAltitude, formatDistance, normalizePilotTrailLengthM, type AppPreferences } from '../lib/preferences';
import {
  buildCompletedRouteSegments,
  circleKey,
  getTurnpointColor,
  isCircleTagged,
  TASK_PROGRESS_LINE_COLOR,
  turnpointIcon,
  type TaskMapLayerRefs,
} from '../lib/taskMapStyle';
import { colorForIndex, getTrackSnapshotAtTime } from '../lib/tracks';
import { computeCompetitorPositions } from '../lib/competitors';
import { buildPilotTrailLatLngs } from '../lib/pilotTrail';
import {
  computeTaskProgressMarker,
  getProgressLabelAnchor,
  getTaskCenter,
  type TaskProgressMarker,
  type TaskProgressMarkerCache,
} from '../lib/taskProgressMarker';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
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
}: LiveCompetitorLayerProps) {
  const map = useMap();
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const trailsRef = useRef<Map<string, TrailEntry>>(new Map());
  const progressLineRef = useRef<L.Polyline | null>(null);
  const completedRouteRef = useRef<L.Polyline | null>(null);
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
  const taskCenterRef = useRef(getTaskCenter(route));

  tracksRef.current = tracks;
  routeRef.current = route;
  circlesRef.current = circles;
  trackColorsRef.current = trackColors;
  preferencesRef.current = preferences;
  taskStartRef.current = taskStart;
  trackKeyRef.current = trackKey;
  taskCenterRef.current = getTaskCenter(route);

  useEffect(() => {
    const polyline = L.polyline([], {
      color: TASK_PROGRESS_LINE_COLOR,
      weight: 2.5,
      opacity: 0.95,
    });
    polyline.addTo(map);
    progressLineRef.current = polyline;

    const completedRoute = L.polyline([], {
      color: TASK_PROGRESS_LINE_COLOR,
      weight: 3,
      opacity: 0.95,
    });
    completedRoute.addTo(map);
    completedRouteRef.current = completedRoute;

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
      polyline.remove();
      progressLineRef.current = null;
      completedRoute.remove();
      completedRouteRef.current = null;
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

    for (const track of tracks) {
      const color = trackColors[track.id] ?? colorForIndex(0);

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
      const labelEl = element?.querySelector<HTMLSpanElement>('.competitor-label') ?? null;
      const altEl = element?.querySelector<HTMLSpanElement>('.competitor-alt') ?? null;

      markers.set(track.id, {
        marker,
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

    const syncMarker = (track: EnrichedFlightTrack, time: Date, position?: number) => {
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

      if (entry.labelEl && position !== undefined) {
        entry.labelEl.textContent = `#${position} ${entry.firstName}`;
      }

      if (entry.altEl) {
        entry.altEl.textContent = altLabel;
      }

      if (entry.landed !== snapshot.landed || entry.color !== (trackColorsRef.current[track.id] ?? entry.color)) {
        entry.landed = snapshot.landed;
        entry.color = trackColorsRef.current[track.id] ?? entry.color;
        const markerColor = snapshot.landed ? LANDED_COLOR : entry.color;
        if (entry.markerEl) {
          entry.markerEl.style.background = markerColor;
        }
        if (entry.columnEl) {
          entry.columnEl.classList.toggle('landed', snapshot.landed);
        }
      }

      entry.marker.setPopupContent(
        `<strong>${escapeHtml(track.pilotName)}</strong><br>` +
          `${formatDistance(taskKm, prefs.distanceUnit)} / ${snapshot.taskPercent.toFixed(1)}%<br>` +
          `${altLabel}`,
      );

      syncTrail(track, time, snapshot.landed);
    };

    const resetTaskProgressVisuals = () => {
      completedRouteRef.current?.setLatLngs([]);
      taggedTurnpointStateRef.current.clear();

      const layers = layerRefs.current;
      if (!layers) return;

      for (const circle of circlesRef.current) {
        const key = circleKey(circle);
        const markerKey = `${key}-marker`;
        const color = getTurnpointColor(circle, routeRef.current, false);
        layers.circles.get(key)?.setStyle({
          color,
          fillColor: color,
        });
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
        layers.circles.get(key)?.setStyle({
          color,
          fillColor: color,
        });
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

    const syncAll = (time: Date) => {
      const positions = computeCompetitorPositions(
        tracksRef.current,
        trackColorsRef.current,
        routeRef.current,
        time,
      );

      for (const track of tracksRef.current) {
        syncMarker(track, time, positions.get(track.id));
      }
      updateProgressLine(time);
    };

    if (!playing) {
      syncAll(pausedTime);
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
    const loop = () => {
      syncAll(currentTimeRef.current);
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
