import { describe, expect, it } from 'vitest';
import { trimLeadingZeroFixTrackPoints } from '../src/lib/geo';
import { parseIgc } from '../src/lib/igc';

describe('trimLeadingZeroFixTrackPoints', () => {
  it('drops leading null-island fixes but keeps the rest', () => {
    const points = trimLeadingZeroFixTrackPoints([
      { time: new Date('2026-07-19T12:00:00Z'), lat: 0, lon: 0, alt: 0 },
      { time: new Date('2026-07-19T12:00:01Z'), lat: 0, lon: 0, alt: 0 },
      { time: new Date('2026-07-19T12:01:00Z'), lat: 39.1, lon: -122.6, alt: 1000 },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].lat).toBeCloseTo(39.1);
  });

  it('keeps a single point when the whole track is zeros', () => {
    const only = { time: new Date('2026-07-19T12:00:00Z'), lat: 0, lon: 0, alt: 0 };
    expect(trimLeadingZeroFixTrackPoints([only])).toEqual([only]);
  });
});

describe('parseIgc zero-fix trimming', () => {
  it('trims before altitude sanitization', () => {
    const igc = `HFDTE190726
HFPLTPILOTINCHARGE:Test
B1200000000000N00000000EA00000
B1201003904539N12241107WA01000`;

    const track = parseIgc(igc, 'test.igc');
    expect(track.points).toHaveLength(1);
    expect(track.points[0].lat).toBeCloseTo(39.07565, 4);
    expect(track.points[0].lon).toBeCloseTo(-122.6851, 4);
  });
});
