import { memo, useEffect, useMemo, useState, type MouseEvent, type RefObject } from 'react';
import { LineChart, Trophy } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from 'recharts';
import { buildCompetitorSnapshots } from '../lib/competitors';
import { clampChartAltitudeDisplay, LANDED_COLOR } from '../lib/geo';
import { buildPilotChartTrailPoints } from '../lib/pilotTrail';
import type { AppPreferences } from '../lib/preferences';
import {
  altitudeAxisLabel,
  buildChartAltitudeTicks,
  distanceAxisLabel,
  kmToDistanceUnit,
  metersToAltitudeUnit,
  normalizePilotTrailLengthM,
} from '../lib/preferences';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
import { getPilotMaxProgressAtTime, getTrackSnapshotAtTime } from '../lib/taskProgress';
import { getTrackColor } from '../lib/tracks';
import { GOAL_COLOR, START_COLOR, TASK_PROGRESS_LINE_COLOR } from '../lib/taskMapStyle';
import type { TaskProgressMarker, TurnpointReachMarker } from '../lib/taskProgressMarker';
import { formatTurnpointHoverLabel } from '../lib/turnpointTooltip';
import type { CompetitorSnapshot, OptimizedRoute, ProgressTurnpoint } from '../lib/types';
import { Icon } from './Icon';
import { TurnpointFloatingTooltip } from './TurnpointHoverTooltip';

interface ChartTrail {
  id: string;
  color: string;
  landed: boolean;
  points: { taskDistance: number; altitude: number }[];
}

interface ChartMaxProgressMarker {
  id: string;
  color: string;
  landed: boolean;
  taskDistance: number;
  altitude: number;
  currentTaskDistance: number;
  currentAltitude: number;
}

const MAX_PROGRESS_MARKER_OPACITY = 0.4;
const MAX_PROGRESS_LINK_OPACITY = 0.45;

