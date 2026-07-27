// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseXcdemonTaskPage } from '../src/lib/xcdemon';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('parseXcdemonTaskPage', () => {
  it('parses X Red Rocks legacy task with Id - Description headers', () => {
    const html = readFileSync(path.join(fixtureDir, 'x-red-rocks-643-task-snippet.html'), 'utf8');
    const task = parseXcdemonTaskPage(html, {
      location: 'X Red Rocks',
      date: '2025-07-01',
      taskId: '643',
    });

    expect(task.turnpoints).toHaveLength(3);
    expect(task.turnpoints[0].type).toBe('SSS');
    expect(task.turnpoints[0].waypoint.name).toBe('L18 - Wales LZ');
    expect(task.turnpoints[0].waypoint.lat).toBeCloseTo(39.4835, 4);
    expect(task.turnpoints[0].radius).toBe(100);
    expect(task.sss?.timeGates).toEqual(['09:55:00']);
    expect(task.turnpoints[2].waypoint.name).toBe('L19 - Nephi School');
  });
});
