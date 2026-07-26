import { describe, expect, it } from 'vitest';
import { glideDisplayColor, glideToneClass, GLIDE_NEUTRAL_COLOR } from '../src/lib/preferences';

describe('glideToneClass', () => {
  it('marks strong L/D as good, weak as bad, mid as neutral', () => {
    expect(glideToneClass(11)).toBe(' glide-good');
    expect(glideToneClass(6.5)).toBe(' glide-bad');
    expect(glideToneClass(8)).toBe(' glide-neutral');
    expect(glideToneClass(7)).toBe(' glide-neutral');
    expect(glideToneClass(10)).toBe(' glide-neutral');
  });

  it('uses neutral color for mid-range ratios', () => {
    expect(glideDisplayColor(8)).toBe(GLIDE_NEUTRAL_COLOR);
    expect(glideDisplayColor(12)).toBe('#059669');
    expect(glideDisplayColor(5)).toBe('#dc2626');
  });
});
