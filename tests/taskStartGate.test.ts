import { describe, expect, it } from 'vitest';
import { taskStartGateIncludesSeconds } from '../src/lib/xctask';

describe('taskStartGateIncludesSeconds', () => {
  it('is false for HH:MM gates and :00 seconds', () => {
    expect(taskStartGateIncludesSeconds('13:00')).toBe(false);
    expect(taskStartGateIncludesSeconds('13:00Z')).toBe(false);
    expect(taskStartGateIncludesSeconds('13:00:00')).toBe(false);
  });

  it('is true when seconds are non-zero', () => {
    expect(taskStartGateIncludesSeconds('13:00:05')).toBe(true);
  });
});
