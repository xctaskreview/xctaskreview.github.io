import { memo, useEffect, useMemo, useState, type RefObject } from 'react';
import { LineChart } from 'lucide-react';
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
import { getTrackSnapshotAtTime } from '../lib/taskProgress';
import { getTrackColor } from '../lib/tracks';
import { GOAL_COLOR, START_COLOR, TASK_PROGRESS_LINE_COLOR } from '../lib/taskMapStyle';
import type { TaskProgressMarker } from '../lib/taskProgressMarker';
import type { CompetitorSnapshot, OptimizedRoute, ProgressTurnpoint } from '../lib/types';
import { Icon } from './Icon';

interface ChartTrail {
  id: string;
  color: string;
  landed: boolean;
  points: { taskDistance: number; altitude: number }[];
}

interface AltitudeChartProps {
  enrichedTracks: EnrichedFlightTrack[];
  trackColors: Record<string, string>;
  route: OptimizedRoute;
  currentTimeRef: RefObject<Date>;
  playing: boolean;
  pausedTime: Date;
  turnpoints: ProgressTurnpoint[];
  altitudeMin: number;
  altitudeMax: number;
  altitudeStep: number;
  taskDistanceKm: number;
  preferences: AppPreferences;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
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

export const AltitudeChart = memo(function AltitudeChart({
  enrichedTracks,
  trackColors,
  route,
  currentTimeRef,
  playing,
  pausedTime,
  turnpoints,
  altitudeMin,
  altitudeMax,
  altitudeStep,
  taskDistanceKm,
  preferences,
  taskProgressMarkerRef,
}: AltitudeChartProps) {
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

  const { distance: progressDistanceDisplay, percent: progressPercent } = useLiveProgressState({
    taskProgressMarkerRef,
    playing,
    pausedTime,
    distanceUnit: preferences.distanceUnit,
  });

  const taskDistanceDisplay = kmToDistanceUnit(taskDistanceKm, preferences.distanceUnit);

  const yTicks = useMemo(
    () => buildChartAltitudeTicks(altitudeMin, altitudeMax, altitudeStep),
    [altitudeMin, altitudeMax, altitudeStep],
  );

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
      })),
    [competitors, preferences.distanceUnit, preferences.altitudeUnit, altitudeMin, altitudeMax],
  );

  return (
    <div className="chart-panel">
      <div className="panel-title">
        <Icon icon={LineChart} size="sm" />
        Altitude vs task distance
      </div>
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
                  : '#111827';
            const labelColor = isStart
              ? START_COLOR
              : isGoal
                ? GOAL_COLOR
                : tagged
                  ? TASK_PROGRESS_LINE_COLOR
                  : '#475569';
            return (
            <ReferenceLine
              key={`${tp.number}-${tp.name}`}
              x={kmToDistanceUnit(tp.taskKm, preferences.distanceUnit)}
              stroke={strokeColor}
              strokeDasharray="4 4"
              label={{
                value: `${tp.number} ${tp.name}`,
                position: 'insideTopLeft',
                fill: labelColor,
                fontSize: 11,
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

          <Scatter
            name="Pilots"
            data={points}
            fill="#111827"
            isAnimationActive={false}
            activeShape={false}
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { color?: string; firstName?: string; landed?: boolean };
            }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null) return <g />;
              const landed = payload?.landed ?? false;
              const fill = landed ? LANDED_COLOR : (payload?.color ?? '#111827');
              return (
                <g opacity={landed ? 0.7 : 1}>
                  <circle cx={cx} cy={cy} r={7} fill={fill} stroke="#ffffff" strokeWidth={2} />
                  <text x={cx + 10} y={cy + 4} fill={fill} fontSize={11} fontWeight={600}>
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
