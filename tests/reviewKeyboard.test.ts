// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clampPlaybackTimeMs,
  collectTurnpointSeekTimesMs,
  isEditableKeyboardTarget,
  isReviewBackspaceKey,
  isReviewLetterKey,
  isReviewShortcutModifier,
  resolveReviewKeyboardAction,
  isReviewFineTimelineSeekKey,
  isReviewHorizontalArrowKey,
  reviewHorizontalArrowDirection,
  reviewFineSeekShortcutKeysLabel,
  REVIEW_PLAYBACK_FINE_STEP_MS,
  REVIEW_PLAYBACK_STEP_MS,
  reviewTaskStartTime,
  seekPlaybackByDelta,
  seekTurnpointTime,
  shouldHandleReviewShortcut,
  stepPlaybackSpeed,
} from '../src/lib/reviewKeyboard';

const baseContext = {
  playbackSpeed: 50 as const,
  currentTimeMs: 1500,
  turnpointSeekTimesMs: [500, 1000, 2000, 3000],
  trackStartMs: 0,
  trackEndMs: 100_000,
  taskStart: new Date(500),
  trackStart: new Date(0),
  hasSelectedPilot: false,
};

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: '',
    code: '',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('clampPlaybackTimeMs', () => {
  it('clamps to track bounds', () => {
    const start = new Date(1000);
    const end = new Date(5000);
    expect(clampPlaybackTimeMs(0, start, end)).toBe(1000);
    expect(clampPlaybackTimeMs(3000, start, end)).toBe(3000);
    expect(clampPlaybackTimeMs(9000, start, end)).toBe(5000);
  });
});

describe('stepPlaybackSpeed', () => {
  it('steps through playback speeds', () => {
    expect(stepPlaybackSpeed(50, 1)).toBe(100);
    expect(stepPlaybackSpeed(50, -1)).toBe(20);
    expect(stepPlaybackSpeed(1, -1)).toBe(1);
    expect(stepPlaybackSpeed(100, 1)).toBe(100);
  });

  it('falls back to 50x when current speed is unknown', () => {
    expect(stepPlaybackSpeed(999 as 50, 1)).toBe(100);
    expect(stepPlaybackSpeed(999 as 50, -1)).toBe(20);
  });
});

describe('seekPlaybackByDelta', () => {
  it('steps within track bounds', () => {
    expect(
      seekPlaybackByDelta(10_000, REVIEW_PLAYBACK_STEP_MS, 0, 100_000).getTime(),
    ).toBe(40_000);
    expect(
      seekPlaybackByDelta(10_000, -REVIEW_PLAYBACK_STEP_MS, 0, 100_000).getTime(),
    ).toBe(0);
    expect(seekPlaybackByDelta(95_000, REVIEW_PLAYBACK_STEP_MS, 0, 100_000).getTime()).toBe(
      100_000,
    );
  });
});

describe('seekTurnpointTime', () => {
  const start = 500;
  const points = [start, 1000, 2000, 3000];

  it('returns null when there are no seek times', () => {
    expect(seekTurnpointTime(1500, [], 1)).toBeNull();
  });

  it('seeks forward to the next marker', () => {
    expect(seekTurnpointTime(1500, points, 1)?.getTime()).toBe(2000);
    expect(seekTurnpointTime(3000, points, 1)?.getTime()).toBe(3000);
    expect(seekTurnpointTime(1000, points, 1)?.getTime()).toBe(2000);
  });

  it('seeks backward to the previous marker', () => {
    expect(seekTurnpointTime(2500, points, -1)?.getTime()).toBe(2000);
    expect(seekTurnpointTime(1000, points, -1)?.getTime()).toBe(start);
    expect(seekTurnpointTime(start, points, -1)?.getTime()).toBe(start);
  });

  it('sorts unsorted seek times', () => {
    expect(seekTurnpointTime(1500, [3000, 500, 2000, 1000], 1)?.getTime()).toBe(2000);
  });
});

describe('reviewTaskStartTime', () => {
  it('uses task start when defined', () => {
    const taskStart = new Date(100);
    const trackStart = new Date(0);
    expect(reviewTaskStartTime(taskStart, trackStart)).toBe(taskStart);
  });

  it('falls back to track start', () => {
    const trackStart = new Date(42);
    expect(reviewTaskStartTime(undefined, trackStart)).toBe(trackStart);
  });
});

