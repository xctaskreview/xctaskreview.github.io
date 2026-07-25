import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime } from '../src/lib/geo';

describe('formatDuration', () => {
  it('formats sub-hour delays as MM:SS', () => {
    expect(formatDuration(122_000)).toBe('02:02');
    expect(formatDuration(5_000)).toBe('00:05');
  });

  it('formats hour-or-longer delays as HH:MM:SS', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });
});

describe('formatTime', () => {
  it('can omit seconds', () => {
    const date = new Date('2026-03-21T13:00:00-03:00');
    expect(formatTime(date, 'America/Sao_Paulo', { includeSeconds: false })).toBe('13:00');
  });
});
