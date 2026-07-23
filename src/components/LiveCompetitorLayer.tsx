import { useEffect, useRef, type RefObject } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { clampDisplayAltitudeMeters, LANDED_COLOR } from '../lib/geo';
import { pilotFirstName } from '../lib/igc';
import { formatAltitude, formatDistance, type AppPreferences } from '../lib/preferences';
import {
  computeTaskProgressMarker,
  getProgressLabelAnchor,
  getTaskCenter,
  TASK_PROGRESS_LINE_COLOR,
  type TaskProgressMarker,
  type TaskProgressMarkerCache,
} from '../lib/taskProgressMarker';
import { colorForIndex, getTrackSnapshotAtTime } from '../lib/tracks';
import { computeCompetitorPositions } from '../lib/competitors';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
import type { OptimizedRoute } from '../lib/types';

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

function getOutwardTooltipOffset(direction: L.Direction, paddingPx = 8): L.Point {
  switch (direction) {
    case 'left':
      return L.point(-paddingPx, 0);
    case 'top':
      return L.point(0, -paddingPx);
    case 'bottom':
      return L.point(0, paddingPx);
    case 'right':
    default:
      return L.point(paddingPx, 0);
  }
}

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
    iconAnchor: [8, 8],
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

interface LiveCompetitorLayerProps {
  tracks: EnrichedFlightTrack[];
  route: OptimizedRoute;
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
  const progressLineRef = useRef<L.Polyline | null>(null);
  const progressLabelRef = useRef<L.Marker | null>(null);
  const progressCacheRef = useRef<TaskProgressMarkerCache | null>(null);
  const tracksRef = useRef(tracks);
  const routeRef = useRef(route);
  const trackColorsRef = useRef(trackColors);
  const preferencesRef = useRef(preferences);
  const taskStartRef = useRef(taskStart);
  const trackKeyRef = useRef(trackKey);
  const taskCenterRef = useRef(getTaskCenter(route));

  tracksRef.current = tracks;
  routeRef.current = route;
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

    const labelMarker = L.marker([0, 0], {
      icon: L.divIcon({
        className: 'task-progress-anchor',
        html: '',
        iconSize: [1, 1],
        iconAnchor: [0, 0],
      }),
      interactive: false,
      zIndexOffset: 1100,
    });
    labelMarker.bindTooltip('', {
      permanent: true,
      direction: 'right',
      offset: [8, 0],
      className: 'task-progress-map-label',
      opacity: 1,
    });
    labelMarker.addTo(map);
    progressLabelRef.current = labelMarker;

    return () => {
      polyline.remove();
      progressLineRef.current = null;
      labelMarker.remove();
      progressLabelRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const markers = markersRef.current;
    const activeIds = new Set(tracks.map((track) => track.id));

    for (const id of [...markers.keys()]) {
      if (!activeIds.has(id)) {
        markers.get(id)?.marker.remove();
        markers.delete(id);
      }
    }

    for (const track of tracks) {
      if (markers.has(track.id)) continue;

      const color = trackColors[track.id] ?? colorForIndex(0);
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
      progressCacheRef.current = null;
      taskProgressMarkerRef.current = null;
    };
  }, [map, taskProgressMarkerRef]);

  useEffect(() => {
    const taskDistanceKm = route.progressTotalDistance / 1000;

    const syncMarker = (track: EnrichedFlightTrack, time: Date, position?: number) => {
      const entry = markersRef.current.get(track.id);
      if (!entry) return;

      const snapshot = getTrackSnapshotAtTime(track, time, routeRef.current);
      if (!snapshot) {
        entry.marker.setOpacity(0);
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
    };

    const updateProgressLine = (time: Date) => {
      const progressLine = progressLineRef.current;
      const progressLabel = progressLabelRef.current;
      const currentTaskStart = taskStartRef.current;

      const hideProgressLine = () => {
        progressLine?.setLatLngs([]);
        progressLabel?.setTooltipContent('');
        progressLabel?.closeTooltip();
        taskProgressMarkerRef.current = null;
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
        const offset = getOutwardTooltipOffset(direction);

        progressLabel.setLatLng([anchor.lat, anchor.lon]);
        progressLabel.setTooltipContent(label);

        const tooltip = progressLabel.getTooltip();
        if (tooltip) {
          tooltip.options.direction = direction;
          tooltip.options.offset = offset;
          tooltip.update();
        } else {
          progressLabel.openTooltip();
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
  }, [playing, pausedTime, currentTimeRef, route, taskProgressMarkerRef, map]);

  return null;
}
