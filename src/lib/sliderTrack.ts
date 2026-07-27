/** Matches `.slider-shell input[type='range']` thumb width in App.css. */
export const SLIDER_THUMB_WIDTH_PX = 16;

const SLIDER_THUMB_HALF_PX = SLIDER_THUMB_WIDTH_PX / 2;

/**
 * Maps a time on the playback range to a horizontal % that lines up with the native
 * range input thumb (thumb center, not the track edges).
 */
export function timeMsToSliderPercent(
  startMs: number,
  endMs: number,
  timeMs: number,
  trackWidthPx: number,
): number {
  if (trackWidthPx <= 0 || endMs <= startMs) return 0;
  const inset = SLIDER_THUMB_HALF_PX;
  const usable = Math.max(0, trackWidthPx - 2 * inset);
  const t = Math.min(1, Math.max(0, (timeMs - startMs) / (endMs - startMs)));
  return ((inset + t * usable) / trackWidthPx) * 100;
}

/** Linear % across the full shell width (legacy fallback when width is unknown). */
export function timeMsToLinearPercent(startMs: number, endMs: number, timeMs: number): number {
  if (endMs <= startMs) return 0;
  return Math.min(100, Math.max(0, ((timeMs - startMs) / (endMs - startMs)) * 100));
}

export function timeToSliderPercent(
  startMs: number,
  endMs: number,
  time: Date | undefined,
  trackWidthPx: number,
): number | null {
  if (!time) return null;
  if (trackWidthPx <= 0) return timeMsToLinearPercent(startMs, endMs, time.getTime());
  return timeMsToSliderPercent(startMs, endMs, time.getTime(), trackWidthPx);
}
