import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { clampDisplayAltitudeMeters, computeSpeedsAtTime, LANDED_COLOR } from '../lib/geo';
import { formatAltitude, formatDistance, normalizePilotTrailLengthM, type AppPreferences } from '../lib/preferences';
import {
  buildCompletedRouteSegments,
  circleKey,
  COMPLETED_LEG_OPACITY,
  COMPLETED_LEG_WEIGHT,
  getLeaderNextLegSegment,
  getProgressIndexForCircle,
  getTurnpointCirclePathOptions,
  getTurnpointColor,
  isStartTurnpoint,
  ROUTE_DASH_ARRAY,
  TASK_PROGRESS_LINE_COLOR,
  turnpointIcon,
  turnpointNextIcon,
  type TaskMapLayerRefs,
} from '../lib/taskMapStyle';
import {
  isFleetSssNextPhase,
  isProgressTurnpointTagged,
  lookupFleetNextTurnpointTarget,
  resolveMapNextTurnpointCircle,
  resolveNextTurnpointTarget,
  resolvePlaybackNextProgressIndex,
  resolvePlaybackTaggingTrack,
  type NextTurnpointTarget,
  type TaskNextTurnpointTimeline,
} from '../lib/nextTurnpoint';
import { getTrackColor, getTrackSnapshotAtTime } from '../lib/tracks';
import { computeCompetitorPositions } from '../lib/competitors';
import {
  buildPilotFullPathGeometry,
  buildPilotFutureTrailLatLngs,
  buildPilotTrailLatLngs,
  findPathIndexAtOrBefore,
  pathChunkCount,
  pathChunkEndIndex,
  pathChunkIndexForPoint,
  pathChunkStartIndex,
  PILOT_PATH_FUTURE_OPACITY,
  PILOT_PATH_PAST_OPACITY,
  type PilotFullPathGeometry,
} from '../lib/pilotTrail';
import { type EnrichedFlightTrack } from '../lib/taskProgress';
import {
  formatMapPilotAltStatHtml,
  formatMapPilotModeStatHtml,
  getFlyingModeStateAtTime,
} from '../lib/flyingMode';
import { type TaskFieldTimeline } from '../lib/taskTimeline';
import {
  computeTaskProgressMarker,
  getProgressLabelAnchor,
  getTaskCenter,
  type TaskProgressMarker,
} from '../lib/taskProgressMarker';
import type { OptimizedRoute, RoutePoint } from '../lib/types';
import { pilotMapLabelName } from '../lib/igc';
import { isMobileReviewLayout, subscribeMobileReviewLayout } from '../lib/reviewLayout';
import { trophyIconHtml } from '../lib/trophyIcon';

