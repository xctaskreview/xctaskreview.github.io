import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronDown, ChevronUp, GripHorizontal, LineChart } from 'lucide-react';
import { AltitudeChart, type AltitudeChartProps } from './AltitudeChart';
import { Icon } from './Icon';

const MIN_CHART_HEIGHT = 120;

function getMaxChartHeight(): number {
  return Math.max(MIN_CHART_HEIGHT + 40, Math.min(560, Math.round(window.innerHeight * 0.55)));
}

function clampChartHeight(height: number): number {
  return Math.min(getMaxChartHeight(), Math.max(MIN_CHART_HEIGHT, Math.round(height)));
}

interface TaskProgressPanelProps extends AltitudeChartProps {
  mobileOpen: boolean;
  minimized: boolean;
  onToggleMinimized: () => void;
  onHeightPreview?: (height: number) => void;
}

export function TaskProgressPanel({
  mobileOpen,
  minimized,
  onToggleMinimized,
  onHeightPreview,
  preferences,
  ...chartProps
}: TaskProgressPanelProps) {
  const [panelHeight, setPanelHeight] = useState(() => defaultTaskProgressHeight());
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const title = `Task Progress (alt [${preferences.altitudeUnit}] vs. dist [${preferences.distanceUnit}])`;

  useEffect(() => {
    if (!minimized) {
      onHeightPreview?.(panelHeight);
    }
  }, [minimized, onHeightPreview, panelHeight]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (minimized) return;
      event.preventDefault();
      const handle = event.currentTarget;
      resizeRef.current = { startY: event.clientY, startHeight: panelHeight };
      setIsResizing(true);
      handle.setPointerCapture(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const start = resizeRef.current;
        if (!start) return;
        const delta = start.startY - moveEvent.clientY;
        const nextHeight = clampChartHeight(start.startHeight + delta);
        setPanelHeight(nextHeight);
        onHeightPreview?.(nextHeight);
      };

      const endResize = (upEvent: PointerEvent) => {
        resizeRef.current = null;
        setIsResizing(false);
        if (handle.hasPointerCapture(upEvent.pointerId)) {
          handle.releasePointerCapture(upEvent.pointerId);
        }
        handle.removeEventListener('pointermove', handlePointerMove);
        handle.removeEventListener('pointerup', endResize);
        handle.removeEventListener('pointercancel', endResize);
      };

      handle.addEventListener('pointermove', handlePointerMove);
      handle.addEventListener('pointerup', endResize);
      handle.addEventListener('pointercancel', endResize);
    },
    [minimized, onHeightPreview, panelHeight],
  );

  return (
    <div
      id="review-altitude-chart"
      className={`review-chart-slot${mobileOpen ? ' open' : ''}${minimized ? ' minimized' : ''}`}
      style={
        minimized
          ? undefined
          : {
              height: panelHeight,
            }
      }
    >
      <div className={`chart-panel${minimized ? ' minimized' : ''}`}>
        <div className="chart-panel-header">
          <div className="chart-panel-title map-data-panel-toggle-text">
            <Icon icon={LineChart} size="sm" />
            <span className="chart-panel-title-text">{title}</span>
          </div>
          <div className="chart-panel-header-actions">
            <button
              type="button"
              className="chart-panel-icon-button"
              aria-expanded={!minimized}
              aria-label={minimized ? 'Restore task progress graph' : 'Minimize task progress graph'}
              onClick={onToggleMinimized}
            >
              <Icon icon={minimized ? ChevronUp : ChevronDown} size="sm" />
            </button>
            <button
              type="button"
              className="chart-panel-resize-handle"
              aria-label="Resize task progress graph"
              disabled={minimized}
              onPointerDown={handleResizePointerDown}
            >
              <Icon icon={GripHorizontal} size="sm" />
            </button>
          </div>
        </div>
        {!minimized && (
          <div className="chart-panel-body">
            <AltitudeChart {...chartProps} preferences={preferences} suspendLiveUpdates={isResizing} />
          </div>
        )}
      </div>
    </div>
  );
}

export function defaultTaskProgressHeight(): number {
  return clampChartHeight(Math.min(268, Math.round(window.innerHeight * 0.32)));
}
