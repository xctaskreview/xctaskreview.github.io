import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, Flag, Gauge, Pause, Play, Timer, Trophy } from 'lucide-react';
import { formatDuration, formatTime } from '../lib/geo';
import type { TurnpointReachMarker } from '../lib/taskProgressMarker';
import type { TaskTiming } from '../lib/types';
import type { AppPreferences } from '../lib/preferences';
import { PLAYBACK_SPEEDS } from '../lib/preferences';
import { formatTurnpointHoverLabel } from '../lib/turnpointTooltip';
import { AppHomeLink } from './AppHomeLink';
import { Icon, IconLabel } from './Icon';
import { TurnpointHoverTrigger } from './TurnpointHoverTooltip';

const DISPLAY_UPDATE_INTERVAL_MS = 1000;

interface TimeControlsProps {
  currentTime: Date;
  timing: TaskTiming;
  turnpointReachMarkers: TurnpointReachMarker[];
  startTurnpointTooltip?: string;
  finishTurnpointTooltip?: string;
  distanceUnit: AppPreferences['distanceUnit'];
  playing: boolean;
  speed: number;
  timezone: string;
  onTimeChange: (time: Date) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onEdit?: () => void;
  onOpenAppMenu?: () => void;
}

function markerPercent(timing: TaskTiming, markerTime?: Date): number | null {
  if (!markerTime) return null;
  const start = timing.trackStart.getTime();
  const end = timing.trackEnd.getTime();
  if (end <= start) return 0;
  return ((markerTime.getTime() - start) / (end - start)) * 100;
}

function markersOverlap(a: number | null, b: number | null, tolerancePct = 0.4): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerancePct;
}

function fastestFinishElapsed(timing: TaskTiming): string | null {
  if (!timing.fastestFinish) return null;
  const start = timing.taskStart ?? timing.trackStart;
  return formatDuration(timing.fastestFinish.getTime() - start.getTime());
}

function taskElapsedAtTime(timing: TaskTiming, currentTime: Date): string | null {
  if (!timing.taskStart) return null;
  return formatDuration(Math.max(0, currentTime.getTime() - timing.taskStart.getTime()));
}

function useThrottledTime(currentTime: Date, playing: boolean, intervalMs: number): Date {
  const [displayed, setDisplayed] = useState(currentTime);
  const lastUpdateRef = useRef(0);
  const pendingRef = useRef(currentTime);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    pendingRef.current = currentTime;

    if (!playing) {
      window.clearTimeout(timeoutRef.current);
      lastUpdateRef.current = 0;
      setDisplayed(currentTime);
      return;
    }

    const now = Date.now();
    const elapsed = lastUpdateRef.current === 0 ? intervalMs : now - lastUpdateRef.current;

    const commit = () => {
      lastUpdateRef.current = Date.now();
      setDisplayed(pendingRef.current);
    };

    if (elapsed >= intervalMs) {
      window.clearTimeout(timeoutRef.current);
      commit();
      return;
    }

    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(commit, intervalMs - elapsed);

    return () => window.clearTimeout(timeoutRef.current);
  }, [currentTime, playing, intervalMs]);

  return displayed;
}