describe('collectTurnpointSeekTimesMs', () => {
  it('includes task start and markers, sorted and deduped', () => {
    const trackStart = new Date(0);
    const taskStart = new Date(500);
    expect(
      collectTurnpointSeekTimesMs(taskStart, trackStart, [2000, 1000, 2000, 3000]),
    ).toEqual([500, 1000, 2000, 3000]);
  });

  it('uses track start when task start is missing', () => {
    const trackStart = new Date(100);
    expect(collectTurnpointSeekTimesMs(undefined, trackStart, [300])).toEqual([100, 300]);
  });
});

describe('isEditableKeyboardTarget', () => {
  it('treats text inputs and textareas as editable', () => {
    const input = document.createElement('input');
    input.type = 'text';
    expect(isEditableKeyboardTarget(input)).toBe(true);

    const textarea = document.createElement('textarea');
    expect(isEditableKeyboardTarget(textarea)).toBe(true);
  });

  it('allows shortcuts on range and button inputs', () => {
    const range = document.createElement('input');
    range.type = 'range';
    expect(isEditableKeyboardTarget(range)).toBe(false);

    const button = document.createElement('input');
    button.type = 'button';
    expect(isEditableKeyboardTarget(button)).toBe(false);
  });

  it('rejects non-elements', () => {
    expect(isEditableKeyboardTarget(null)).toBe(false);
    expect(isEditableKeyboardTarget(document.createTextNode('x'))).toBe(false);
  });
});

describe('reviewFineSeekShortcutKeysLabel', () => {
  it('uses Option on Apple platforms and Alt elsewhere', () => {
    expect(reviewFineSeekShortcutKeysLabel('MacIntel')).toBe('Option + ← / →');
    expect(reviewFineSeekShortcutKeysLabel('Win32')).toBe('Alt + ← / →');
  });
});

describe('isReviewShortcutModifier', () => {
  it('detects ctrl, meta, and alt', () => {
    expect(isReviewShortcutModifier(keyEvent({ ctrlKey: true }))).toBe(true);
    expect(isReviewShortcutModifier(keyEvent({ metaKey: true }))).toBe(true);
    expect(isReviewShortcutModifier(keyEvent({ altKey: true }))).toBe(true);
    expect(isReviewShortcutModifier(keyEvent({ shiftKey: true }))).toBe(false);
  });

  it('does not treat Alt + ← / → as a blocked modifier chord', () => {
    expect(isReviewFineTimelineSeekKey(keyEvent({ altKey: true, key: 'ArrowRight' }))).toBe(true);
    expect(isReviewShortcutModifier(keyEvent({ altKey: true, key: 'ArrowRight' }))).toBe(false);
    expect(isReviewShortcutModifier(keyEvent({ altKey: true, key: 'f' }))).toBe(true);
  });
});

describe('shouldHandleReviewShortcut', () => {
  it('blocks editable targets and modifier chords', () => {
    const input = document.createElement('input');
    input.type = 'text';
    expect(shouldHandleReviewShortcut(input, keyEvent({ key: 'f' }))).toBe(false);
    expect(shouldHandleReviewShortcut(document.body, keyEvent({ key: 'f', ctrlKey: true }))).toBe(
      false,
    );
    expect(shouldHandleReviewShortcut(document.body, keyEvent({ key: 'f' }))).toBe(true);
    expect(shouldHandleReviewShortcut(document.body, keyEvent({ altKey: true, key: 'ArrowRight' }))).toBe(
      true,
    );
  });
});

describe('isReviewLetterKey', () => {
  it('matches case-insensitive single letters only', () => {
    expect(isReviewLetterKey(keyEvent({ key: 'f' }), 'f')).toBe(true);
    expect(isReviewLetterKey(keyEvent({ key: 'F' }), 'f')).toBe(true);
    expect(isReviewLetterKey(keyEvent({ key: 'Space' }), 'f')).toBe(false);
  });
});

describe('isReviewBackspaceKey', () => {
  it('matches Backspace key and code', () => {
    expect(isReviewBackspaceKey({ key: 'Backspace', code: 'Backspace' } as KeyboardEvent)).toBe(
      true,
    );
    expect(isReviewBackspaceKey({ key: 'ArrowLeft', code: 'Backspace' } as KeyboardEvent)).toBe(
      true,
    );
    expect(isReviewBackspaceKey({ key: 'ArrowLeft', code: 'ArrowLeft' } as KeyboardEvent)).toBe(
      false,
    );
  });
});

