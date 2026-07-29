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

type ReviewShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
> &
  Partial<Pick<KeyboardEvent, 'getModifierState'>>;

export const REVIEW_PLAYBACK_FINE_STEP_MS = 1_000;

function reviewAltModifierActive(event: ReviewShortcutKeyEvent): boolean {
  if (event.altKey) return true;
  return event.getModifierState?.('Alt') === true;
}

/** Arrow keys are identified by `code` so Option/Alt modifiers on macOS still match. */
export function isReviewHorizontalArrowKey(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') return true;
  return event.key === 'ArrowLeft' || event.key === 'ArrowRight';
}

export function reviewHorizontalArrowDirection(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): -1 | 1 {
  if (event.code === 'ArrowRight' || event.key === 'ArrowRight') return 1;
  return -1;
}

export function isReviewHomeEndKey(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return event.code === 'Home' || event.code === 'End' || event.key === 'Home' || event.key === 'End';
}

/** Plain arrows, or Option/Alt + Home/End (common macOS mapping for Option + ← / →). */
export function isReviewTimelineArrowSeekEvent(event: ReviewShortcutKeyEvent): boolean {
  if (isReviewHorizontalArrowKey(event)) return true;
  if (!reviewAltModifierActive(event)) return false;
  return isReviewHomeEndKey(event);
}

export function reviewTimelineSeekDirectionFromKey(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): -1 | 1 | null {
  if (isReviewHorizontalArrowKey(event)) return reviewHorizontalArrowDirection(event);
  if (event.code === 'End' || event.key === 'End') return 1;
  if (event.code === 'Home' || event.key === 'Home') return -1;
  return null;
}

/** KeyboardEvent.altKey — labeled Option on macOS, Alt on Windows/Linux. */
export function reviewFineSeekShortcutKeysLabel(
  platform: string | undefined =
    typeof navigator !== 'undefined' ? navigator.platform : undefined,
): string {
  const isApple =
    platform !== undefined && /Mac|iPhone|iPad|iPod/i.test(platform);
  const modifier = isApple ? 'Option' : 'Alt';
  return `${modifier} + ← / →`;
}

export function isReviewFineTimelineSeekKey(event: ReviewShortcutKeyEvent): boolean {
  if (!reviewAltModifierActive(event) || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  if (isReviewHorizontalArrowKey(event)) return true;
  return isReviewHomeEndKey(event);
}

export function isReviewShortcutModifier(event: ReviewShortcutKeyEvent): boolean {
  if (isReviewFineTimelineSeekKey(event)) return false;
  return event.ctrlKey || event.metaKey || reviewAltModifierActive(event);
}

export function shouldHandleReviewShortcut(
  target: EventTarget | null,
  event: ReviewShortcutKeyEvent,
): boolean {
  if (isEditableKeyboardTarget(target)) return false;
  if (isReviewShortcutModifier(event)) return false;
  return true;
}

export function isReviewLetterKey(event: Pick<KeyboardEvent, 'key'>, letter: string): boolean {
  if (event.key.length !== 1) return false;
  return event.key.toLowerCase() === letter.toLowerCase();
}

export function isReviewBackspaceKey(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
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

export function collectTurnpointSeekTimesMs(
  taskStart: Date | undefined,
  trackStart: Date,
  markerTimesMs: Iterable<number>,
): number[] {
  const times = new Set<number>();
  times.add(reviewTaskStartTime(taskStart, trackStart).getTime());
  for (const ms of markerTimesMs) {
    times.add(ms);
  }
  return [...times].sort((a, b) => a - b);
}

export function clampPlaybackTimeMs(timeMs: number, trackStart: Date, trackEnd: Date): number {
  return Math.min(trackEnd.getTime(), Math.max(trackStart.getTime(), timeMs));
}

export interface ReviewKeyboardContext {
  playbackSpeed: PlaybackSpeed;
  currentTimeMs: number;
  turnpointSeekTimesMs: number[];
  trackStartMs: number;
  trackEndMs: number;
  taskStart: Date | undefined;
  trackStart: Date;
  hasSelectedPilot: boolean;
}

export type ReviewKeyboardAction =
  | { type: 'toggle-follow' }
  | { type: 'reset-map' }
  | { type: 'toggle-play' }
  | { type: 'set-playback-speed'; speed: PlaybackSpeed }
  | { type: 'toggle-leaderboard' }
  | { type: 'open-pilot-search' }
  | { type: 'toggle-keymap' }
  | { type: 'seek-clock' }
  | { type: 'seek-timer' }
  | { type: 'seek-time'; time: Date; pausePlayback?: boolean }
  | { type: 'clear-pilot-focus' };

export function resolveReviewKeyboardAction(
  event: ReviewShortcutKeyEvent,
  context: ReviewKeyboardContext,
): ReviewKeyboardAction | null {
  if (isReviewLetterKey(event, 'f')) return { type: 'toggle-follow' };
  if (event.key === '0') return { type: 'reset-map' };
  if (event.key === ' ') return { type: 'toggle-play' };

  if (event.key === '+' || event.key === '=') {
    return { type: 'set-playback-speed', speed: stepPlaybackSpeed(context.playbackSpeed, 1) };
  }
  if (event.key === '-' || event.key === '_') {
    return { type: 'set-playback-speed', speed: stepPlaybackSpeed(context.playbackSpeed, -1) };
  }

  if (isReviewLetterKey(event, 'l')) return { type: 'toggle-leaderboard' };
  if (event.key === '/') return { type: 'open-pilot-search' };
  if (event.key === '?') return { type: 'toggle-keymap' };
  if (isReviewLetterKey(event, 'c')) return { type: 'seek-clock' };
  if (isReviewLetterKey(event, 't')) return { type: 'seek-timer' };

  if (isReviewBackspaceKey(event)) {
    return {
      type: 'seek-time',
      time: reviewTaskStartTime(context.taskStart, context.trackStart),
    };
  }

  if (isReviewTimelineArrowSeekEvent(event)) {
    const direction = reviewTimelineSeekDirectionFromKey(event);
    if (direction === null) return null;
    if (event.shiftKey) {
      const nextTime = seekTurnpointTime(
        context.currentTimeMs,
        context.turnpointSeekTimesMs,
        direction,
      );
      if (!nextTime) return null;
      return { type: 'seek-time', time: nextTime };
    }
    const fineSeek = isReviewFineTimelineSeekKey(event);
    const stepMs = fineSeek ? REVIEW_PLAYBACK_FINE_STEP_MS : REVIEW_PLAYBACK_STEP_MS;
    return {
      type: 'seek-time',
      time: seekPlaybackByDelta(
        context.currentTimeMs,
        direction * stepMs,
        context.trackStartMs,
        context.trackEndMs,
      ),
      pausePlayback: fineSeek,
    };
  }

  if (event.key === 'Escape' && context.hasSelectedPilot) {
    return { type: 'clear-pilot-focus' };
  }

  return null;
}
