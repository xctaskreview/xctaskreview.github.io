import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react';
import { CartesianGrid, ComposedChart, Customized, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  buildChartDistanceTicks,
  buildChartPathPixels,
  buildChartPolylineD,
  CHART_PILOT_LABEL_GAP,
  CHART_PILOT_MARKER_RADIUS,
  CHART_TROPHY_SIZE,
  chartClientXToTaskDistanceDisplay,
  chartPathLengthAtTime,
  chartPilotLabelOffsetX,
  chartPlotRect,
  clampChartTaskDistanceDisplay,
  countTaggedTurnpoints,
  formatChartDistanceTick,
  hasChartMaxProgressLink,
  isLeadingChartPilot,
  isTurnpointTagged,
  roundChartPixel,
  taskDistanceDisplayToPercent,
  type ChartPathPixels,
  type ChartPlotRect,
} from '../lib/chartAltitude';
import { clampChartAltitudeDisplay, LANDED_COLOR } from '../lib/geo';
import {
  buildPilotChartFullPathGeometry,
  buildPilotChartTrailPoints,
  findPathIndexAtOrBefore,
  PILOT_PATH_FUTURE_OPACITY,
  PILOT_PATH_PAST_OPACITY,
  type PilotChartPathGeometry,
} from '../lib/pilotTrail';
import type { AppPreferences } from '../lib/preferences';
import {
  buildChartAltitudeTicks,
  kmToDistanceUnit,
  metersToAltitudeUnit,
  normalizePilotTrailLengthM,
} from '../lib/preferences';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
import { getPilotMaxProgressAtTime, getTrackSnapshotAtTime, resolveSeekTimeForTaskPercent } from '../lib/taskProgress';
import type { TaskFieldTimeline } from '../lib/taskTimeline';
import { TROPHY_ICON_PATHS, TROPHY_ICON_VIEW_SIZE } from '../lib/trophyIcon';
import { getTrackColor } from '../lib/tracks';
import { GOAL_COLOR, START_COLOR, TASK_PROGRESS_LINE_COLOR } from '../lib/taskMapStyle';
import type { TaskProgressMarker, TurnpointReachMarker } from '../lib/taskProgressMarker';
import { formatTurnpointHoverLabel } from '../lib/turnpointTooltip';
import type { OptimizedRoute, ProgressTurnpoint } from '../lib/types';
import { TurnpointFloatingTooltip } from './TurnpointHoverTooltip';
import { useFixedElementSize } from '../lib/useFixedElementSize';

const MAX_PROGRESS_MARKER_OPACITY = 0.4;
const MAX_PROGRESS_MARKER_LANDED_OPACITY = MAX_PROGRESS_MARKER_OPACITY * 0.85;
const MAX_PROGRESS_LINK_OPACITY = 0.45;
const PILOT_MARKER_LANDED_OPACITY = 0.7;
const TRAIL_OPACITY = 0.8;
const TRAIL_LANDED_OPACITY = 0.55;

/** Fixed layout so vertical resize does not shift the plot area horizontally. */
const CHART_Y_AXIS_WIDTH = 56;
const CHART_MARGIN = { top: 12, right: 12, bottom: 6, left: 8 } as const;

const CHART_TICK_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

function renderFixedYAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: number };
}) {
  const { x, y, payload } = props;
  if (x == null || y == null || payload?.value == null) {
    return <g />;
  }
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill="#64748b"
      fontSize={10}
      fontFamily={CHART_TICK_FONT}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {payload.value}
    </text>
  );
}

function renderFixedXAxisTick(
  maxDistance: number,
  distanceUnit: AppPreferences['distanceUnit'],
) {
  return function FixedXAxisTick(props: {
    x?: number;
    y?: number;
    payload?: { value?: number };
  }) {
    const { x, y, payload } = props;
    if (x == null || y == null || payload?.value == null) {
      return <g />;
    }
    return (
      <text
        x={x}
        y={y}
        dy={12}
        textAnchor="middle"
        fill="#64748b"
        fontSize={10}
        fontFamily={CHART_TICK_FONT}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatChartDistanceTick(payload.value, maxDistance, distanceUnit)}
      </text>
    );
  };
}

export interface AltitudeChartProps {
  enrichedTracks: EnrichedFlightTrack[];
  allEnrichedTracks: EnrichedFlightTrack[];
  trackColors: Record<string, string>;
  route: OptimizedRoute;
  currentTimeRef: RefObject<Date>;
  playing: boolean;
  pausedTime: Date;
  turnpoints: ProgressTurnpoint[];
  turnpointReachMarkers: TurnpointReachMarker[];
  fieldTimeline: TaskFieldTimeline;
  taskStart?: Date;
  playbackEndTime: Date;
  onTimeChange: (time: Date) => void;
  progressFocusTrackId: string | null;
  onSetProgressFocusTrack: (trackId: string) => void;
  selectedPilotTrackId: string | null;
  altitudeMin: number;
  altitudeMax: number;
  altitudeStep: number;
  taskDistanceKm: number;
  preferences: AppPreferences;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
  suspendLiveUpdates?: boolean;
}

