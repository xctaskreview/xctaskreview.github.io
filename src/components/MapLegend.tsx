import { useState, type ReactNode } from 'react';
import { ListTree } from 'lucide-react';
import {
  COMPLETED_LEG_OPACITY,
  COMPLETED_LEG_WEIGHT,
  DEFAULT_TURNPOINT_COLOR,
  GOAL_COLOR,
  LANDING_COLOR,
  NEXT_TURNPOINT_FILL_OPACITY,
  PROGRESS_INDICATOR_OPACITY,
  PROGRESS_INDICATOR_WEIGHT,
  ROUTE_DASH_ARRAY,
  ROUTE_LEG_COLOR,
  ROUTE_LEG_WEIGHT,
  START_COLOR,
  TASK_PROGRESS_LINE_COLOR,
  TURNPOINT_CIRCLE_WEIGHT,
  TURNPOINT_FILL_OPACITY,
} from '../lib/taskMapStyle';
import { IconButtonContent } from './Icon';

const SWATCH_SIZE = 32;
const SWATCH_CENTER = SWATCH_SIZE / 2;
const SWATCH_LINE_INSET = 4;
const SWATCH_LINE_X1 = SWATCH_LINE_INSET;
const SWATCH_LINE_X2 = SWATCH_SIZE - SWATCH_LINE_INSET;

function parseDashArray(dashArray: string): number[] {
  return dashArray.split(/\s+/).map(Number);
}

function TurnpointCircleSwatch({
  color,
  fillColor = color,
  fillOpacity = TURNPOINT_FILL_OPACITY,
  weight = TURNPOINT_CIRCLE_WEIGHT,
  showCross = false,
  dashArray,
}: {
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  showCross?: boolean;
  dashArray?: string;
}) {
  const radius = 11;
  const [dashLength, gapLength] = dashArray ? parseDashArray(dashArray) : [0, 0];

  return (
    <svg
      className="map-legend-swatch-svg"
      width={SWATCH_SIZE}
      height={SWATCH_SIZE}
      viewBox={`0 0 ${SWATCH_SIZE} ${SWATCH_SIZE}`}
      aria-hidden="true"
    >
      <circle
        cx={SWATCH_CENTER}
        cy={SWATCH_CENTER}
        r={radius}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={weight}
        strokeDasharray={dashArray ? `${dashLength} ${gapLength}` : undefined}
      />
      {showCross && (
        <>
          <line
            x1={SWATCH_CENTER}
            y1={SWATCH_CENTER - 5}
            x2={SWATCH_CENTER}
            y2={SWATCH_CENTER + 5}
            stroke={color}
            strokeWidth={1.5}
          />
          <line
            x1={SWATCH_CENTER - 5}
            y1={SWATCH_CENTER}
            x2={SWATCH_CENTER + 5}
            y2={SWATCH_CENTER}
            stroke={color}
            strokeWidth={2}
          />
        </>
      )}
    </svg>
  );
}