describe('resolveReviewKeyboardAction', () => {
  it('maps letter and symbol shortcuts', () => {
    expect(resolveReviewKeyboardAction(keyEvent({ key: 'f' }), baseContext)?.type).toBe(
      'toggle-follow',
    );
    expect(resolveReviewKeyboardAction(keyEvent({ key: '0' }), baseContext)?.type).toBe('reset-map');
    expect(resolveReviewKeyboardAction(keyEvent({ key: ' ' }), baseContext)?.type).toBe(
      'toggle-play',
    );
    const fineSeek = resolveReviewKeyboardAction(
      keyEvent({ altKey: true, key: 'ArrowRight' }),
      baseContext,
    );
    expect(fineSeek?.type).toBe('seek-time');
    if (fineSeek?.type === 'seek-time') {
      expect(fineSeek.time.getTime()).toBe(1500 + REVIEW_PLAYBACK_FINE_STEP_MS);
    }
    expect(resolveReviewKeyboardAction(keyEvent({ key: '=' }), baseContext)).toEqual({
      type: 'set-playback-speed',
      speed: 100,
    });
    expect(resolveReviewKeyboardAction(keyEvent({ key: '?' }), baseContext)?.type).toBe(
      'toggle-keymap',
    );
  });

  it('seeks playback and turnpoints with arrows', () => {
    const playback = resolveReviewKeyboardAction(keyEvent({ key: 'ArrowRight' }), baseContext);
    expect(playback?.type).toBe('seek-time');
    if (playback?.type === 'seek-time') {
      expect(playback.time.getTime()).toBe(1500 + REVIEW_PLAYBACK_STEP_MS);
    }

    const fine = resolveReviewKeyboardAction(
      keyEvent({ altKey: true, key: 'ArrowLeft' }),
      baseContext,
    );
    expect(fine?.type).toBe('seek-time');
    if (fine?.type === 'seek-time') {
      expect(fine.time.getTime()).toBe(1500 - REVIEW_PLAYBACK_FINE_STEP_MS);
    }

    const turnpoint = resolveReviewKeyboardAction(
      keyEvent({ key: 'ArrowRight', shiftKey: true }),
      baseContext,
    );
    expect(turnpoint?.type).toBe('seek-time');
    if (turnpoint?.type === 'seek-time') {
      expect(turnpoint.time.getTime()).toBe(2000);
    }
  });

  it('seeks 1s with Option/Alt + arrow using physical key code (macOS)', () => {
    const action = resolveReviewKeyboardAction(
      {
        altKey: true,
        code: 'ArrowRight',
        key: 'End',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      } as KeyboardEvent,
      baseContext,
    );
    expect(action?.type).toBe('seek-time');
    if (action?.type === 'seek-time') {
      expect(action.time.getTime()).toBe(1500 + REVIEW_PLAYBACK_FINE_STEP_MS);
      expect(action.pausePlayback).toBe(true);
    }
  });

  it('seeks 1s with Option/Alt + Home/End (macOS Option + arrow key mapping)', () => {
    const back = resolveReviewKeyboardAction(
      keyEvent({ altKey: true, code: 'Home', key: 'Home' }),
      baseContext,
    );
    expect(back?.type).toBe('seek-time');
    if (back?.type === 'seek-time') {
      expect(back.time.getTime()).toBe(500);
      expect(back.pausePlayback).toBe(true);
    }

    const forward = resolveReviewKeyboardAction(
      keyEvent({ altKey: true, code: 'End', key: 'End' }),
      baseContext,
    );
    expect(forward?.type).toBe('seek-time');
    if (forward?.type === 'seek-time') {
      expect(forward.time.getTime()).toBe(2500);
      expect(forward.pausePlayback).toBe(true);
    }
  });

  it('returns null for shift+arrow when there are no turnpoint times', () => {
    expect(
      resolveReviewKeyboardAction(keyEvent({ key: 'ArrowLeft', shiftKey: true }), {
        ...baseContext,
        turnpointSeekTimesMs: [],
      }),
    ).toBeNull();
  });

  it('clears pilot focus on Escape only when a pilot is selected', () => {
    expect(resolveReviewKeyboardAction(keyEvent({ key: 'Escape' }), baseContext)).toBeNull();
    expect(
      resolveReviewKeyboardAction(keyEvent({ key: 'Escape' }), {
        ...baseContext,
        hasSelectedPilot: true,
      })?.type,
    ).toBe('clear-pilot-focus');
  });

  it('seeks to task start on Backspace', () => {
    const action = resolveReviewKeyboardAction(
      keyEvent({ key: 'Backspace', code: 'Backspace' }),
      baseContext,
    );
    expect(action?.type).toBe('seek-time');
    if (action?.type === 'seek-time') {
      expect(action.time.getTime()).toBe(500);
    }
  });
});