interface ReferenceLineShapeProps {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface TurnpointLineHoverHandlers {
  onMouseEnter?: (event: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave?: () => void;
  onMouseMove?: (event: React.MouseEvent<SVGGElement>) => void;
}

function buildTurnpointLineShape(
  strokeColor: string,
  onClick: (() => void) | undefined,
  hoverHandlers?: TurnpointLineHoverHandlers,
) {
  return function TurnpointLineShape({ x1, y1, x2, y2 }: ReferenceLineShapeProps) {
    if (x1 == null || y1 == null || x2 == null || y2 == null) {
      return <g />;
    }

    const top = Math.min(y1, y2);
    const height = Math.abs(y2 - y1);

    return (
      <g
        className={
          onClick ? 'chart-turnpoint-line chart-turnpoint-line-clickable' : 'chart-turnpoint-line'
        }
        onClick={onClick}
        onMouseEnter={hoverHandlers?.onMouseEnter}
        onMouseLeave={hoverHandlers?.onMouseLeave}
        onMouseMove={hoverHandlers?.onMouseMove}
      >
        <rect x={x1 - 8} y={top} width={16} height={height} fill="transparent" />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={strokeColor}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      </g>
    );
  };
}

/** Selected pilot's whole path, split at the current time without rebuilding its geometry. */
interface SelectedFullPath {
  geometry: PilotChartPathGeometry;
  track: EnrichedFlightTrack;
  color: string;
}

/** d3 scale as handed to us by Recharts. */
interface ChartAxisScale {
  (value: number): number;
  domain: () => number[];
  range: () => number[];
}

type ChartAxisMap = Record<string, { scale?: ChartAxisScale }>;

function firstAxisScale(axisMap: ChartAxisMap | undefined): ChartAxisScale | null {
  if (!axisMap) return null;
  for (const axis of Object.values(axisMap)) {
    if (typeof axis?.scale === 'function') return axis.scale;
  }
  return null;
}

function axisScaleKey(scale: ChartAxisScale | null): string {
  if (!scale) return '';
  return `${scale.domain().join(',')}|${scale.range().join(',')}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function setVisibility(node: SVGElement, visible: boolean): void {
  node.setAttribute('visibility', visible ? 'visible' : 'hidden');
}

/** Sentinel for "no attribute written yet", so the first frame always paints. */
const UNWRITTEN = '\u0000';

/**
 * Every node one pilot owns, created once and then only written to. `frame*` fields are
 * scratch space for the current frame: the leader badge is only known after every pilot has
 * been sampled, so sampling and writing are two passes over the same preallocated entries.
 */
interface LivePilotNodes {
  trackId: string;
  track: EnrichedFlightTrack;
  index: number;

  pilotGroup: SVGGElement;
  pilotCircle: SVGCircleElement;
  pilotTrophy: SVGUseElement;
  pilotLabel: SVGTextElement;
  maxGroup: SVGGElement;
  maxCircle: SVGCircleElement;
  linkPath: SVGPathElement;
  trailPath: SVGPathElement;
  futureTrailPath: SVGPathElement;

  writtenPilotTransform: string;
  writtenMaxTransform: string;
  writtenLinkD: string;
  writtenTrailD: string;
  writtenFutureDash: string;
  writtenColor: string;
  writtenLabelX: string;
  writtenLanded: boolean | null;
  pilotVisible: boolean;
  maxVisible: boolean;
  linkVisible: boolean;
  trailVisible: boolean;
  futureTrailVisible: boolean;
  futureCursor: number;
  trophyVisible: boolean;

  frameVisible: boolean;
  frameX: number;
  frameY: number;
  frameLanded: boolean;
  frameHasMax: boolean;
  frameMaxX: number;
  frameMaxY: number;
  frameLinkVisible: boolean;
  frameTrailD: string;
}

interface LiveLayerHosts {
  futureTrails: SVGGElement;
  trails: SVGGElement;
  links: SVGGElement;
  maxMarkers: SVGGElement;
  pilots: SVGGElement;
}

function createPilotNodes(
  track: EnrichedFlightTrack,
  trophyHref: string,
  onSelect: (trackId: string) => void,
): LivePilotNodes {
  const pilotGroup = createSvgElement('g');
  pilotGroup.setAttribute('class', 'chart-pilot-marker');
  pilotGroup.setAttribute('visibility', 'hidden');

  const pilotCircle = createSvgElement('circle');
  pilotCircle.setAttribute('r', String(CHART_PILOT_MARKER_RADIUS));
  pilotCircle.setAttribute('stroke', '#ffffff');
  pilotCircle.setAttribute('stroke-width', '2');
  pilotGroup.append(pilotCircle);

  const pilotTrophy = createSvgElement('use');
  pilotTrophy.setAttribute('href', trophyHref);
  pilotTrophy.setAttribute(
    'transform',
    `translate(${CHART_PILOT_LABEL_GAP},${-CHART_TROPHY_SIZE / 2}) scale(${CHART_TROPHY_SIZE / TROPHY_ICON_VIEW_SIZE})`,
  );
  pilotTrophy.setAttribute('visibility', 'hidden');
  pilotGroup.append(pilotTrophy);

  const pilotLabel = createSvgElement('text');
  pilotLabel.setAttribute('y', '4');
  pilotLabel.setAttribute('font-size', '11');
  pilotLabel.setAttribute('font-weight', '600');
  pilotLabel.setAttribute('stroke', 'none');
  pilotLabel.setAttribute('paint-order', 'fill');
  pilotLabel.textContent = track.firstName;
  pilotGroup.append(pilotLabel);

  const maxGroup = createSvgElement('g');
  maxGroup.setAttribute('class', 'chart-max-progress-marker');
  maxGroup.setAttribute('visibility', 'hidden');

  const maxCircle = createSvgElement('circle');
  maxCircle.setAttribute('r', String(CHART_PILOT_MARKER_RADIUS));
  maxCircle.setAttribute('stroke', '#ffffff');
  maxCircle.setAttribute('stroke-width', '2');
  maxGroup.append(maxCircle);

  const linkPath = createSvgElement('path');
  linkPath.setAttribute('stroke-width', '1.5');
  linkPath.setAttribute('stroke-opacity', String(MAX_PROGRESS_LINK_OPACITY));
  linkPath.setAttribute('stroke-dasharray', '4 3');
  linkPath.setAttribute('visibility', 'hidden');

  const trailPath = createSvgElement('path');
  trailPath.setAttribute('stroke-width', '2.5');
  trailPath.setAttribute('visibility', 'hidden');

  const futureTrailPath = createSvgElement('path');
  futureTrailPath.setAttribute('stroke-width', '3');
  futureTrailPath.setAttribute('stroke-opacity', String(PILOT_PATH_FUTURE_OPACITY));
  futureTrailPath.setAttribute('fill', 'none');
  futureTrailPath.setAttribute('visibility', 'hidden');
  futureTrailPath.setAttribute('stroke-dasharray', '0 1');

  const select = (event: Event) => {
    event.stopPropagation();
    onSelect(track.id);
  };
  pilotGroup.addEventListener('click', select);
  maxGroup.addEventListener('click', select);

  return {
    trackId: track.id,
    track,
    index: 0,
    pilotGroup,
    pilotCircle,
    pilotTrophy,
    pilotLabel,
    maxGroup,
    maxCircle,
    linkPath,
    trailPath,
    futureTrailPath,
    writtenPilotTransform: UNWRITTEN,
    writtenMaxTransform: UNWRITTEN,
    writtenLinkD: UNWRITTEN,
    writtenTrailD: UNWRITTEN,
    writtenFutureDash: UNWRITTEN,
    writtenColor: UNWRITTEN,
    writtenLabelX: UNWRITTEN,
    writtenLanded: null,
    pilotVisible: false,
    maxVisible: false,
    linkVisible: false,
    trailVisible: false,
    futureTrailVisible: false,
    futureCursor: -1,
    trophyVisible: false,
    frameVisible: false,
    frameX: 0,
    frameY: 0,
    frameLanded: false,
    frameHasMax: false,
    frameMaxX: 0,
    frameMaxY: 0,
    frameLinkVisible: false,
    frameTrailD: '',
  };
}

function removePilotNodes(entry: LivePilotNodes): void {
  entry.pilotGroup.remove();
  entry.maxGroup.remove();
  entry.linkPath.remove();
  entry.trailPath.remove();
  entry.futureTrailPath.remove();
}

/** Everything the live layer reads, travelling by ref so the layer identity stays fixed. */
interface ChartLiveSettings {
  enrichedTracks: EnrichedFlightTrack[];
  trackColors: Record<string, string>;
  route: OptimizedRoute;
  taskDistanceKm: number;
  taskDistanceDisplay: number;
  preferences: AppPreferences;
  altitudeMin: number;
  altitudeMax: number;
  selectedPilotTrackId: string | null;
  fullPath: SelectedFullPath | null;
  currentTimeRef: RefObject<Date>;
  playing: boolean;
  pausedTime: Date;
  suspendLiveUpdates: boolean;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
  onPilotSelectRef: RefObject<(trackId: string) => void>;
  onProgressPercentRef: RefObject<(progressPercent: number) => void>;
}

interface ChartLiveLayerProps extends ChartLiveSettings {
  /** Injected by Recharts when rendered through <Customized>. */
  xAxisMap?: ChartAxisMap;
  yAxisMap?: ChartAxisMap;
}

/**
 * The whole time-dependent half of the chart. React renders the node structure once; every
 * frame afterwards is attribute writes on pooled nodes driven by a RAF loop, so playback
 * never re-enters Recharts.
 */
function ChartLiveLayer({
  enrichedTracks,
  trackColors,
  route,
  taskDistanceKm,
  taskDistanceDisplay,
  preferences,
  altitudeMin,
  altitudeMax,
  selectedPilotTrackId,
  fullPath,
  currentTimeRef,
  playing,
  pausedTime,
  suspendLiveUpdates,
  taskProgressMarkerRef,
  onPilotSelectRef,
  onProgressPercentRef,
  xAxisMap,
  yAxisMap,
}: ChartLiveLayerProps) {
  const idSuffix = useId().replace(/:/g, '');
  const trophyId = `chart-live-trophy-${idSuffix}`;
  const clipId = `chart-live-clip-${idSuffix}`;

  const trailsHostRef = useRef<SVGGElement>(null);
  const futureTrailsHostRef = useRef<SVGGElement>(null);
  const linksHostRef = useRef<SVGGElement>(null);
  const maxHostRef = useRef<SVGGElement>(null);
  const pilotsHostRef = useRef<SVGGElement>(null);
  const progressLineRef = useRef<SVGLineElement>(null);
  const pastPathRef = useRef<SVGPathElement>(null);
  const futurePathRef = useRef<SVGPathElement>(null);

  const poolRef = useRef<Map<string, LivePilotNodes>>(new Map());
  const entriesRef = useRef<LivePilotNodes[]>([]);
  const progressWriteRef = useRef({ x: UNWRITTEN, y1: UNWRITTEN, y2: UNWRITTEN, visible: false });
  const fullPathCursorRef = useRef(-1);
  const futurePathCacheRef = useRef<
    Map<string, { pixels: ChartPathPixels; timesMs: Float64Array }>
  >(new Map());

  const seenFullPathRef = useRef(fullPath);
  if (seenFullPathRef.current !== fullPath) {
    seenFullPathRef.current = fullPath;
    fullPathCursorRef.current = -1;
  }

  const xScale = firstAxisScale(xAxisMap);
  const yScale = firstAxisScale(yAxisMap);
  const scaleKey = `${axisScaleKey(xScale)}#${axisScaleKey(yScale)}`;

  const plotRect = useMemo<ChartPlotRect | null>(
    () => (xScale && yScale ? chartPlotRect(xScale.range(), yScale.range()) : null),
    // Recharts hands out a fresh scale object per render; only domain and range matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scaleKey],
  );

  const fullPathPixels = useMemo<ChartPathPixels | null>(() => {
    if (!xScale || !yScale || !fullPath || fullPath.geometry.pointCount < 2) return null;
    return buildChartPathPixels(fullPath.geometry.points, xScale, yScale);
    // Rebuilt only when the path itself or the plot mapping changes, never per frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullPath, scaleKey]);

  useEffect(() => {
    const cache = futurePathCacheRef.current;
    cache.clear();
    if (!preferences.showFutureTrail || !xScale || !yScale) {
      return;
    }

    const { distanceUnit, altitudeUnit } = preferences;
    for (const track of enrichedTracks) {
      const geometry = buildPilotChartFullPathGeometry(
        track,
        taskDistanceKm,
        distanceUnit,
        altitudeUnit,
        altitudeMin,
        altitudeMax,
      );
      if (geometry.pointCount < 2) continue;
      cache.set(track.id, {
        pixels: buildChartPathPixels(geometry.points, xScale, yScale),
        timesMs: geometry.timesMs,
      });
    }

    for (const entry of poolRef.current.values()) {
      const item = cache.get(entry.trackId);
      if (item) {
        entry.futureTrailPath.setAttribute('d', item.pixels.d);
        entry.futureCursor = -1;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enrichedTracks,
    preferences.showFutureTrail,
    preferences.distanceUnit,
    preferences.altitudeUnit,
    taskDistanceKm,
    altitudeMin,
    altitudeMax,
    scaleKey,
  ]);

  useEffect(() => {
    const hosts: LiveLayerHosts | null =
      futureTrailsHostRef.current &&
      trailsHostRef.current &&
      linksHostRef.current &&
      maxHostRef.current &&
      pilotsHostRef.current
        ? {
            futureTrails: futureTrailsHostRef.current,
            trails: trailsHostRef.current,
            links: linksHostRef.current,
            maxMarkers: maxHostRef.current,
            pilots: pilotsHostRef.current,
          }
        : null;
    if (!hosts) return;

    const pool = poolRef.current;
    const trophyHref = `#${trophyId}`;
    const activeIds = new Set(enrichedTracks.map((track) => track.id));

    for (const [id, entry] of [...pool]) {
      if (activeIds.has(id)) continue;
      removePilotNodes(entry);
      pool.delete(id);
    }

    const ordered: LivePilotNodes[] = [];
    for (const [index, track] of enrichedTracks.entries()) {
      let entry = pool.get(track.id);
      if (!entry) {
        entry = createPilotNodes(track, trophyHref, (trackId) =>
          onPilotSelectRef.current?.(trackId),
        );
        pool.set(track.id, entry);
      }

      entry.track = track;
      entry.index = index;
      if (entry.pilotLabel.textContent !== track.firstName) {
        entry.pilotLabel.textContent = track.firstName;
      }

      // Appending in track order keeps the drawing order stable when the field changes.
      hosts.futureTrails.append(entry.futureTrailPath);
      hosts.trails.append(entry.trailPath);
      hosts.links.append(entry.linkPath);
      hosts.maxMarkers.append(entry.maxGroup);
      hosts.pilots.append(entry.pilotGroup);
      ordered.push(entry);
    }

    entriesRef.current = ordered;
  }, [enrichedTracks, onPilotSelectRef, trophyId]);

  useEffect(() => {
    const pool = poolRef.current;
    return () => {
      for (const entry of pool.values()) {
        removePilotNodes(entry);
      }
      pool.clear();
      entriesRef.current = [];
    };
  }, []);

  const applyFrame = useCallback(
    (time: Date) => {
      if (!xScale || !yScale || !plotRect) return;

      const entries = entriesRef.current;
      const { distanceUnit, altitudeUnit } = preferences;
      const trailLengthM = normalizePilotTrailLengthM(preferences.pilotTrailLengthM);

      let leaderId: string | null = null;
      let leaderName: string | null = null;
      let leaderTaskPercent = 0;

      for (const entry of entries) {
        const snapshot = getTrackSnapshotAtTime(entry.track, time, route);
        if (!snapshot) {
          entry.frameVisible = false;
          continue;
        }

        const distance = clampChartTaskDistanceDisplay(
          kmToDistanceUnit((snapshot.taskPercent / 100) * taskDistanceKm, distanceUnit),
          taskDistanceDisplay,
        );
        const altitude = clampChartAltitudeDisplay(
          metersToAltitudeUnit(snapshot.alt, altitudeUnit),
          altitudeMin,
          altitudeMax,
        );

        entry.frameVisible = true;
        entry.frameLanded = snapshot.landed;
        entry.frameX = xScale(distance);
        entry.frameY = yScale(altitude);

        const maxProgress = getPilotMaxProgressAtTime(entry.track, time);
        let maxTaskPercent = maxProgress?.taskPercent ?? -1;
        let maxAlt = maxProgress?.alt ?? 0;
        if (snapshot.taskPercent >= maxTaskPercent) {
          maxTaskPercent = snapshot.taskPercent;
          maxAlt = snapshot.alt;
        }

        entry.frameHasMax = maxTaskPercent > 0;
        if (entry.frameHasMax) {
          const maxDistance = clampChartTaskDistanceDisplay(
            kmToDistanceUnit((maxTaskPercent / 100) * taskDistanceKm, distanceUnit),
            taskDistanceDisplay,
          );
          const maxAltitude = clampChartAltitudeDisplay(
            metersToAltitudeUnit(maxAlt, altitudeUnit),
            altitudeMin,
            altitudeMax,
          );
          entry.frameMaxX = xScale(maxDistance);
          entry.frameMaxY = yScale(maxAltitude);
          entry.frameLinkVisible = hasChartMaxProgressLink(
            distance,
            altitude,
            maxDistance,
            maxAltitude,
          );
        } else {
          entry.frameLinkVisible = false;
        }

        entry.frameTrailD =
          trailLengthM > 0 && entry.trackId !== selectedPilotTrackId
            ? buildChartPolylineD(
                buildPilotChartTrailPoints(
                  entry.track,
                  time,
                  trailLengthM,
                  route,
                  taskDistanceKm,
                  distanceUnit,
                  altitudeUnit,
                  altitudeMin,
                  altitudeMax,
                ),
                xScale,
                yScale,
              )
            : '';

        if (
          isLeadingChartPilot(
            snapshot.taskPercent,
            entry.track.pilotName,
            leaderTaskPercent,
            leaderName,
          )
        ) {
          leaderId = entry.trackId;
          leaderName = entry.track.pilotName;
          leaderTaskPercent = snapshot.taskPercent;
        }
      }

      for (const entry of entries) {
        if (!entry.frameVisible) {
          if (entry.pilotVisible) {
            setVisibility(entry.pilotGroup, false);
            entry.pilotVisible = false;
          }
          if (entry.maxVisible) {
            setVisibility(entry.maxGroup, false);
            entry.maxVisible = false;
          }
          if (entry.linkVisible) {
            setVisibility(entry.linkPath, false);
            entry.linkVisible = false;
          }
          if (entry.trailVisible) {
            setVisibility(entry.trailPath, false);
            entry.trailVisible = false;
          }
          if (entry.futureTrailVisible) {
            setVisibility(entry.futureTrailPath, false);
            entry.futureTrailVisible = false;
          }
          continue;
        }

        const color = entry.frameLanded
          ? LANDED_COLOR
          : getTrackColor(entry.trackId, trackColors, entry.index);

        if (entry.writtenColor !== color) {
          entry.writtenColor = color;
          entry.pilotCircle.setAttribute('fill', color);
          entry.pilotLabel.setAttribute('fill', color);
          entry.pilotTrophy.style.color = color;
          entry.maxCircle.setAttribute('fill', color);
          entry.linkPath.setAttribute('stroke', color);
          entry.trailPath.setAttribute('stroke', color);
          entry.futureTrailPath.setAttribute('stroke', color);
        }

        if (entry.writtenLanded !== entry.frameLanded) {
          entry.writtenLanded = entry.frameLanded;
          entry.pilotGroup.setAttribute(
            'opacity',
            entry.frameLanded ? String(PILOT_MARKER_LANDED_OPACITY) : '1',
          );
          entry.maxGroup.setAttribute(
            'opacity',
            String(
              entry.frameLanded
                ? MAX_PROGRESS_MARKER_LANDED_OPACITY
                : MAX_PROGRESS_MARKER_OPACITY,
            ),
          );
          entry.trailPath.setAttribute(
            'stroke-opacity',
            String(entry.frameLanded ? TRAIL_LANDED_OPACITY : TRAIL_OPACITY),
          );
        }

        const x = roundChartPixel(entry.frameX);
        const y = roundChartPixel(entry.frameY);
        const pilotTransform = `translate(${x},${y})`;
        if (entry.writtenPilotTransform !== pilotTransform) {
          entry.writtenPilotTransform = pilotTransform;
          entry.pilotGroup.setAttribute('transform', pilotTransform);
        }
        if (!entry.pilotVisible) {
          setVisibility(entry.pilotGroup, true);
          entry.pilotVisible = true;
        }

        const isLeader = entry.trackId === leaderId;
        if (entry.trophyVisible !== isLeader) {
          entry.trophyVisible = isLeader;
          setVisibility(entry.pilotTrophy, isLeader);
        }
        const labelX = String(chartPilotLabelOffsetX(isLeader));
        if (entry.writtenLabelX !== labelX) {
          entry.writtenLabelX = labelX;
          entry.pilotLabel.setAttribute('x', labelX);
        }

        if (entry.frameHasMax) {
          const maxTransform = `translate(${roundChartPixel(entry.frameMaxX)},${roundChartPixel(entry.frameMaxY)})`;
          if (entry.writtenMaxTransform !== maxTransform) {
            entry.writtenMaxTransform = maxTransform;
            entry.maxGroup.setAttribute('transform', maxTransform);
          }
          if (!entry.maxVisible) {
            setVisibility(entry.maxGroup, true);
            entry.maxVisible = true;
          }
        } else if (entry.maxVisible) {
          setVisibility(entry.maxGroup, false);
          entry.maxVisible = false;
        }

        if (entry.frameLinkVisible) {
          const linkD = `M${x},${y}L${roundChartPixel(entry.frameMaxX)},${roundChartPixel(entry.frameMaxY)}`;
          if (entry.writtenLinkD !== linkD) {
            entry.writtenLinkD = linkD;
            entry.linkPath.setAttribute('d', linkD);
          }
          if (!entry.linkVisible) {
            setVisibility(entry.linkPath, true);
            entry.linkVisible = true;
          }
        } else if (entry.linkVisible) {
          setVisibility(entry.linkPath, false);
          entry.linkVisible = false;
        }

        if (entry.frameTrailD !== '') {
          if (entry.writtenTrailD !== entry.frameTrailD) {
            entry.writtenTrailD = entry.frameTrailD;
            entry.trailPath.setAttribute('d', entry.frameTrailD);
          }
          if (!entry.trailVisible) {
            setVisibility(entry.trailPath, true);
            entry.trailVisible = true;
          }
        } else if (entry.trailVisible) {
          setVisibility(entry.trailPath, false);
          entry.trailVisible = false;
        }
      }

      const showFutureTrail = preferences.showFutureTrail;
      const timeMs = time.getTime();
      for (const entry of entries) {
        const hideFuture =
          !showFutureTrail ||
          !entry.frameVisible ||
          entry.trackId === selectedPilotTrackId;
        if (hideFuture) {
          if (entry.futureTrailVisible) {
            setVisibility(entry.futureTrailPath, false);
            entry.futureTrailVisible = false;
          }
          continue;
        }

        const cached = futurePathCacheRef.current.get(entry.trackId);
        if (!cached) {
          if (entry.futureTrailVisible) {
            setVisibility(entry.futureTrailPath, false);
            entry.futureTrailVisible = false;
          }
          continue;
        }

        const index = findPathIndexAtOrBefore(cached.timesMs, timeMs, entry.futureCursor);
        entry.futureCursor = index;
        const flown = chartPathLengthAtTime(cached.pixels, cached.timesMs, timeMs, index);
        const dash = `0 ${flown} ${cached.pixels.totalLength} 0`;
        if (entry.writtenFutureDash !== dash) {
          entry.writtenFutureDash = dash;
          entry.futureTrailPath.setAttribute('stroke-dasharray', dash);
        }
        if (!entry.futureTrailVisible) {
          setVisibility(entry.futureTrailPath, true);
          entry.futureTrailVisible = true;
        }
      }

      const marker = taskProgressMarkerRef.current;
      const progressLine = progressLineRef.current;
      if (progressLine) {
        const written = progressWriteRef.current;
        const progressX =
          marker !== null
            ? roundChartPixel(
                xScale(
                  clampChartTaskDistanceDisplay(
                    kmToDistanceUnit(marker.taskKm, distanceUnit),
                    taskDistanceDisplay,
                  ),
                ),
              )
            : null;
        const showProgress =
          progressX !== null && progressX >= plotRect.left && progressX <= plotRect.right;

        if (showProgress) {
          const x = String(progressX);
          if (written.x !== x) {
            written.x = x;
            progressLine.setAttribute('x1', x);
            progressLine.setAttribute('x2', x);
          }
          const y1 = String(roundChartPixel(plotRect.top));
          const y2 = String(roundChartPixel(plotRect.bottom));
          if (written.y1 !== y1) {
            written.y1 = y1;
            progressLine.setAttribute('y1', y1);
          }
          if (written.y2 !== y2) {
            written.y2 = y2;
            progressLine.setAttribute('y2', y2);
          }
        }
        if (written.visible !== showProgress) {
          written.visible = showProgress;
          setVisibility(progressLine, showProgress);
        }
      }

      onProgressPercentRef.current?.(marker?.taskPercent ?? 0);

      const pastPath = pastPathRef.current;
      const futurePath = futurePathRef.current;
      if (fullPath && fullPathPixels && pastPath && futurePath) {
        const { geometry, track, color } = fullPath;
        const timeMs = time.getTime();
        const index = findPathIndexAtOrBefore(geometry.timesMs, timeMs, fullPathCursorRef.current);
        fullPathCursorRef.current = index;

        const flown = chartPathLengthAtTime(fullPathPixels, geometry.timesMs, timeMs, index);
        const total = fullPathPixels.totalLength;
        pastPath.setAttribute('stroke-dasharray', `${flown} ${total}`);
        futurePath.setAttribute('stroke-dasharray', `0 ${flown} ${total} 0`);

        const landingTimeMs = track.landingTime
          ? track.landingTime.getTime()
          : geometry.pointCount > 0
            ? geometry.timesMs[geometry.pointCount - 1]
            : null;
        const stroke = landingTimeMs !== null && timeMs >= landingTimeMs ? LANDED_COLOR : color;
        if (pastPath.getAttribute('stroke') !== stroke) {
          pastPath.setAttribute('stroke', stroke);
          futurePath.setAttribute('stroke', stroke);
        }
      }
    },
    // Scale identity churns per render; `scaleKey` is what actually changes the geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      scaleKey,
      plotRect,
      fullPath,
      fullPathPixels,
      route,
      // Read through `entriesRef`, but a new field must repaint even while paused.
      enrichedTracks,
      trackColors,
      taskDistanceKm,
      taskDistanceDisplay,
      preferences,
      altitudeMin,
      altitudeMax,
      selectedPilotTrackId,
      taskProgressMarkerRef,
      onProgressPercentRef,
    ],
  );

  useEffect(() => {
    if (playing) return;
    applyFrame(pausedTime);
  }, [applyFrame, playing, pausedTime]);

  useEffect(() => {
    if (suspendLiveUpdates || !playing) return;

    let rafId = 0;
    const loop = () => {
      applyFrame(currentTimeRef.current);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [applyFrame, currentTimeRef, playing, suspendLiveUpdates]);

  const clipUrl = plotRect ? `url(#${clipId})` : undefined;

  return (
    <g className="chart-live-layer">
      <defs>
        {plotRect && (
          <clipPath id={clipId}>
            {/* Matches how Recharts clips series against an x axis with allowDataOverflow. */}
            <rect
              x={plotRect.left}
              y={plotRect.top - plotRect.height / 2}
              width={plotRect.width}
              height={plotRect.height * 2}
            />
          </clipPath>
        )}
        {/* Native paths only — nesting Lucide's <svg> inside Recharts' surface breaks rendering. */}
        <g
          id={trophyId}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {TROPHY_ICON_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </defs>

      {fullPath && fullPathPixels && (
        <g className="chart-full-path" fill="none" strokeWidth={3} strokeLinecap="butt">
          {/* Constant dash props so React never overwrites the imperatively animated split. */}
          <path
            ref={futurePathRef}
            d={fullPathPixels.d}
            stroke={fullPath.color}
            strokeOpacity={PILOT_PATH_FUTURE_OPACITY}
            strokeDasharray="0 1"
          />
          <path
            ref={pastPathRef}
            d={fullPathPixels.d}
            stroke={fullPath.color}
            strokeOpacity={PILOT_PATH_PAST_OPACITY}
            strokeDasharray="0 1"
          />
        </g>
      )}

      <g
        ref={futureTrailsHostRef}
        className="chart-pilot-future-trails"
        fill="none"
        clipPath={clipUrl}
      />
      <g ref={trailsHostRef} className="chart-pilot-trails" fill="none" clipPath={clipUrl} />
      <line
        ref={progressLineRef}
        className="chart-progress-line"
        stroke={TASK_PROGRESS_LINE_COLOR}
        strokeWidth={2}
        fill="none"
        visibility="hidden"
        clipPath={clipUrl}
      />
      <g ref={linksHostRef} className="chart-max-progress-links" fill="none" clipPath={clipUrl} />
      <g ref={maxHostRef} className="chart-max-progress-markers" clipPath={clipUrl} />
      <g ref={pilotsHostRef} className="chart-pilot-markers" clipPath={clipUrl} />
    </g>
  );
}

/**
 * Recharts renders `<Customized component={fn}>` through `createElement(fn, ...)`, so a
 * component identity that changes between renders tears down the layer and rebuilds every
 * pooled node and the ~160 KB path string. Keeping this identity fixed at module scope and
 * reading the live settings from a ref means the layer survives every chart re-render.
 */
function ChartLiveCustomized({
  settingsRef,
  xAxisMap,
  yAxisMap,
}: {
  settingsRef: RefObject<ChartLiveSettings | null>;
  xAxisMap?: ChartAxisMap;
  yAxisMap?: ChartAxisMap;
}) {
  const settings = settingsRef.current;
  if (!settings) return null;

  return <ChartLiveLayer {...settings} xAxisMap={xAxisMap} yAxisMap={yAxisMap} />;
}

function useSelectedFullPath({
  allEnrichedTracks,
  trackColors,
  taskDistanceKm,
  preferences,
  altitudeMin,
  altitudeMax,
  selectedPilotTrackId,
}: Pick<
  AltitudeChartProps,
  | 'allEnrichedTracks'
  | 'trackColors'
  | 'taskDistanceKm'
  | 'preferences'
  | 'altitudeMin'
  | 'altitudeMax'
  | 'selectedPilotTrackId'
>): SelectedFullPath | null {
  const selectedTrack =
    selectedPilotTrackId !== null
      ? (allEnrichedTracks.find((track) => track.id === selectedPilotTrackId) ?? null)
      : null;
  const selectedColor = selectedTrack
    ? getTrackColor(
        selectedTrack.id,
        trackColors,
        Math.max(allEnrichedTracks.indexOf(selectedTrack), 0),
      )
    : null;

  return useMemo<SelectedFullPath | null>(() => {
    if (!selectedTrack || !selectedColor) return null;
    return {
      geometry: buildPilotChartFullPathGeometry(
        selectedTrack,
        taskDistanceKm,
        preferences.distanceUnit,
        preferences.altitudeUnit,
        altitudeMin,
        altitudeMax,
      ),
      track: selectedTrack,
      color: selectedColor,
    };
  }, [
    selectedTrack,
    selectedColor,
    taskDistanceKm,
    preferences.distanceUnit,
    preferences.altitudeUnit,
    altitudeMin,
    altitudeMax,
  ]);
}

/**
 * `pausedTime` follows the app playback clock, which ticks ~20 times a second, but while
 * playing the live layer reads `currentTimeRef` and nothing consumes `pausedTime`. Ignoring
 * it during playback keeps the clock from re-rendering the whole Recharts tree for nothing.
 */
function altitudeChartPropsEqual(prev: AltitudeChartProps, next: AltitudeChartProps): boolean {
  const keys = Object.keys(next) as (keyof AltitudeChartProps)[];
  if (keys.length !== Object.keys(prev).length) return false;

  const bothPlaying = prev.playing && next.playing;
  for (const key of keys) {
    if (key === 'pausedTime' && bothPlaying) continue;
    if (!Object.is(prev[key], next[key])) return false;
  }

  return true;
}

export const AltitudeChart = memo(function AltitudeChart({
  enrichedTracks,
  allEnrichedTracks,
  trackColors,
  route,
  currentTimeRef,
  playing,
  pausedTime,
  turnpoints,
  turnpointReachMarkers,
  fieldTimeline,
  taskStart,
  playbackEndTime,
  onTimeChange,
  progressFocusTrackId,
  onSetProgressFocusTrack,
  selectedPilotTrackId,
  altitudeMin,
  altitudeMax,
  altitudeStep,
  taskDistanceKm,
  preferences,
  taskProgressMarkerRef,
  suspendLiveUpdates = false,
}: AltitudeChartProps) {
  const plotHostRef = useRef<HTMLDivElement>(null);
  const plotSize = useFixedElementSize(plotHostRef, true);

  const [floatingTooltip, setFloatingTooltip] = useState<{
    tooltip: string;
    x: number;
    y: number;
  } | null>(null);

  const selectedFullPath = useSelectedFullPath({
    allEnrichedTracks,
    trackColors,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
    selectedPilotTrackId,
  });

  const taskDistanceDisplay = kmToDistanceUnit(taskDistanceKm, preferences.distanceUnit);

  const xAxisTick = useMemo(
    () => renderFixedXAxisTick(taskDistanceDisplay, preferences.distanceUnit),
    [taskDistanceDisplay, preferences.distanceUnit],
  );

  const reachMarkerByNumber = useMemo(() => {
    const map = new Map<number, TurnpointReachMarker>();
    for (const marker of turnpointReachMarkers) {
      map.set(marker.number, marker);
    }
    return map;
  }, [turnpointReachMarkers]);

  const yTicks = useMemo(
    () => buildChartAltitudeTicks(altitudeMin, altitudeMax, altitudeStep),
    [altitudeMin, altitudeMax, altitudeStep],
  );

  const xTicks = useMemo(
    () => buildChartDistanceTicks(taskDistanceDisplay),
    [taskDistanceDisplay],
  );

  const clampPlaybackTime = useCallback(
    (time: Date) => {
      const startMs = taskStart?.getTime() ?? playbackEndTime.getTime();
      const endMs = playbackEndTime.getTime();
      const clampedMs = Math.min(Math.max(time.getTime(), startMs), endMs);
      return new Date(clampedMs);
    },
    [playbackEndTime, taskStart],
  );

  const seekToTaskPercent = useCallback(
    (targetPercent: number) => {
      if (!taskStart) return;
      const seekTime = resolveSeekTimeForTaskPercent(
        targetPercent,
        taskStart,
        fieldTimeline,
        allEnrichedTracks,
        progressFocusTrackId,
      );
      if (!seekTime) return;
      onTimeChange(clampPlaybackTime(seekTime));
    },
    [
      allEnrichedTracks,
      clampPlaybackTime,
      fieldTimeline,
      onTimeChange,
      progressFocusTrackId,
      taskStart,
    ],
  );

  const seekToChartClientX = useCallback(
    (clientX: number) => {
      const host = plotHostRef.current;
      if (!host || plotSize.width <= 0) return;
      const taskDistance = chartClientXToTaskDistanceDisplay(
        clientX,
        host.getBoundingClientRect(),
        plotSize.width,
        taskDistanceDisplay,
        CHART_MARGIN.left,
        CHART_MARGIN.right,
        CHART_Y_AXIS_WIDTH,
      );
      seekToTaskPercent(taskDistanceDisplayToPercent(taskDistance, taskDistanceDisplay));
    },
    [plotSize.width, seekToTaskPercent, taskDistanceDisplay],
  );

  const handlePlotBackgroundClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element;
      if (target.closest('.chart-pilot-marker, .chart-max-progress-marker')) {
        return;
      }
      seekToChartClientX(event.clientX);
    },
    [seekToChartClientX],
  );

  const startTurnpointNumber = route.sssIndex + 1;
  const goalTurnpointNumber = route.goalIndex + 1;

  /**
   * Turnpoint colours are the one live-driven thing left in Recharts. Rather than render at
   * frame rate for them, the layer reports task progress every frame and this only publishes
   * a new value on the handful of frames where the tagged set actually grows or shrinks.
   */
  const [taggedProgressPercent, setTaggedProgressPercent] = useState(0);
  const taggedCountRef = useRef(0);
  const liveProgressPercentRef = useRef(0);
  const onProgressPercentRef = useRef<(progressPercent: number) => void>(() => {});
  onProgressPercentRef.current = (progressPercent: number) => {
    liveProgressPercentRef.current = progressPercent;
    const count = countTaggedTurnpoints(
      turnpoints,
      startTurnpointNumber,
      goalTurnpointNumber,
      progressPercent,
    );
    if (count === taggedCountRef.current) return;
    taggedCountRef.current = count;
    setTaggedProgressPercent(progressPercent);
  };

  useEffect(() => {
    // A new task rebases the count, so recolour from the progress the layer last reported.
    const progressPercent = liveProgressPercentRef.current;
    taggedCountRef.current = countTaggedTurnpoints(
      turnpoints,
      startTurnpointNumber,
      goalTurnpointNumber,
      progressPercent,
    );
    setTaggedProgressPercent(progressPercent);
  }, [turnpoints, startTurnpointNumber, goalTurnpointNumber]);

  const onPilotSelectRef = useRef(onSetProgressFocusTrack);
  onPilotSelectRef.current = onSetProgressFocusTrack;

  // Recharts clones every child on every render, so the layer settings travel by ref instead
  // of through a closure that would change the <Customized> component identity each frame.
  const liveSettingsRef = useRef<ChartLiveSettings | null>(null);
  liveSettingsRef.current = {
    enrichedTracks,
    trackColors,
    route,
    taskDistanceKm,
    taskDistanceDisplay,
    preferences,
    altitudeMin,
    altitudeMax,
    selectedPilotTrackId,
    fullPath: selectedFullPath,
    currentTimeRef,
    playing,
    pausedTime,
    suspendLiveUpdates,
    taskProgressMarkerRef,
    onPilotSelectRef,
    onProgressPercentRef,
  };

  return (
    <>
      {floatingTooltip && (
        <TurnpointFloatingTooltip
          tooltip={floatingTooltip.tooltip}
          x={floatingTooltip.x}
          y={floatingTooltip.y}
        />
      )}
      <div
        ref={plotHostRef}
        className="chart-plot-host chart-plot-host-interactive"
        onClick={handlePlotBackgroundClick}
      >
        {plotSize.width > 0 && plotSize.height > 0 && (
          <ComposedChart
            width={plotSize.width}
            height={plotSize.height}
            margin={CHART_MARGIN}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              type="number"
              dataKey="taskDistance"
              domain={[0, taskDistanceDisplay]}
              allowDataOverflow
              ticks={xTicks}
              padding={{ left: 0, right: 0 }}
              axisLine={false}
              tickLine={false}
              tick={xAxisTick}
            />
            <YAxis
              type="number"
              dataKey="altitude"
              width={CHART_Y_AXIS_WIDTH}
              domain={[altitudeMin, altitudeMax]}
              ticks={yTicks}
              allowDataOverflow={false}
              axisLine={false}
              tickLine={false}
              tick={renderFixedYAxisTick}
              interval={0}
            />

            {turnpoints.map((tp) => {
              const isStart = tp.number === startTurnpointNumber;
              const isGoal = tp.number === goalTurnpointNumber;
              const reachMarker = reachMarkerByNumber.get(tp.number);
              const tagged = isTurnpointTagged(
                tp,
                startTurnpointNumber,
                goalTurnpointNumber,
                taggedProgressPercent,
              );
              const strokeColor = isStart
                ? START_COLOR
                : isGoal
                  ? GOAL_COLOR
                  : tagged
                    ? TASK_PROGRESS_LINE_COLOR
                    : '#64748b';
              const labelColor = strokeColor;
              const handleTurnpointClick = taskStart
                ? () => seekToTaskPercent(tp.taskPercent)
                : undefined;
              const hoverTooltip =
                reachMarker !== undefined
                  ? formatTurnpointHoverLabel(reachMarker, {
                      distanceUnit: preferences.distanceUnit,
                      taskStart,
                    })
                  : undefined;
              const hoverHandlers =
                hoverTooltip !== undefined
                  ? {
                      onMouseEnter: (event: MouseEvent<SVGGElement>) => {
                        setFloatingTooltip({
                          tooltip: hoverTooltip,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      },
                      onMouseLeave: () => setFloatingTooltip(null),
                      onMouseMove: (event: MouseEvent<SVGGElement>) => {
                        setFloatingTooltip({
                          tooltip: hoverTooltip,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      },
                    }
                  : undefined;

              return (
                <ReferenceLine
                  key={`${tp.number}-${tp.name}`}
                  x={clampChartTaskDistanceDisplay(
                    kmToDistanceUnit(tp.taskKm, preferences.distanceUnit),
                    taskDistanceDisplay,
                  )}
                  stroke="none"
                  shape={buildTurnpointLineShape(strokeColor, handleTurnpointClick, hoverHandlers)}
                  label={{
                    value: String(tp.number),
                    position: 'insideTopLeft',
                    fill: labelColor,
                    fontSize: 11,
                    onClick: handleTurnpointClick,
                    className: handleTurnpointClick ? 'chart-turnpoint-label-clickable' : undefined,
                  }}
                />
              );
            })}

            <Customized component={ChartLiveCustomized} settingsRef={liveSettingsRef} />
          </ComposedChart>
        )}
      </div>
    </>
  );
}, altitudeChartPropsEqual);