function RouteLineSwatch({
  color,
  weight,
  dashArray,
  opacity = 1,
  backgroundColor,
  backgroundWeight,
  backgroundOpacity,
}: {
  color: string;
  weight: number;
  dashArray?: string;
  opacity?: number;
  backgroundColor?: string;
  backgroundWeight?: number;
  backgroundOpacity?: number;
}) {
  const [dashLength, gapLength] = dashArray ? parseDashArray(dashArray) : [0, 0];

  return (
    <svg
      className="map-legend-swatch-svg"
      width={SWATCH_SIZE}
      height={SWATCH_SIZE}
      viewBox={`0 0 ${SWATCH_SIZE} ${SWATCH_SIZE}`}
      aria-hidden="true"
    >
      {backgroundColor && backgroundWeight !== undefined && (
        <line
          x1={SWATCH_LINE_X1}
          y1={SWATCH_CENTER}
          x2={SWATCH_LINE_X2}
          y2={SWATCH_CENTER}
          stroke={backgroundColor}
          strokeWidth={backgroundWeight}
          strokeOpacity={backgroundOpacity ?? 1}
          strokeLinecap="round"
        />
      )}
      <line
        x1={SWATCH_LINE_X1}
        y1={SWATCH_CENTER}
        x2={SWATCH_LINE_X2}
        y2={SWATCH_CENTER}
        stroke={color}
        strokeWidth={weight}
        strokeOpacity={opacity}
        strokeDasharray={dashArray ? `${dashLength} ${gapLength}` : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProgressIndicatorSwatch() {
  const junctionX = SWATCH_LINE_X2;
  const junctionY = SWATCH_CENTER;
  const verticalHalf = SWATCH_CENTER - SWATCH_LINE_INSET;
  const [dashLength, gapLength] = parseDashArray(ROUTE_DASH_ARRAY);

  return (
    <svg
      className="map-legend-swatch-svg"
      width={SWATCH_SIZE}
      height={SWATCH_SIZE}
      viewBox={`0 0 ${SWATCH_SIZE} ${SWATCH_SIZE}`}
      aria-hidden="true"
    >
      <line
        x1={SWATCH_LINE_X1}
        y1={junctionY}
        x2={SWATCH_LINE_X2}
        y2={junctionY}
        stroke={TASK_PROGRESS_LINE_COLOR}
        strokeWidth={COMPLETED_LEG_WEIGHT}
        strokeOpacity={COMPLETED_LEG_OPACITY}
        strokeLinecap="round"
      />
      <line
        x1={SWATCH_LINE_X1}
        y1={junctionY}
        x2={SWATCH_LINE_X2}
        y2={junctionY}
        stroke={ROUTE_LEG_COLOR}
        strokeWidth={ROUTE_LEG_WEIGHT}
        strokeDasharray={`${dashLength} ${gapLength}`}
        strokeLinecap="round"
      />
      <line
        x1={junctionX}
        y1={junctionY - verticalHalf}
        x2={junctionX}
        y2={junctionY + verticalHalf}
        stroke={TASK_PROGRESS_LINE_COLOR}
        strokeWidth={PROGRESS_INDICATOR_WEIGHT}
        strokeOpacity={PROGRESS_INDICATOR_OPACITY}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LegendItem {
  key: string;
  label: string;
  description: string;
  swatch: ReactNode;
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    key: 'start',
    label: 'Start (SSS)',
    description: 'Start cylinder',
    swatch: <TurnpointCircleSwatch color={START_COLOR} />,
  },
  {
    key: 'ess',
    label: 'ESS / Goal',
    description: 'End-of-speed-section or goal cylinder',
    swatch: <TurnpointCircleSwatch color={GOAL_COLOR} />,
  },
  {
    key: 'tp',
    label: 'Turnpoint',
    description: 'Standard turnpoint cylinder and marker',
    swatch: <TurnpointCircleSwatch color={DEFAULT_TURNPOINT_COLOR} showCross />,
  },
  {
    key: 'completed-tp',
    label: 'Completed turnpoint',
    description: 'Turnpoint already reached by the field',
    swatch: <TurnpointCircleSwatch color={TASK_PROGRESS_LINE_COLOR} showCross />,
  },
  {
    key: 'next-tp',
    label: 'Next turnpoint',
    description: 'Leader’s upcoming turnpoint',
    swatch: (
      <TurnpointCircleSwatch
        color={DEFAULT_TURNPOINT_COLOR}
        fillColor={TASK_PROGRESS_LINE_COLOR}
        fillOpacity={NEXT_TURNPOINT_FILL_OPACITY}
        showCross
      />
    ),
  },
  {
    key: 'leg',
    label: 'Planned leg',
    description: 'Planned leg between turnpoints',
    swatch: (
      <RouteLineSwatch
        color={ROUTE_LEG_COLOR}
        weight={ROUTE_LEG_WEIGHT}
        dashArray={ROUTE_DASH_ARRAY}
      />
    ),
  },
  {
    key: 'completed-leg',
    label: 'Completed leg',
    description: 'Leg that was completed',
    swatch: (
      <RouteLineSwatch
        color={ROUTE_LEG_COLOR}
        weight={ROUTE_LEG_WEIGHT}
        dashArray={ROUTE_DASH_ARRAY}
        backgroundColor={TASK_PROGRESS_LINE_COLOR}
        backgroundWeight={COMPLETED_LEG_WEIGHT}
        backgroundOpacity={COMPLETED_LEG_OPACITY}
      />
    ),
  },
  {
    key: 'progress',
    label: 'Progress indicator',
    description: "Leader's progress along leg",
    swatch: <ProgressIndicatorSwatch />,
  },
  {
    key: 'non-task-tp',
    label: 'Out-of-task turnpoint',
    description: 'Turnpoint before start or after goal',
    swatch: (
      <TurnpointCircleSwatch
        color={LANDING_COLOR}
        dashArray={ROUTE_DASH_ARRAY}
        showCross
      />
    ),
  },
];

export function MapLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className={`map-legend-overlay${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="map-legend-toggle"
        aria-expanded={open}
        aria-controls="map-legend-panel"
        onClick={() => setOpen((prev) => !prev)}
      >
        <IconButtonContent icon={ListTree}>Legend</IconButtonContent>
      </button>

      {open && (
        <div id="map-legend-panel" className="map-legend-panel" role="region" aria-label="Map legend">
          <ul className="map-legend-list">
            {LEGEND_ITEMS.map((item) => (
              <li key={item.key} className="map-legend-item">
                <div className="map-legend-swatch">{item.swatch}</div>
                <div className="map-legend-copy">
                  <span className="map-legend-label">{item.label}</span>
                  <span className="map-legend-description">{item.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
