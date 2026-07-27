import { PLAYBACK_SPEEDS, type PlaybackSpeed } from './preferences';

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
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
  return taskStart ?? trackStart;
}
