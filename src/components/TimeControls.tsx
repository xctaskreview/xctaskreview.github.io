import { useEffect, useRef, useState } from 'react';
import { formatDuration, formatTime } from '../lib/geo';
import type { TaskTiming } from '../lib/types';

const SPEEDS = [1, 2, 5, 10, 20, 50, 100];
const DISPLAY_UPDATE_INTERVAL_MS = 1000;

interface TimeControlsProps {
  currentTime: Date;
  timing: TaskTiming;
  playing: boolean;
  speed: number;
  timezone: string;
  onTimeChange: (time: Date) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
}

function markerPercent(timing: TaskTiming, markerTime?: Date): number | null {
  if (!markerTime) return null;
  const start = timing.trackStart.getTime();
  const end = timing.trackEnd.getTime();
  if (end <= start) return 0;
  return ((markerTime.getTime() - start) / (end - start)) * 100;
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
  playing,
  speed,
  timezone,
  onTimeChange,
  onPlayingChange,
  onSpeedChange,
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
    <div className="time-controls">
      <div className="time-controls-row">
        <button
          type="button"
          className="play-button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => onPlayingChange(!playing)}
        >
          <span className="play-button-icon" aria-hidden="true">
            {playing ? '⏸' : '▶'}
          </span>
        </button>

        <label className="speed-control">
          Speed
          <select value={speed} onChange={(e) => onSpeedChange(Number(e.target.value))}>
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                x{value}
              </option>
            ))}
          </select>
        </label>

        <div className="current-time-block">
          <div className="current-time-row">
            <span className="time-metric-label">Time</span>
            <span className="current-time">{formatTime(displayedTime, timezone)}</span>
          </div>
          {taskElapsed && (
            <div className="current-time-row">
              <span className="time-metric-label">Elapsed</span>
              <span className="task-elapsed">{taskElapsed}</span>
            </div>
          )}
        </div>
      </div>

      <div className="slider-shell">
        {taskStartPct !== null && (
          <button
            type="button"
            className="time-marker-hit start-marker-hit"
            style={{ left: `${taskStartPct}%` }}
            title={`Jump to task start ${formatTime(timing.taskStart!, timezone)}`}
            onClick={() => onTimeChange(timing.taskStart!)}
          >
            <span className="time-marker-label start-label">Start</span>
            <span className="time-marker task-start-marker" aria-hidden="true" />
          </button>
        )}
        {finishPct !== null && (
          <>
            <div
              className="time-marker finish-marker"
              style={{ left: `${finishPct}%` }}
              title={`Fastest finish ${fastestElapsed ?? ''}${
                timing.fastestPilot ? ` (${timing.fastestPilot})` : ''
              }${timing.fastestFinish ? ` at ${formatTime(timing.fastestFinish, timezone)}` : ''}`}
            />
            <span className="time-marker-label finish-label" style={{ left: `${finishPct}%` }}>
              Finish
            </span>
          </>
        )}

        <input
          type="range"
          min={startMs}
          max={endMs}
          value={Math.min(Math.max(currentMs, startMs), endMs)}
          onChange={(e) => onTimeChange(new Date(Number(e.target.value)))}
        />
      </div>

      <div className="time-legend">
        <span>
          <span className="time-metric-label">Time</span> {formatTime(timing.trackStart, timezone)}
        </span>
        {timing.taskStart && (
          <span>
            Task start <span className="time-metric-label">Time</span>{' '}
            {formatTime(timing.taskStart, timezone)}
          </span>
        )}
        {timing.fastestFinish && fastestElapsed && (
          <span>
            Fastest finish <span className="time-metric-label">Elapsed</span> {fastestElapsed}
            {timing.fastestPilot ? ` (${timing.fastestPilot})` : ''}
          </span>
        )}
        <span>
          <span className="time-metric-label">Time</span> {formatTime(timing.trackEnd, timezone)}
        </span>
      </div>
    </div>
  );
}