export function TimeControls({
  currentTime,
  timing,
  turnpointReachMarkers,
  startTurnpointTooltip,
  finishTurnpointTooltip,
  distanceUnit,
  playing,
  speed,
  timezone,
  onTimeChange,
  onPlayingChange,
  onSpeedChange,
  onEdit,
  onOpenAppMenu,
}: TimeControlsProps) {
  const startMs = timing.trackStart.getTime();
  const endMs = timing.trackEnd.getTime();
  const currentMs = currentTime.getTime();
  const displayedTime = useThrottledTime(currentTime, playing, DISPLAY_UPDATE_INTERVAL_MS);
  const taskStartPct = markerPercent(timing, timing.taskStart);
  const finishPct = markerPercent(timing, timing.fastestFinish);
  const fastestElapsed = fastestFinishElapsed(timing);
  const taskElapsed = taskElapsedAtTime(timing, displayedTime);

  return (
    <div className="time-controls" data-walkthrough="time-controls">
      <div className="time-controls-row">
        <div className="time-controls-toolbar">
          {onEdit && (
            <div className="time-controls-review-nav">
              <AppHomeLink className="time-controls-home-link" iconSize="sm" onOpenMenu={onOpenAppMenu} />
            </div>
          )}
          <button
            type="button"
            className="play-button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => onPlayingChange(!playing)}
          >
            <Icon icon={playing ? Pause : Play} size="sm" />
          </button>

          <label className="speed-control">
            <Icon icon={Gauge} size="xs" />
            <select
              value={speed}
              aria-label="Playback speed"
              onChange={(e) => onSpeedChange(Number(e.target.value))}
            >
              {PLAYBACK_SPEEDS.map((value) => (
                <option key={value} value={value}>
                  x{value}
                </option>
              ))}
            </select>
          </label>

          <div className="current-time-block">
            <div className="current-time-row" aria-label="Current time">
              <span className="time-metric-label">
                <Icon icon={Clock} size="xs" />
                <span className="time-metric-label-text">Time</span>
              </span>
              <span className="current-time">{formatTime(displayedTime, timezone)}</span>
            </div>
            {taskElapsed && (
              <div className="current-time-row" aria-label="Elapsed task time">
                <span className="time-metric-label">
                  <Icon icon={Timer} size="xs" />
                  <span className="time-metric-label-text">Elapsed</span>
                </span>
                <span className="task-elapsed">{taskElapsed}</span>
              </div>
            )}
          </div>

          {onEdit && (
            <button
              type="button"
              className="time-controls-edit-button"
              aria-label="Back to task"
              data-walkthrough="back-to-task"
              onClick={onEdit}
            >
              <Icon icon={ArrowLeft} size="sm" />
            </button>
          )}
        </div>

        <div className="slider-shell">
          <div className="slider-markers">
            {taskStartPct !== null && timing.taskStart && startTurnpointTooltip && (
              <TurnpointHoverTrigger
                type="button"
                className="time-marker-column start-marker-column"
                style={{ left: `${taskStartPct}%` }}
                tooltip={startTurnpointTooltip}
                onClick={() => onTimeChange(timing.taskStart!)}
              >
                <span className="time-marker-label start-label">
                  <IconLabel icon={Flag} iconSize="xs" className="start-label-with-trailing-icon">
                    Start
                  </IconLabel>
                </span>
                <span className="time-marker task-start-marker" aria-hidden="true" />
              </TurnpointHoverTrigger>
            )}
            {turnpointReachMarkers.map((marker) => {
              const markerPct = markerPercent(timing, marker.time);
              if (markerPct === null) return null;
              if (markersOverlap(markerPct, finishPct)) return null;
              const reached = currentMs >= marker.time.getTime();

              return (
                <TurnpointHoverTrigger
                  key={`tp-${marker.index}-${marker.number}`}
                  type="button"
                  className={`time-marker-column tp-reach-marker-column${reached ? ' tp-reach-marker-column-reached' : ''}`}
                  style={{ left: `${markerPct}%` }}
                  tooltip={formatTurnpointHoverLabel(marker, {
                    distanceUnit,
                    taskStart: timing.taskStart,
                  })}
                  onClick={() => onTimeChange(marker.time)}
                >
                  <span
                    className={`time-marker-label tp-reach-label${reached ? ' tp-reach-label-reached' : ''}`}
                  >
                    {marker.number}
                  </span>
                  <span
                    className={`time-marker tp-reach-marker${reached ? ' tp-reach-marker-reached' : ''}`}
                    aria-hidden="true"
                  />
                </TurnpointHoverTrigger>
              );
            })}
            {finishPct !== null && finishTurnpointTooltip && (
              <TurnpointHoverTrigger
                as="div"
                className="time-marker-column finish-marker-column"
                style={{ left: `${finishPct}%` }}
                tooltip={finishTurnpointTooltip}
              >
                <span className="time-marker-label finish-label finish-marker-top-label">
                  <IconLabel icon={Trophy} iconSize="xs">
                    Fastest
                  </IconLabel>
                </span>
                <span className="time-marker finish-marker" aria-hidden="true" />
              </TurnpointHoverTrigger>
            )}
          </div>

          <input
            type="range"
            min={startMs}
            max={endMs}
            value={Math.min(Math.max(currentMs, startMs), endMs)}
            onChange={(e) => onTimeChange(new Date(Number(e.target.value)))}
          />

          <div className="slider-times">
            <span className="slider-edge-tick slider-edge-tick-start" aria-hidden="true" />
            <span className="slider-edge-tick slider-edge-tick-end" aria-hidden="true" />
            <span className="slider-edge-time slider-edge-time-start">
              {formatTime(timing.trackStart, timezone, { includeSeconds: false })}
            </span>
            {taskStartPct !== null && timing.taskStart && (
              <span className="slider-marker-time start-marker-time" style={{ left: `${taskStartPct}%` }}>
                {formatTime(timing.taskStart, timezone, {
                  includeSeconds: timing.taskStartIncludesSeconds ?? true,
                })}
              </span>
            )}
            {finishPct !== null && fastestElapsed && (
              <span
                className={`slider-marker-time finish-marker-time${finishPct >= 85 ? ' finish-marker-time-near-end' : ''}`}
                style={{ left: `${finishPct}%` }}
              >
                <span>{`Elapsed ${fastestElapsed}`}</span>
                {timing.fastestPilot && <span className="finish-pilot">{timing.fastestPilot}</span>}
              </span>
            )}
            <span className="slider-edge-time slider-edge-time-end">
              {formatTime(timing.trackEnd, timezone, { includeSeconds: false })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
