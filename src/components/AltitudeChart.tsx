import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from 'recharts';
import { clampChartAltitudeDisplay, LANDED_COLOR } from '../lib/geo';
import type { AppPreferences } from '../lib/preferences';
import {
  altitudeAxisLabel,
  distanceAxisLabel,
  kmToDistanceUnit,
  metersToAltitudeUnit,
} from '../lib/preferences';
import type { CompetitorSnapshot, ProgressTurnpoint } from '../lib/types';

interface AltitudeChartProps {
  competitors: CompetitorSnapshot[];
  turnpoints: ProgressTurnpoint[];
  altitudeMin: number;
  altitudeMax: number;
  taskDistanceKm: number;
  preferences: AppPreferences;
}

export function AltitudeChart({
  competitors,
  turnpoints,
  altitudeMin,
  altitudeMax,
  taskDistanceKm,
  preferences,
}: AltitudeChartProps) {
  const taskDistanceDisplay = kmToDistanceUnit(taskDistanceKm, preferences.distanceUnit);

  const points = competitors.map((c) => ({
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
  }));

  return (
    <div className="chart-panel">
      <div className="panel-title">Altitude vs task distance</div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 28, right: 24, left: 8, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
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
            allowDataOverflow={false}
            label={{
              value: altitudeAxisLabel(preferences.altitudeUnit),
              angle: -90,
              position: 'insideLeft',
            }}
          />

          {turnpoints.map((tp) => (
            <ReferenceLine
              key={`${tp.number}-${tp.name}`}
              x={kmToDistanceUnit(tp.taskKm, preferences.distanceUnit)}
              stroke="#111827"
              strokeDasharray="4 4"
              label={{
                value: `${tp.number} ${tp.name}`,
                position: 'insideTopLeft',
                fill: '#475569',
                fontSize: 11,
              }}
            />
          ))}

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
                  <circle
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <text
                    x={cx + 10}
                    y={cy + 4}
                    fill={fill}
                    fontSize={11}
                    fontWeight={600}
                  >
                    {payload?.firstName ?? ''}
                  </text>
                </g>
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