function resolveMapPilotLabelName(track: EnrichedFlightTrack, useInitials: boolean): string {
  return pilotMapLabelName(track.pilotName, track.compactName, useInitials);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompetitorMapLabelHtml(position: number, mapLabelName: string): string {
  const name = escapeHtml(mapLabelName);
  if (position === 1) {
    return `${trophyIconHtml(12)}<span>${name}</span>`;
  }
  return `#${position} ${name}`;
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
const FOCUSED_PILOT_MARKER_SCALE = 1.5;
const MARKER_Z_INDEX_BASE = 1000;
const MARKER_Z_INDEX_FOCUS_BOOST = 500;
const TURNPOINT_MARKER_Z_INDEX = 100;
/** Above default turnpoint markers/circles so the leader’s next TP stays visible when cylinders overlap. */
const LEADER_NEXT_TURNPOINT_MARKER_Z_INDEX = 900;
const PILOT_LABEL_UPDATE_INTERVAL_MS = 1000;

function markerSizePx(scale: number): number {
  return Math.round(PILOT_MARKER_SIZE_PX * scale);
}

function markerZIndexOffset(
  trackId: string,
  rank: number | undefined,
  competitorCount: number,
  focusTrackId: string | null,
): number {
  if (trackId === focusTrackId) {
    return MARKER_Z_INDEX_BASE + competitorCount * 10 + MARKER_Z_INDEX_FOCUS_BOOST;
  }

  const safeCount = Math.max(competitorCount, 1);
  const safeRank = rank ?? safeCount;
  return MARKER_Z_INDEX_BASE + (safeCount - safeRank) * 10;
}

function createCompetitorIcon(
  color: string,
  mapLabelName: string,
  landed: boolean,
  scale = 1,
): L.DivIcon {
  const markerColor = landed ? LANDED_COLOR : color;
  const labelBoxClass = landed ? 'competitor-label-box landed' : 'competitor-label-box';
  const sizePx = markerSizePx(scale);
  const anchorPx = sizePx / 2;
  const focusedClass = scale > 1 ? ' competitor-marker-column--focused' : '';

  return L.divIcon({
    className: 'competitor-marker-container',
    html: `<div class="competitor-marker-column${landed ? ' landed' : ''}${focusedClass}">
      <div class="competitor-marker" style="background:${markerColor}"></div>
      <div class="${labelBoxClass}">
        <span class="competitor-label">${escapeHtml(mapLabelName)}</span>
        <span class="competitor-stat-line competitor-alt"></span>
        <span class="competitor-stat-line competitor-mode"></span>
      </div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [anchorPx, anchorPx],
  });
}

function readMarkerDomRefs(marker: L.Marker): Pick<
  MarkerEntry,
  'labelBoxEl' | 'labelEl' | 'altEl' | 'modeEl' | 'markerEl' | 'columnEl'
> {
  const element = marker.getElement();
  return {
    columnEl: element?.querySelector<HTMLDivElement>('.competitor-marker-column') ?? null,
    markerEl: element?.querySelector<HTMLDivElement>('.competitor-marker') ?? null,
    labelBoxEl: element?.querySelector<HTMLDivElement>('.competitor-label-box') ?? null,
    labelEl: element?.querySelector<HTMLSpanElement>('.competitor-label') ?? null,
    altEl: element?.querySelector<HTMLSpanElement>('.competitor-alt') ?? null,
    modeEl: element?.querySelector<HTMLSpanElement>('.competitor-mode') ?? null,
  };
}

interface MarkerEntry {
  marker: L.Marker;
  labelBoxEl: HTMLDivElement | null;
  labelEl: HTMLSpanElement | null;
  altEl: HTMLSpanElement | null;
  modeEl: HTMLSpanElement | null;
  markerEl: HTMLDivElement | null;
  columnEl: HTMLDivElement | null;
  color: string;
  mapLabelName: string;
  landed: boolean;
  markerScale: number;
  isFocused: boolean;
  displayedAltLabel: string;
  displayedModeHtml: string;
}

interface TrailEntry {
  polyline: L.Polyline;
  futurePolyline: L.Polyline | null;
  geometry: PilotFullPathGeometry;
  futureCursor: number;
  color: string;
}

const SELECTED_PATH_WEIGHT = 4;
const CHUNK_HIDDEN_OPACITY = 0;
/** Sentinel meaning no chunk styling has been applied yet. */
const BOUNDARY_CHUNK_UNSET = -2;

/**
 * Full path of the selected pilot, drawn as fixed-size chunks of the raw track. Chunk
 * geometry never changes; a frame only restyles chunks the boundary crossed and rebuilds
 * the two halves of the chunk the pilot is currently inside.
 */
interface SelectedPathEntry {
  trackId: string;
  geometry: PilotFullPathGeometry;
  chunkLines: L.Polyline[];
  chunkOpacity: number[];
  boundaryPastLine: L.Polyline;
  boundaryFutureLine: L.Polyline;
  boundaryChunk: number;
  cursorIndex: number;
  color: string;
  pastBuffer: [number, number][];
  futureBuffer: [number, number][];
}

interface LiveCompetitorLayerProps {
  tracks: EnrichedFlightTrack[];
  allEnrichedTracks: EnrichedFlightTrack[];
  route: OptimizedRoute;
  circles: RoutePoint[];
  layerRefs: RefObject<TaskMapLayerRefs>;
  trackColors: Record<string, string>;
  currentTimeRef: RefObject<Date>;
  preferences: AppPreferences;
  playing: boolean;
  pausedTime: Date;
  taskStart?: Date;
  fieldTimeline: TaskFieldTimeline;
  nextTurnpointTimeline: TaskNextTurnpointTimeline;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
  progressFocusTrackId: string | null;
  progressFocusColor: string | null;
  selectedPilotTrackId: string | null;
  followPilotTrackId: string | null;
  onPilotMarkerClick: (trackId: string) => void;
}

export function LiveCompetitorLayer({
  tracks,
  allEnrichedTracks,
  route,
  circles,
  layerRefs,
  trackColors,
  currentTimeRef,
  preferences,
  playing,
  pausedTime,
  taskStart,
  fieldTimeline,
  nextTurnpointTimeline,
  taskProgressMarkerRef,
  progressFocusTrackId,
  progressFocusColor,
  selectedPilotTrackId,
  followPilotTrackId,
  onPilotMarkerClick,
}: LiveCompetitorLayerProps) {
  const map = useMap();
  const mobileMapLabels = useSyncExternalStore(
    subscribeMobileReviewLayout,
    isMobileReviewLayout,
    () => false,
  );
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const trailsRef = useRef<Map<string, TrailEntry>>(new Map());
  const selectedPathRef = useRef<SelectedPathEntry | null>(null);
  const progressLineRef = useRef<L.Polyline | null>(null);
  const completedRouteRef = useRef<L.Polyline | null>(null);
  const leaderNextLegLineRef = useRef<L.Polyline | null>(null);
  const leaderNextTpKeyRef = useRef<string | null>(null);
  const leaderNextTpTargetRef = useRef<NextTurnpointTarget | null>(null);
  const leaderNextTpRaisedKeyRef = useRef<string | null>(null);
  const progressLabelRef = useRef<{ marker: L.Marker; labelEl: HTMLDivElement | null } | null>(null);
  const taggedTurnpointStateRef = useRef<Map<string, boolean>>(new Map());
  const tracksRef = useRef(tracks);
  const allEnrichedTracksRef = useRef(allEnrichedTracks);
  const routeRef = useRef(route);
  const circlesRef = useRef(circles);
  const trackColorsRef = useRef(trackColors);
  const preferencesRef = useRef(preferences);
  const taskStartRef = useRef(taskStart);
  const fieldTimelineRef = useRef(fieldTimeline);
  const nextTurnpointTimelineRef = useRef(nextTurnpointTimeline);
  const progressFocusTrackIdRef = useRef(progressFocusTrackId);
  const progressFocusColorRef = useRef(progressFocusColor);
  const followPilotTrackIdRef = useRef(followPilotTrackId);
  const selectedPilotTrackIdRef = useRef(selectedPilotTrackId);
  const onPilotMarkerClickRef = useRef(onPilotMarkerClick);
  const taskCenterRef = useRef(getTaskCenter(route));
  const pausedTimeRef = useRef(pausedTime);
  const syncAllRef = useRef<(time: Date, updateLabels?: boolean) => void>(() => {});
  const lastPilotLabelUpdateMsRef = useRef(0);

  pausedTimeRef.current = pausedTime;
  tracksRef.current = tracks;
  allEnrichedTracksRef.current = allEnrichedTracks;
  routeRef.current = route;
  circlesRef.current = circles;
  trackColorsRef.current = trackColors;
  preferencesRef.current = preferences;
  taskStartRef.current = taskStart;
  fieldTimelineRef.current = fieldTimeline;
  nextTurnpointTimelineRef.current = nextTurnpointTimeline;
  progressFocusTrackIdRef.current = progressFocusTrackId;
  progressFocusColorRef.current = progressFocusColor;
  followPilotTrackIdRef.current = followPilotTrackId;
  selectedPilotTrackIdRef.current = selectedPilotTrackId;
  onPilotMarkerClickRef.current = onPilotMarkerClick;
  taskCenterRef.current = getTaskCenter(route);

  useEffect(() => {
    taggedTurnpointStateRef.current.clear();
  }, [progressFocusTrackId, selectedPilotTrackId]);

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
      weight: COMPLETED_LEG_WEIGHT,
      opacity: COMPLETED_LEG_OPACITY,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    });
    completedRoute.addTo(map);
    completedRoute.bringToBack();
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
    const track = selectedPilotTrackId
      ? allEnrichedTracks.find((entry) => entry.id === selectedPilotTrackId)
      : undefined;

    if (!track || track.points.length < 2) {
      selectedPathRef.current = null;
      return;
    }

    const geometry = buildPilotFullPathGeometry(track);
    const color = trackColors[track.id] ?? TASK_PROGRESS_LINE_COLOR;
    const pathStyle = {
      color,
      weight: SELECTED_PATH_WEIGHT,
      interactive: false,
    } as const;

    const chunkLines: L.Polyline[] = [];
    const chunkOpacity: number[] = [];
    const chunkTotal = pathChunkCount(geometry.pointCount);

    for (let chunkIndex = 0; chunkIndex < chunkTotal; chunkIndex += 1) {
      const start = pathChunkStartIndex(chunkIndex);
      const end = pathChunkEndIndex(chunkIndex, geometry.pointCount);
      const line = L.polyline(geometry.latLngs.slice(start, end + 1), {
        ...pathStyle,
        opacity: PILOT_PATH_FUTURE_OPACITY,
      });
      line.addTo(map);
      line.bringToBack();
      chunkLines.push(line);
      chunkOpacity.push(PILOT_PATH_FUTURE_OPACITY);
    }

    const boundaryFutureLine = L.polyline([], {
      ...pathStyle,
      opacity: PILOT_PATH_FUTURE_OPACITY,
    });
    const boundaryPastLine = L.polyline([], {
      ...pathStyle,
      opacity: PILOT_PATH_PAST_OPACITY,
    });
    boundaryFutureLine.addTo(map);
    boundaryFutureLine.bringToBack();
    boundaryPastLine.addTo(map);
    boundaryPastLine.bringToBack();

    selectedPathRef.current = {
      trackId: track.id,
      geometry,
      chunkLines,
      chunkOpacity,
      boundaryPastLine,
      boundaryFutureLine,
      boundaryChunk: BOUNDARY_CHUNK_UNSET,
      cursorIndex: -1,
      color,
      pastBuffer: [],
      futureBuffer: [],
    };

    return () => {
      for (const line of chunkLines) {
        line.remove();
      }
      boundaryPastLine.remove();
      boundaryFutureLine.remove();
      selectedPathRef.current = null;
    };
  }, [map, selectedPilotTrackId, allEnrichedTracks, trackColors]);

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
        trails.get(id)?.futurePolyline?.remove();
        trails.delete(id);
      }
    }

    const showFutureTrail = preferencesRef.current.showFutureTrail;

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
        trails.set(track.id, {
          polyline,
          futurePolyline: null,
          geometry: buildPilotFullPathGeometry(track),
          futureCursor: -1,
          color,
        });
      } else {
        trails.get(track.id)!.geometry = buildPilotFullPathGeometry(track);
      }

      const trailEntry = trails.get(track.id)!;
      if (showFutureTrail && !trailEntry.futurePolyline) {
        const futurePolyline = L.polyline([], {
          color,
          weight: 3,
          opacity: PILOT_PATH_FUTURE_OPACITY,
          interactive: false,
        });
        futurePolyline.addTo(map);
        futurePolyline.bringToBack();
        trailEntry.futurePolyline = futurePolyline;
      } else if (!showFutureTrail && trailEntry.futurePolyline) {
        trailEntry.futurePolyline.remove();
        trailEntry.futurePolyline = null;
      }

      if (markers.has(track.id)) continue;

      const mapLabelName = resolveMapPilotLabelName(track, mobileMapLabels);
      const icon = createCompetitorIcon(color, mapLabelName, false);
      const marker = L.marker([0, 0], { icon, zIndexOffset: MARKER_Z_INDEX_BASE });
      marker.on('click', () => {
        onPilotMarkerClickRef.current?.(track.id);
      });
      marker.addTo(map);

      const element = marker.getElement();
      const columnEl = element?.querySelector<HTMLDivElement>('.competitor-marker-column') ?? null;
      const markerEl = element?.querySelector<HTMLDivElement>('.competitor-marker') ?? null;
      const labelBoxEl = element?.querySelector<HTMLDivElement>('.competitor-label-box') ?? null;
      const labelEl = element?.querySelector<HTMLSpanElement>('.competitor-label') ?? null;
      const altEl = element?.querySelector<HTMLSpanElement>('.competitor-alt') ?? null;
      const modeEl = element?.querySelector<HTMLSpanElement>('.competitor-mode') ?? null;

      markers.set(track.id, {
        marker,
        labelBoxEl,
        labelEl,
        altEl,
        modeEl,
        markerEl,
        columnEl,
        color,
        mapLabelName,
        landed: false,
        markerScale: 1,
        isFocused: false,
        displayedAltLabel: '—',
        displayedModeHtml: '',
      });
    }
  }, [tracks, trackColors, map, preferences.showFutureTrail]);

  useEffect(() => {
    for (const track of tracksRef.current) {
      const entry = markersRef.current.get(track.id);
      if (!entry) continue;

      const nextLabel = resolveMapPilotLabelName(track, mobileMapLabels);
      if (entry.mapLabelName === nextLabel) continue;

      entry.mapLabelName = nextLabel;
      const markerColor = trackColorsRef.current[track.id] ?? entry.color;
      const displayColor = entry.landed ? LANDED_COLOR : markerColor;
      entry.marker.setIcon(
        createCompetitorIcon(displayColor, entry.mapLabelName, entry.landed, entry.markerScale),
      );
      Object.assign(entry, readMarkerDomRefs(entry.marker));
    }
  }, [mobileMapLabels]);

  useEffect(() => {
    return () => {
      for (const entry of markersRef.current.values()) {
        entry.marker.remove();
      }
      markersRef.current.clear();
      for (const entry of trailsRef.current.values()) {
        entry.polyline.remove();
        entry.futurePolyline?.remove();
      }
      trailsRef.current.clear();
      taskProgressMarkerRef.current = null;
    };
  }, [map, taskProgressMarkerRef]);

  useEffect(() => {
    const syncTrail = (track: EnrichedFlightTrack, time: Date, landed: boolean) => {
      const trailEntry = trailsRef.current.get(track.id);
      if (!trailEntry) return;

      if (track.id === selectedPilotTrackIdRef.current) {
        trailEntry.polyline.setLatLngs([]);
        trailEntry.futurePolyline?.setLatLngs([]);
        return;
      }

      const trailLengthM = normalizePilotTrailLengthM(preferencesRef.current.pilotTrailLengthM);
      if (trailLengthM <= 0) {
        trailEntry.polyline.setLatLngs([]);
      } else {
        const latLngs = buildPilotTrailLatLngs(track, time, trailLengthM, routeRef.current);
        trailEntry.polyline.setLatLngs(latLngs);
      }

      const trailColor = landed ? LANDED_COLOR : (trackColorsRef.current[track.id] ?? trailEntry.color);
      if (trailEntry.color !== trailColor) {
        trailEntry.polyline.setStyle({ color: trailColor });
        trailEntry.color = trailColor;
      }
      trailEntry.polyline.setStyle({ opacity: landed ? 0.55 : 0.85 });

      if (trailEntry.futurePolyline) {
        const futureLatLngs = buildPilotFutureTrailLatLngs(
          trailEntry.geometry,
          track,
          time,
          routeRef.current,
          { index: trailEntry.futureCursor },
        );
        trailEntry.futurePolyline.setLatLngs(futureLatLngs);
        trailEntry.futurePolyline.setStyle({
          color: trailColor,
          opacity: PILOT_PATH_FUTURE_OPACITY,
        });
      }
    };

    const setChunkOpacity = (entry: SelectedPathEntry, chunkIndex: number, opacity: number) => {
      if (entry.chunkOpacity[chunkIndex] === opacity) return;
      entry.chunkOpacity[chunkIndex] = opacity;
      entry.chunkLines[chunkIndex].setStyle({ opacity });
    };

    /** Restyle only the chunks the boundary moved across since the last frame. */
    const applyChunkStyles = (entry: SelectedPathEntry, boundaryChunk: number) => {
      const total = entry.chunkLines.length;
      const previous = entry.boundaryChunk;
      const from = previous < 0 ? 0 : Math.min(previous, Math.max(boundaryChunk, 0));
      const to = previous < 0 ? total - 1 : Math.max(previous, boundaryChunk);

      for (let chunkIndex = from; chunkIndex <= to && chunkIndex < total; chunkIndex += 1) {
        const opacity =
          chunkIndex === boundaryChunk
            ? CHUNK_HIDDEN_OPACITY
            : chunkIndex < boundaryChunk
              ? PILOT_PATH_PAST_OPACITY
              : PILOT_PATH_FUTURE_OPACITY;
        setChunkOpacity(entry, chunkIndex, opacity);
      }
    };

    const syncSelectedFullPath = (time: Date) => {
      const entry = selectedPathRef.current;
      if (!entry) return;

      const track = allEnrichedTracksRef.current.find((item) => item.id === entry.trackId);
      if (!track) return;

      const { geometry } = entry;
      const index = findPathIndexAtOrBefore(geometry.timesMs, time.getTime(), entry.cursorIndex);
      entry.cursorIndex = index;

      const snapshot = getTrackSnapshotAtTime(track, time, routeRef.current);
      const pathColor = snapshot?.landed
        ? LANDED_COLOR
        : (trackColorsRef.current[entry.trackId] ?? TASK_PROGRESS_LINE_COLOR);
      if (pathColor !== entry.color) {
        entry.color = pathColor;
        for (const line of entry.chunkLines) {
          line.setStyle({ color: pathColor });
        }
        entry.boundaryPastLine.setStyle({ color: pathColor });
        entry.boundaryFutureLine.setStyle({ color: pathColor });
      }

      const boundaryChunk = index < 0 ? -1 : pathChunkIndexForPoint(index, geometry.pointCount);
      if (boundaryChunk !== entry.boundaryChunk) {
        applyChunkStyles(entry, boundaryChunk);
        entry.boundaryChunk = boundaryChunk;
      }

      if (boundaryChunk < 0 || !snapshot) {
        entry.boundaryPastLine.setLatLngs([]);
        entry.boundaryFutureLine.setLatLngs([]);
        return;
      }

      const chunkStart = pathChunkStartIndex(boundaryChunk);
      const chunkEnd = pathChunkEndIndex(boundaryChunk, geometry.pointCount);
      const head: [number, number] = [snapshot.lat, snapshot.lon];

      const past = entry.pastBuffer;
      past.length = 0;
      for (let pointIndex = chunkStart; pointIndex <= index; pointIndex += 1) {
        past.push(geometry.latLngs[pointIndex]);
      }
      if (index < geometry.pointCount - 1) {
        past.push(head);
      }
      entry.boundaryPastLine.setLatLngs(past.length >= 2 ? past : []);

      const future = entry.futureBuffer;
      future.length = 0;
      if (index < chunkEnd) {
        future.push(head);
        for (let pointIndex = index + 1; pointIndex <= chunkEnd; pointIndex += 1) {
          future.push(geometry.latLngs[pointIndex]);
        }
      }
      entry.boundaryFutureLine.setLatLngs(future.length >= 2 ? future : []);
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

      const focusTrackId = progressFocusTrackIdRef.current;
      const competitorCount = tracksRef.current.length;
      const isFocused = track.id === focusTrackId;
      const showMapPilotStats = isFocused;
      const markerScale = isFocused ? FOCUSED_PILOT_MARKER_SCALE : 1;

      const prefs = preferencesRef.current;
      const altLabel = formatAltitude(clampDisplayAltitudeMeters(snapshot.alt), prefs.altitudeUnit);
      const altForDisplay = updateLabels ? altLabel : entry.displayedAltLabel;
      const markerColor = trackColorsRef.current[track.id] ?? entry.color;
      const displayColor = snapshot.landed ? LANDED_COLOR : markerColor;

      const needsIconRefresh =
        entry.isFocused !== isFocused ||
        entry.markerScale !== markerScale ||
        entry.landed !== snapshot.landed ||
        entry.color !== markerColor;

      if (needsIconRefresh) {
        entry.marker.setIcon(
          createCompetitorIcon(displayColor, entry.mapLabelName, snapshot.landed, markerScale),
        );
        Object.assign(entry, readMarkerDomRefs(entry.marker));
        entry.isFocused = isFocused;
        entry.markerScale = markerScale;
        entry.landed = snapshot.landed;
        entry.color = markerColor;
        if (entry.altEl) {
          if (showMapPilotStats && altForDisplay) {
            entry.altEl.innerHTML = formatMapPilotAltStatHtml(altForDisplay);
            entry.altEl.style.display = '';
          } else {
            entry.altEl.innerHTML = '';
            entry.altEl.style.display = 'none';
          }
        }
        if (entry.modeEl) {
          if (showMapPilotStats && entry.displayedModeHtml) {
            entry.modeEl.innerHTML = entry.displayedModeHtml;
            entry.modeEl.style.display = '';
          } else {
            entry.modeEl.innerHTML = '';
            entry.modeEl.style.display = 'none';
          }
        }
      } else if (entry.markerEl) {
        entry.markerEl.style.background = displayColor;
      }

      if (updateLabels) {
        entry.marker.setZIndexOffset(
          markerZIndexOffset(track.id, position, competitorCount, focusTrackId),
        );

        if (entry.labelEl) {
          if (position !== undefined) {
            entry.labelEl.innerHTML = formatCompetitorMapLabelHtml(position, entry.mapLabelName);
          } else {
            entry.labelEl.textContent = entry.mapLabelName;
          }
        }

        const altHtml = showMapPilotStats ? formatMapPilotAltStatHtml(altLabel) : '';
        if (entry.altEl) {
          entry.altEl.innerHTML = altHtml;
          entry.altEl.style.display = altHtml ? '' : 'none';
        }
        entry.displayedAltLabel = showMapPilotStats ? altLabel : '';

        const modeState = showMapPilotStats
          ? getFlyingModeStateAtTime(track.flyingModeTimeline, time)
          : null;
        const { verticalSpeedMps } =
          !showMapPilotStats || snapshot.landed
            ? { verticalSpeedMps: 0 }
            : computeSpeedsAtTime(track.points, time);
        const modeHtml = showMapPilotStats
          ? formatMapPilotModeStatHtml(modeState, verticalSpeedMps, prefs, snapshot.landed)
          : '';
        if (entry.modeEl) {
          entry.modeEl.innerHTML = modeHtml;
          entry.modeEl.classList.toggle('competitor-mode--circling', modeState?.mode === 'circling');
          entry.modeEl.classList.toggle('competitor-mode--glide', modeState?.mode === 'glide');
          entry.modeEl.style.display = modeHtml ? '' : 'none';
        }
        entry.displayedModeHtml = modeHtml;
      }

      if (entry.columnEl) {
        entry.columnEl.classList.toggle('landed', snapshot.landed);
      }

      syncTrail(track, time, snapshot.landed);
    };

    const resolveProgressColor = () =>
      progressFocusColorRef.current ?? TASK_PROGRESS_LINE_COLOR;

    const getProgressTracks = () => {
      const focusId = progressFocusTrackIdRef.current;
      if (focusId) {
        return allEnrichedTracksRef.current.filter((track) => track.id === focusId);
      }
      return tracksRef.current;
    };

    const applyProgressLabelTheme = (labelEl: HTMLDivElement, color: string) => {
      labelEl.style.color = color;
      labelEl.style.borderColor = color === TASK_PROGRESS_LINE_COLOR ? '' : `${color}59`;
    };

    const resetLeaderNextTurnpointCircle = () => {
      const layers = layerRefs.current;
      const previousKey = leaderNextTpKeyRef.current;
      const progressColor = resolveProgressColor();
      if (layers && previousKey) {
        const circle = circlesRef.current.find((entry) => circleKey(entry) === previousKey);
        if (circle) {
          const tagged = taggedTurnpointStateRef.current.get(previousKey) ?? false;
          const color = getTurnpointColor(circle, routeRef.current, tagged, progressColor);
          layers.circles.get(previousKey)?.setStyle(
            getTurnpointCirclePathOptions(circle, routeRef.current, tagged, false, progressColor),
          );
          layers.markers
            .get(`${previousKey}-marker`)
            ?.setIcon(turnpointIcon(color, circle.name ?? 'TP'));
        }
        layers.markers.get(`${previousKey}-marker`)?.setZIndexOffset(TURNPOINT_MARKER_Z_INDEX);
        leaderNextTpKeyRef.current = null;
        leaderNextTpTargetRef.current = null;
        if (leaderNextTpRaisedKeyRef.current === previousKey) {
          leaderNextTpRaisedKeyRef.current = null;
        }
      }
    };

    const raiseLeaderNextTurnpointLayer = (key: string) => {
      const layers = layerRefs.current;
      if (!layers) return;
      if (leaderNextTpRaisedKeyRef.current === key) return;

      leaderNextTpRaisedKeyRef.current = key;
      layers.circles.get(key)?.bringToFront();
      layers.markers.get(`${key}-marker`)?.setZIndexOffset(LEADER_NEXT_TURNPOINT_MARKER_Z_INDEX);
    };

    const resetLeaderNextTurnpointHighlight = () => {
      leaderNextLegLineRef.current?.setLatLngs([]);
      resetLeaderNextTurnpointCircle();
    };

    const applyLeaderNextTurnpointMarker = (
      nextCircle: (typeof circlesRef.current)[number],
      nextKey: string,
      nextTarget: NextTurnpointTarget,
      progressColor: string,
    ) => {
      const layers = layerRefs.current;
      if (!layers) return;
      const color =
        nextTarget.progressIndex === 0
          ? progressColor
          : getTurnpointColor(nextCircle, routeRef.current, false, progressColor);
      layers.markers
        .get(`${nextKey}-marker`)
        ?.setIcon(turnpointNextIcon(color, nextCircle.name ?? 'TP', nextTarget.number));
    };

    const applyLeaderNextTurnpointCircle = (
      nextCircle: (typeof circlesRef.current)[number] | undefined,
      nextTarget: NextTurnpointTarget | null,
    ) => {
      if (!nextCircle || !nextTarget) {
        resetLeaderNextTurnpointCircle();
        return;
      }

      const nextKey = circleKey(nextCircle);
      const progressColor = resolveProgressColor();
      leaderNextTpTargetRef.current = nextTarget;

      if (nextKey === leaderNextTpKeyRef.current) {
        const layers = layerRefs.current;
        if (!layers) return;
        const tagged = taggedTurnpointStateRef.current.get(nextKey) ?? false;
        layers.circles.get(nextKey)?.setStyle(
          getTurnpointCirclePathOptions(
            nextCircle,
            routeRef.current,
            tagged,
            true,
            progressColor,
          ),
        );
        applyLeaderNextTurnpointMarker(nextCircle, nextKey, nextTarget, progressColor);
        raiseLeaderNextTurnpointLayer(nextKey);
        return;
      }

      resetLeaderNextTurnpointCircle();

      const layers = layerRefs.current;
      if (!layers) return;

      leaderNextTpKeyRef.current = nextKey;
      const tagged = taggedTurnpointStateRef.current.get(nextKey) ?? false;
      layers.circles.get(nextKey)?.setStyle(
        getTurnpointCirclePathOptions(
          nextCircle,
          routeRef.current,
          tagged,
          true,
          progressColor,
        ),
      );
      applyLeaderNextTurnpointMarker(nextCircle, nextKey, nextTarget, progressColor);
      raiseLeaderNextTurnpointLayer(nextKey);
    };

    const updateLeaderNextTurnpointHighlight = (time: Date) => {
      const line = leaderNextLegLineRef.current;
      if (!line) return;

      const currentTaskStart = taskStartRef.current;
      const timeMs = time.getTime();
      const focusId = progressFocusTrackIdRef.current;
      const selectedId = selectedPilotTrackIdRef.current;
      if (!currentTaskStart) {
        resetLeaderNextTurnpointHighlight();
        return;
      }
      if (!focusId && !selectedId && timeMs < currentTaskStart.getTime()) {
        resetLeaderNextTurnpointHighlight();
        return;
      }

      const route = routeRef.current;
      const timeline = nextTurnpointTimelineRef.current;
      const fleetSssPhase = isFleetSssNextPhase(timeline, timeMs);

      const progressTrack = resolvePlaybackTaggingTrack(
        allEnrichedTracksRef.current,
        focusId,
        selectedId,
      );

      let nextTarget: NextTurnpointTarget | null = null;
      let nextProgressIndex = -1;
      if (fleetSssPhase) {
        nextTarget = lookupFleetNextTurnpointTarget(timeline, route, timeMs);
        nextProgressIndex = 0;
      } else if (progressTrack) {
        nextProgressIndex = resolvePlaybackNextProgressIndex(timeline, progressTrack, timeMs);
        if (nextProgressIndex >= 0) {
          nextTarget = resolveNextTurnpointTarget(route, nextProgressIndex);
        }
      }
      if (!nextTarget && !focusId && !selectedId) {
        nextTarget = lookupFleetNextTurnpointTarget(timeline, route, timeMs);
        if (nextTarget) {
          nextProgressIndex = nextTarget.progressIndex;
        }
      }

      if (progressTrack) {
        const snapshot = getTrackSnapshotAtTime(progressTrack, time, route);
        if (snapshot?.hasStarted && !snapshot.finished) {
          const legIndex = Math.max(
            snapshot.legIndex,
            nextProgressIndex > 0 ? nextProgressIndex - 1 : 0,
          );
          const segment = getLeaderNextLegSegment(
            route,
            legIndex,
            snapshot.hasStarted,
            snapshot.finished,
          );
          if (segment) {
            line.setLatLngs(segment.map((point) => [point.lat, point.lon] as L.LatLngTuple));
            progressLineRef.current?.bringToFront();
          } else {
            line.setLatLngs([]);
          }
        } else {
          line.setLatLngs([]);
        }
      } else {
        line.setLatLngs([]);
      }

      if (!nextTarget) {
        resetLeaderNextTurnpointCircle();
        return;
      }

      applyLeaderNextTurnpointCircle(
        resolveMapNextTurnpointCircle(route, circlesRef.current, nextTarget),
        nextTarget,
      );
    };

    const resetTaskProgressVisuals = () => {
      completedRouteRef.current?.setLatLngs([]);
      taggedTurnpointStateRef.current.clear();
      resetLeaderNextTurnpointHighlight();

      const layers = layerRefs.current;
      if (!layers) return;

      const progressColor = TASK_PROGRESS_LINE_COLOR;
      for (const circle of circlesRef.current) {
        const key = circleKey(circle);
        const markerKey = `${key}-marker`;
        const color = getTurnpointColor(circle, routeRef.current, false, progressColor);
        layers.circles
          .get(key)
          ?.setStyle(getTurnpointCirclePathOptions(circle, routeRef.current, false, false, progressColor));
        layers.markers.get(markerKey)?.setIcon(turnpointIcon(color, circle.name ?? 'TP'));
      }
    };

    const updateTaskProgressVisuals = (time: Date, progressPercent: number, progressColor: string) => {
      const completedRoute = completedRouteRef.current;
      if (completedRoute) {
        completedRoute.setStyle({ color: progressColor });
        const segments = buildCompletedRouteSegments(routeRef.current, progressPercent);
        completedRoute.setLatLngs(
          segments.map((segment) =>
            segment.map((point) => [point.lat, point.lon] as L.LatLngTuple),
          ),
        );
        completedRoute.bringToBack();
        progressLineRef.current?.bringToFront();
      }

      const layers = layerRefs.current;
      if (!layers) return;

      const focusTrack = resolvePlaybackTaggingTrack(
        allEnrichedTracksRef.current,
        progressFocusTrackIdRef.current,
        selectedPilotTrackIdRef.current,
      );
      const timeline = nextTurnpointTimelineRef.current;
      const timeMs = time.getTime();
      const fleetSssPhase = isFleetSssNextPhase(timeline, timeMs);
      const nextProgressIndex = fleetSssPhase
        ? 0
        : resolvePlaybackNextProgressIndex(timeline, focusTrack, timeMs);

      for (const circle of circlesRef.current) {
        const key = circleKey(circle);
        const markerKey = `${key}-marker`;
        const progressIndex = getProgressIndexForCircle(circle, routeRef.current);
        const tagged = isProgressTurnpointTagged(progressIndex, nextProgressIndex);
        const prevTagged = taggedTurnpointStateRef.current.get(key);
        const isLeaderNext = key === leaderNextTpKeyRef.current;
        const sssPhaseHighlight = fleetSssPhase && isStartTurnpoint(circle, routeRef.current);
        if (prevTagged === tagged && !isLeaderNext && !tagged && !sssPhaseHighlight) continue;

        taggedTurnpointStateRef.current.set(key, tagged);
        const fillHighlight = isLeaderNext || sssPhaseHighlight;
        const showAsTagged = tagged && !fillHighlight;
        const color = getTurnpointColor(circle, routeRef.current, showAsTagged, progressColor);
        layers.circles
          .get(key)
          ?.setStyle(
            getTurnpointCirclePathOptions(circle, routeRef.current, tagged, fillHighlight, progressColor),
          );
        if (isLeaderNext && leaderNextTpTargetRef.current) {
          const nextCircle = circlesRef.current.find((entry) => circleKey(entry) === key);
          if (nextCircle) {
            applyLeaderNextTurnpointMarker(
              nextCircle,
              key,
              leaderNextTpTargetRef.current,
              progressColor,
            );
          }
        } else {
          layers.markers.get(markerKey)?.setIcon(turnpointIcon(color, circle.name ?? 'TP'));
        }
      }
    };

    const updateProgressLine = (time: Date) => {
      const progressLine = progressLineRef.current;
      const progressLabel = progressLabelRef.current;
      const currentTaskStart = taskStartRef.current;
      const progressColor = resolveProgressColor();

      const hideProgressLine = () => {
        progressLine?.setLatLngs([]);
        if (progressLabel?.labelEl) {
          progressLabel.labelEl.style.display = 'none';
        }
        taskProgressMarkerRef.current = null;
      };

      if (!progressLine || !currentTaskStart) {
        hideProgressLine();
        resetTaskProgressVisuals();
        return;
      }

      const timeMs = time.getTime();
      const taskStartMs = currentTaskStart.getTime();

      if (timeMs < taskStartMs) {
        hideProgressLine();
        resetTaskProgressVisuals();
        return;
      }

      const progressTracks = getProgressTracks();
      const focusId = followPilotTrackIdRef.current ?? progressFocusTrackIdRef.current;
      const marker = computeTaskProgressMarker(
        progressTracks,
        routeRef.current,
        fieldTimelineRef.current,
        time,
        focusId ? { focusTrackId: focusId } : undefined,
      );

      if (!marker) {
        hideProgressLine();
        updateTaskProgressVisuals(time, 0, progressColor);
        return;
      }

      progressLine.setStyle({ color: progressColor });
      progressLine.setLatLngs(marker.line.map((point) => [point.lat, point.lon]));
      progressLine.bringToFront();
      taskProgressMarkerRef.current = marker;
      updateTaskProgressVisuals(time, marker.taskPercent, progressColor);

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
          applyProgressLabelTheme(labelEl, progressColor);
        }
      }
    };

    const syncAll = (time: Date, updateLabels = true) => {
      const positions = computeCompetitorPositions(tracksRef.current, routeRef.current, time);

      const focusTrackId = progressFocusTrackIdRef.current;
      const orderedTracks = [...tracksRef.current].sort((a, b) => {
        if (a.id === focusTrackId) return 1;
        if (b.id === focusTrackId) return -1;
        const rankA = positions.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rankB = positions.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return rankB - rankA;
      });

      for (const track of orderedTracks) {
        syncMarker(track, time, positions.get(track.id), updateLabels);
      }

      syncSelectedFullPath(time);
      updateLeaderNextTurnpointHighlight(time);
      updateProgressLine(time);

      const followId = followPilotTrackIdRef.current;
      if (followId) {
        const followTrack = allEnrichedTracksRef.current.find((track) => track.id === followId);
        const snapshot =
          followTrack && getTrackSnapshotAtTime(followTrack, time, routeRef.current);
        if (snapshot) {
          map.panTo([snapshot.lat, snapshot.lon], { animate: !playing, duration: 0.2 });
        }
      }
    };

    syncAllRef.current = syncAll;

    if (!playing) {
      syncAll(pausedTimeRef.current, true);
    }

    const refreshProgressLabelOnMove = () => {
      if (playing) return;
      updateLeaderNextTurnpointHighlight(pausedTimeRef.current);
      updateProgressLine(pausedTimeRef.current);
    };
    map.on('move', refreshProgressLabelOnMove);

    if (!playing) {
      return () => {
        map.off('move', refreshProgressLabelOnMove);
      };
    }

    let rafId = 0;
    const loop = () => {
      const now = Date.now();
      const updateLabels =
        now - lastPilotLabelUpdateMsRef.current >= PILOT_LABEL_UPDATE_INTERVAL_MS;
      if (updateLabels) {
        lastPilotLabelUpdateMsRef.current = now;
      }

      syncAll(currentTimeRef.current, updateLabels);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      map.off('move', refreshProgressLabelOnMove);
      cancelAnimationFrame(rafId);
    };
  }, [
    playing,
    currentTimeRef,
    route,
    circles,
    layerRefs,
    taskProgressMarkerRef,
    map,
    allEnrichedTracks,
    progressFocusTrackId,
    progressFocusColor,
    followPilotTrackId,
    selectedPilotTrackId,
    fieldTimeline,
    nextTurnpointTimeline,
  ]);

  useEffect(() => {
    if (playing) return;
    syncAllRef.current(pausedTime, true);
  }, [playing, pausedTime]);

  return null;
}
