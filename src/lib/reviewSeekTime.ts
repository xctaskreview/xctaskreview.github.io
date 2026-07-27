import { parseLocalTimeOnDate } from './geo';

export interface ReviewSeekTimeBounds {
  taskTimeZone: string;
  referenceDate: Date;
  taskStart?: Date;
  trackStart: Date;
  trackEnd: Date;
}

export function parseElapsedDurationMs(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(trimmed)) return null;
  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((value) => !Number.isFinite(value) || value < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (seconds >= 60) return null;
    return (minutes * 60 + seconds) * 1000;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (minutes >= 60 || seconds >= 60) return null;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  return null;
}

function normalizeClockInput(input: string): string {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    return `${parts[0]!.padStart(2, '0')}:${parts[1]!.padStart(2, '0')}:00`;
  }
  if (parts.length === 3) {
    return `${parts[0]!.padStart(2, '0')}:${parts[1]!.padStart(2, '0')}:${parts[2]!.padStart(2, '0')}`;
  }
  throw new Error(`Invalid clock time: ${input}`);
}

function clampSeekTime(time: Date, trackStart: Date, trackEnd: Date): Date {
  const ms = Math.min(trackEnd.getTime(), Math.max(trackStart.getTime(), time.getTime()));
  return new Date(ms);
}

export function parseReviewClockSeekTime(
  input: string,
  bounds: ReviewSeekTimeBounds,
): { ok: true; time: Date } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a clock time.' };
  }

  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(trimmed)) {
    return { ok: false, error: 'Use clock time like 13:45 or 13:45:30.' };
  }

  try {
    const normalized = normalizeClockInput(trimmed);
    const time = clampSeekTime(
      parseLocalTimeOnDate(normalized, bounds.referenceDate, bounds.taskTimeZone),
      bounds.trackStart,
      bounds.trackEnd,
    );
    return { ok: true, time };
  } catch {
    return { ok: false, error: 'Could not resolve that clock time on the task day.' };
  }
}

export function parseReviewTimerSeekTime(
  input: string,
  bounds: ReviewSeekTimeBounds,
): { ok: true; time: Date } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter elapsed task time.' };
  }

  if (!bounds.taskStart) {
    return { ok: false, error: 'This task has no start time.' };
  }

  const body = trimmed.match(/^[te+]\s*(.+)$/i)?.[1] ?? trimmed;
  const elapsedMs = parseElapsedDurationMs(body);
  if (elapsedMs === null) {
    return { ok: false, error: 'Use elapsed format like 1:23:45 or 45:30.' };
  }

  const time = clampSeekTime(
    new Date(bounds.taskStart.getTime() + elapsedMs),
    bounds.trackStart,
    bounds.trackEnd,
  );
  return { ok: true, time };
}

/** @deprecated Use parseReviewClockSeekTime or parseReviewTimerSeekTime */
export function parseReviewSeekTime(
  input: string,
  bounds: ReviewSeekTimeBounds,
): { ok: true; time: Date } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a clock time or task elapsed time.' };
  }

  const elapsedMatch = trimmed.match(/^[te+]\s*(.+)$/i);
  if (elapsedMatch) {
    return parseReviewTimerSeekTime(elapsedMatch[1]!, bounds);
  }

  if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(trimmed)) {
    return parseReviewClockSeekTime(trimmed, bounds);
  }

  return {
    ok: false,
    error: 'Use clock time (13:45) or task elapsed (t1:23:45).',
  };
}
