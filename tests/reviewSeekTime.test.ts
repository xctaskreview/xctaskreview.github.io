import { describe, expect, it } from 'vitest';
import { parseElapsedDurationMs, parseReviewClockSeekTime, parseReviewTimerSeekTime } from '../src/lib/reviewSeekTime';

describe('parseElapsedDurationMs', () => {
  it('parses mm:ss and hh:mm:ss', () => {
    expect(parseElapsedDurationMs('45:30')).toBe((45 * 60 + 30) * 1000);
    expect(parseElapsedDurationMs('1:23:45')).toBe((3600 + 23 * 60 + 45) * 1000);
  });
});

describe('parseReviewTimerSeekTime', () => {
  const trackStart = new Date('2024-07-15T10:00:00.000Z');
  const trackEnd = new Date('2024-07-15T18:00:00.000Z');
  const taskStart = new Date('2024-07-15T11:00:00.000Z');
  const referenceDate = trackStart;

  it('seeks by task elapsed', () => {
    const result = parseReviewTimerSeekTime('1:00:00', {
      taskTimeZone: 'UTC',
      referenceDate,
      taskStart,
      trackStart,
      trackEnd,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.time.toISOString()).toBe('2024-07-15T12:00:00.000Z');
    }
  });
});

describe('parseReviewClockSeekTime', () => {
  const trackStart = new Date('2024-07-15T10:00:00.000Z');
  const trackEnd = new Date('2024-07-15T18:00:00.000Z');
  const taskStart = new Date('2024-07-15T11:00:00.000Z');
  const referenceDate = trackStart;

  it('seeks by clock time in UTC', () => {
    const result = parseReviewClockSeekTime('12:30', {
      taskTimeZone: 'UTC',
      referenceDate,
      taskStart,
      trackStart,
      trackEnd,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.time.getUTCHours()).toBe(12);
      expect(result.time.getUTCMinutes()).toBe(30);
    }
  });

  it('clamps to track bounds', () => {
    const result = parseReviewClockSeekTime('09:00', {
      taskTimeZone: 'UTC',
      referenceDate,
      taskStart,
      trackStart,
      trackEnd,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.time.toISOString()).toBe(trackStart.toISOString());
    }
  });
});
