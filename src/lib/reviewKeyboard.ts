import { PLAYBACK_SPEEDS, type PlaybackSpeed } from './preferences';

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    if (type === 'range' || type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit') {
      return false;
    }
    return true;
  }
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return false;
}

export function stepPlaybackSpeed(current: PlaybackSpeed, direction: 1 | -1): PlaybackSpeed {
  const index = PLAYBACK_SPEEDS.indexOf(current);
  const baseIndex = index >= 0 ? index : PLAYBACK_SPEEDS.indexOf(50);
  const nextIndex = Math.min(PLAYBACK_SPEEDS.length - 1, Math.max(0, baseIndex + direction));
  return PLAYBACK_SPEEDS[nextIndex]!;
}

export function isReviewShortcutModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

export function isReviewBackspaceKey(event: KeyboardEvent): boolean {
  return event.key === 'Backspace' || event.code === 'Backspace';
}

export function reviewTaskStartTime(taskStart: Date | undefined, trackStart: Date): Date {
  return taskStart ?? trackStart;
}

export const REVIEW_PLAYBACK_STEP_MS = 30_000;

export function seekPlaybackByDelta(
  currentMs: number,
  deltaMs: number,
  minMs: number,
  maxMs: number,
): Date {
  const next = Math.min(maxMs, Math.max(minMs, currentMs + deltaMs));
  return new Date(next);
}

export function seekTurnpointTime(
  currentMs: number,
  seekTimesMs: number[],
  direction: -1 | 1,
): Date | null {
  if (seekTimesMs.length === 0) return null;
  const sorted = [...seekTimesMs].sort((a, b) => a - b);

  if (direction === 1) {
    const next = sorted.find((ms) => ms > currentMs);
    return new Date(next ?? sorted[sorted.length - 1]!);
  }

  const prev = [...sorted].reverse().find((ms) => ms < currentMs);
  return new Date(prev ?? sorted[0]!);
}

export function reviewStartTime(taskStart: Date | undefined, trackStart: Date): Date {
  return reviewTaskStartTime(taskStart, trackStart);
}

export function clampPlaybackTimeMs(timeMs: number, trackStart: Date, trackEnd: Date): number {
  return Math.min(trackEnd.getTime(), Math.max(trackStart.getTime(), timeMs));
}