interface AltitudeChartProps {
  enrichedTracks: EnrichedFlightTrack[];
  trackColors: Record<string, string>;
  route: OptimizedRoute;
  currentTimeRef: RefObject<Date>;
  playing: boolean;
  pausedTime: Date;
  turnpoints: ProgressTurnpoint[];
  turnpointReachMarkers: TurnpointReachMarker[];
  taskStart?: Date;
  onTimeChange: (time: Date) => void;
  altitudeMin: number;
  altitudeMax: number;
  altitudeStep: number;
  taskDistanceKm: number;
  preferences: AppPreferences;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
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

function useLiveProgressState({
  taskProgressMarkerRef,
  playing,
  pausedTime,
  distanceUnit,
}: {
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
  playing: boolean;
  pausedTime: Date;
  distanceUnit: AppPreferences['distanceUnit'];
}): { distance: number | null; percent: number } {
  const readState = () => {
    const marker = taskProgressMarkerRef.current;
    return {
      distance: marker !== null ? kmToDistanceUnit(marker.taskKm, distanceUnit) : null,
      percent: marker?.taskPercent ?? 0,
    };
  };

  const [progressState, setProgressState] = useState(readState);

  useEffect(() => {
    if (playing) return;
    setProgressState(readState());
  }, [playing, pausedTime, taskProgressMarkerRef, distanceUnit]);

  useEffect(() => {
    if (!playing) return;

    let rafId = 0;
    const loop = () => {
      setProgressState(readState());
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [playing, taskProgressMarkerRef, distanceUnit]);

  return progressState;
}

function useLiveChartCompetitors({
  enrichedTracks,
  trackColors,
  route,
  currentTimeRef,
  playing,
  pausedTime,
}: Pick<
  AltitudeChartProps,
  'enrichedTracks' | 'trackColors' | 'route' | 'currentTimeRef' | 'playing' | 'pausedTime'
>): CompetitorSnapshot[] {
  const [competitors, setCompetitors] = useState<CompetitorSnapshot[]>(() =>
    buildCompetitorSnapshots(enrichedTracks, trackColors, route, pausedTime, false),
  );

  useEffect(() => {
    if (playing) return;
    setCompetitors(buildCompetitorSnapshots(enrichedTracks, trackColors, route, pausedTime, false));
  }, [enrichedTracks, trackColors, route, playing, pausedTime]);

  useEffect(() => {
    if (!playing) return;

    let rafId = 0;
    const loop = () => {
      setCompetitors(
        buildCompetitorSnapshots(enrichedTracks, trackColors, route, currentTimeRef.current, false),
      );
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [playing, enrichedTracks, trackColors, route, currentTimeRef]);

  return competitors;
}

function buildMaxProgressMarkers(
  enrichedTracks: EnrichedFlightTrack[],
  trackColors: Record<string, string>,
  route: OptimizedRoute,
  time: Date,
  taskDistanceKm: number,
  preferences: AppPreferences,
  altitudeMin: number,
  altitudeMax: number,
): ChartMaxProgressMarker[] {
  return enrichedTracks.flatMap((track, index) => {
    const snapshot = getTrackSnapshotAtTime(track, time, route);
    if (!snapshot) return [];

    const maxProgress = getPilotMaxProgressAtTime(track, time);
    let maxTaskPercent = maxProgress?.taskPercent ?? -1;
    let maxAlt = maxProgress?.alt ?? 0;
    if (snapshot.taskPercent >= maxTaskPercent) {
      maxTaskPercent = snapshot.taskPercent;
      maxAlt = snapshot.alt;
    }
    if (maxTaskPercent <= 0) return [];

    const color = getTrackColor(track.id, trackColors, index);
    const currentTaskDistance = kmToDistanceUnit(
      (snapshot.taskPercent / 100) * taskDistanceKm,
      preferences.distanceUnit,
    );
    const currentAltitude = clampChartAltitudeDisplay(
      metersToAltitudeUnit(snapshot.alt, preferences.altitudeUnit),
      altitudeMin,
      altitudeMax,
    );
    const taskDistance = kmToDistanceUnit(
      (maxTaskPercent / 100) * taskDistanceKm,
      preferences.distanceUnit,
    );
    const altitude = clampChartAltitudeDisplay(
      metersToAltitudeUnit(maxAlt, preferences.altitudeUnit),
      altitudeMin,
      altitudeMax,
    );

    return [
      {
        id: track.id,
        color,
        landed: snapshot.landed,
        taskDistance,
        altitude,
        currentTaskDistance,
        currentAltitude,
      },
    ];
  });
}

function buildChartTrails(
  enrichedTracks: EnrichedFlightTrack[],
  trackColors: Record<string, string>,
  route: OptimizedRoute,
  time: Date,
  taskDistanceKm: number,
  preferences: AppPreferences,
  altitudeMin: number,
  altitudeMax: number,
): ChartTrail[] {
  const trailLengthM = normalizePilotTrailLengthM(preferences.pilotTrailLengthM);
  if (trailLengthM <= 0) {
    return [];
  }

  return enrichedTracks.flatMap((track, index) => {
    const snapshot = getTrackSnapshotAtTime(track, time, route);
    if (!snapshot) return [];

    const points = buildPilotChartTrailPoints(
      track,
      time,
      trailLengthM,
      route,
      taskDistanceKm,
      preferences.distanceUnit,
      preferences.altitudeUnit,
      altitudeMin,
      altitudeMax,
    );

    if (points.length < 2) return [];

    return [
      {
        id: track.id,
        color: getTrackColor(track.id, trackColors, index),
        landed: snapshot.landed,
        points,
      },
    ];
  });
}

function useLiveChartTrails({
  enrichedTracks,
  trackColors,
  route,
  currentTimeRef,
  playing,
  pausedTime,
  taskDistanceKm,
  preferences,
  altitudeMin,
  altitudeMax,
}: Pick<
  AltitudeChartProps,
  | 'enrichedTracks'
  | 'trackColors'
  | 'route'
  | 'currentTimeRef'
  | 'playing'
  | 'pausedTime'
  | 'taskDistanceKm'
  | 'preferences'
  | 'altitudeMin'
  | 'altitudeMax'
>): ChartTrail[] {
  const [trails, setTrails] = useState<ChartTrail[]>(() =>
    buildChartTrails(
      enrichedTracks,
      trackColors,
      route,
      pausedTime,
      taskDistanceKm,
      preferences,
      altitudeMin,
      altitudeMax,
    ),
  );

  useEffect(() => {
    if (playing) return;
    setTrails(
      buildChartTrails(
        enrichedTracks,
        trackColors,
        route,
        pausedTime,
        taskDistanceKm,
        preferences,
        altitudeMin,
        altitudeMax,
      ),
    );
  }, [
    enrichedTracks,
    trackColors,
    route,
    playing,
    pausedTime,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
  ]);

  useEffect(() => {
    if (!playing) return;

    let rafId = 0;
    const loop = () => {
      setTrails(
        buildChartTrails(
          enrichedTracks,
          trackColors,
          route,
          currentTimeRef.current,
          taskDistanceKm,
          preferences,
          altitudeMin,
          altitudeMax,
        ),
      );
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [
    playing,
    enrichedTracks,
    trackColors,
    route,
    currentTimeRef,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
  ]);

  return trails;
}

function useLiveMaxProgressMarkers({
  enrichedTracks,
  trackColors,
  route,
  currentTimeRef,
  playing,
  pausedTime,
  taskDistanceKm,
  preferences,
  altitudeMin,
  altitudeMax,
}: Pick<
  AltitudeChartProps,
  | 'enrichedTracks'
  | 'trackColors'
  | 'route'
  | 'currentTimeRef'
  | 'playing'
  | 'pausedTime'
  | 'taskDistanceKm'
  | 'preferences'
  | 'altitudeMin'
  | 'altitudeMax'
>): ChartMaxProgressMarker[] {
  const [markers, setMarkers] = useState<ChartMaxProgressMarker[]>(() =>
    buildMaxProgressMarkers(
      enrichedTracks,
      trackColors,
      route,
      pausedTime,
      taskDistanceKm,
      preferences,
      altitudeMin,
      altitudeMax,
    ),
  );

  useEffect(() => {
    if (playing) return;
    setMarkers(
      buildMaxProgressMarkers(
        enrichedTracks,
        trackColors,
        route,
        pausedTime,
        taskDistanceKm,
        preferences,
        altitudeMin,
        altitudeMax,
      ),
    );
  }, [
    enrichedTracks,
    trackColors,
    route,
    playing,
    pausedTime,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
  ]);

  useEffect(() => {
    if (!playing) return;

    let rafId = 0;
    const loop = () => {
      setMarkers(
        buildMaxProgressMarkers(
          enrichedTracks,
          trackColors,
          route,
          currentTimeRef.current,
          taskDistanceKm,
          preferences,
          altitudeMin,
          altitudeMax,
        ),
      );
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [
    playing,
    enrichedTracks,
    trackColors,
    route,
    currentTimeRef,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
  ]);

  return markers;
}

export const AltitudeChart = memo(function AltitudeChart({
  enrichedTracks,
  trackColors,
  route,
  currentTimeRef,
  playing,
  pausedTime,
  turnpoints,
  turnpointReachMarkers,
  taskStart,
  onTimeChange,
  altitudeMin,
  altitudeMax,
  altitudeStep,
  taskDistanceKm,
  preferences,
  taskProgressMarkerRef,
}: AltitudeChartProps) {
  const [floatingTooltip, setFloatingTooltip] = useState<{
    tooltip: string;
    x: number;
    y: number;
  } | null>(null);

  const competitors = useLiveChartCompetitors({
    enrichedTracks,
    trackColors,
    route,
    currentTimeRef,
    playing,
    pausedTime,
  });

  const trails = useLiveChartTrails({
    enrichedTracks,
    trackColors,
    route,
    currentTimeRef,
    playing,
    pausedTime,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
  });

  const maxProgressMarkers = useLiveMaxProgressMarkers({
    enrichedTracks,
    trackColors,
    route,
    currentTimeRef,
    playing,
    pausedTime,
    taskDistanceKm,
    preferences,
    altitudeMin,
    altitudeMax,
  });

  const { distance: progressDistanceDisplay, percent: progressPercent } = useLiveProgressState({
    taskProgressMarkerRef,
    playing,
    pausedTime,
    distanceUnit: preferences.distanceUnit,
  });

  const taskDistanceDisplay = kmToDistanceUnit(taskDistanceKm, preferences.distanceUnit);

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

  const leaderId = useMemo(() => {
    if (competitors.length === 0) return null;
    let leader = competitors[0];
    for (let index = 1; index < competitors.length; index += 1) {
      const candidate = competitors[index];
      if (candidate.taskKm !== leader.taskKm) {
        if (candidate.taskKm > leader.taskKm) leader = candidate;
        continue;
      }
      if (candidate.taskPercent !== leader.taskPercent) {
        if (candidate.taskPercent > leader.taskPercent) leader = candidate;
        continue;
      }
      if (candidate.pilotName.localeCompare(leader.pilotName) < 0) {
        leader = candidate;
      }
    }
    return leader.id;
  }, [competitors]);

  const points = useMemo(
    () =>
      competitors.map((c) => ({
        taskDistance: kmToDistanceUnit(c.taskKm, preferences.distanceUnit),
        altitude: clampChartAltitudeDisplay(
          metersToAltitudeUnit(c.alt, preferences.altitudeUnit),
          altitudeMin,
          altitudeMax,
        ),
        pilotName: c.pilotName,
        firstName: c.firstName,
        color: c.color,
        landed: c.landed,
        isLeader: c.id === leaderId,
      })),
    [competitors, leaderId, preferences.distanceUnit, preferences.altitudeUnit, altitudeMin, altitudeMax],
  );

  const maxProgressPoints = useMemo(
    () =>
      maxProgressMarkers.map((marker) => ({
        taskDistance: marker.taskDistance,
        altitude: marker.altitude,
        color: marker.color,
        landed: marker.landed,
      })),
    [maxProgressMarkers],
  );

  const maxProgressLinks = useMemo(
    () =>
      maxProgressMarkers
        .filter(
          (marker) =>
            Math.abs(marker.taskDistance - marker.currentTaskDistance) > 0.01 ||
            Math.abs(marker.altitude - marker.currentAltitude) > 1,
        )
        .map((marker) => ({
          id: marker.id,
          color: marker.landed ? LANDED_COLOR : marker.color,
          points: [
            {
              taskDistance: marker.currentTaskDistance,
              altitude: marker.currentAltitude,
            },
            {
              taskDistance: marker.taskDistance,
              altitude: marker.altitude,
            },
          ],
        })),
    [maxProgressMarkers],
  );

  return (
    <div className="chart-panel">
      <div className="panel-title">
        <Icon icon={LineChart} size="sm" />
        Altitude vs task distance
      </div>
      {floatingTooltip && (
        <TurnpointFloatingTooltip
          tooltip={floatingTooltip.tooltip}
          x={floatingTooltip.x}
          y={floatingTooltip.y}
        />
      )}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart margin={{ top: 28, right: 24, left: 8, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            type="number"
            dataKey="taskDistance"
            domain={[0, taskDistanceDisplay]}
            tickFormatter={(value) => `${value.toFixed(0)}`}
            label={{
              value: distanceAxisLabel(preferences.distanceUnit),
              position: 'insideBottom',
              offset: -8,
            }}
          />
          <YAxis
            type="number"
            dataKey="altitude"
            domain={[altitudeMin, altitudeMax]}
            ticks={yTicks}
            allowDataOverflow={false}
            tickFormatter={(value) => `${value}`}
            label={{
              value: altitudeAxisLabel(preferences.altitudeUnit),
              angle: -90,
              position: 'insideLeft',
            }}
          />

          {turnpoints.map((tp) => {
            const isStart = tp.number === route.sssIndex + 1;
            const isGoal = tp.number === route.goalIndex + 1;
            const reachMarker = reachMarkerByNumber.get(tp.number);
            const tagged =
              !isStart &&
              !isGoal &&
              progressPercent > 0 &&
              progressPercent >= tp.taskPercent - 0.001;
            const strokeColor = isStart
              ? START_COLOR
              : isGoal
                ? GOAL_COLOR
                : tagged
                  ? TASK_PROGRESS_LINE_COLOR
                  : '#64748b';
            const labelColor = strokeColor;
            const jumpTime = isStart ? taskStart : reachMarker?.time;
            const handleTurnpointClick =
              jumpTime !== undefined ? () => onTimeChange(jumpTime) : undefined;
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
                x={kmToDistanceUnit(tp.taskKm, preferences.distanceUnit)}
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

          {trails.map((trail) => (
            <Line
              key={`trail-${trail.id}`}
              data={trail.points}
              type="linear"
              dataKey="altitude"
              stroke={trail.landed ? LANDED_COLOR : trail.color}
              strokeWidth={2.5}
              strokeOpacity={trail.landed ? 0.55 : 0.8}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}

          {progressDistanceDisplay !== null && (
            <ReferenceLine
              x={progressDistanceDisplay}
              stroke={TASK_PROGRESS_LINE_COLOR}
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}

          {maxProgressLinks.map((link) => (
            <Line
              key={`max-progress-link-${link.id}`}
              data={link.points}
              type="linear"
              dataKey="altitude"
              stroke={link.color}
              strokeWidth={1.5}
              strokeOpacity={MAX_PROGRESS_LINK_OPACITY}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
          ))}

          <Scatter
            name="Max progress"
            data={maxProgressPoints}
            fill="#111827"
            isAnimationActive={false}
            activeShape={false}
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { color?: string; landed?: boolean };
            }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null) return <g />;
              const landed = payload?.landed ?? false;
              const fill = landed ? LANDED_COLOR : (payload?.color ?? '#111827');
              return (
                <g
                  className="chart-max-progress-marker"
                  opacity={landed ? MAX_PROGRESS_MARKER_OPACITY * 0.85 : MAX_PROGRESS_MARKER_OPACITY}
                >
                  <circle cx={cx} cy={cy} r={7} fill={fill} stroke="#ffffff" strokeWidth={2} />
                </g>
              );
            }}
          />

          <Scatter
            name="Pilots"
            data={points}
            fill="#111827"
            isAnimationActive={false}
            activeShape={false}
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { color?: string; firstName?: string; landed?: boolean; isLeader?: boolean };
            }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null) return <g />;
              const landed = payload?.landed ?? false;
              const fill = landed ? LANDED_COLOR : (payload?.color ?? '#111827');
              const isLeader = payload?.isLeader ?? false;
              const trophySize = 12;
              const labelX = cx + 10 + (isLeader ? trophySize + 2 : 0);
              return (
                <g opacity={landed ? 0.7 : 1}>
                  <circle cx={cx} cy={cy} r={7} fill={fill} stroke="#ffffff" strokeWidth={2} />
                  {isLeader && (
                    <g transform={`translate(${cx + 10}, ${cy - trophySize / 2})`}>
                      <Trophy size={trophySize} color={fill} strokeWidth={2} aria-hidden="true" />
                    </g>
                  )}
                  <text x={labelX} y={cy + 4} fill={fill} fontSize={11} fontWeight={600}>
                    {payload?.firstName ?? ''}
                  </text>
                </g>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});
