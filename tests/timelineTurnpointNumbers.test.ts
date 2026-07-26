import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buildOptimizedRoute, parseXcTask } from '../src/lib/xctask';
import { computeFleetSssExitTp1Marker } from '../src/lib/taskProgressMarker';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);

describe('timeline turnpoint numbers (Japira)', () => {
  it('SSS fleet marker uses task turnpoint number 2, not hardcoded 1', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    expect(route.progressTurnpoints[0]?.number).toBe(2);

    const taskStart = new Date('2026-03-21T16:00:00.000Z');
    const exitAt = new Date(taskStart.getTime() + 30_000);
    const enriched = [
      {
        id: 'a',
        pilotName: 'Test Pilot',
        firstName: 'Test',
        fileName: 'a.igc',
        points: [
          {
            time: exitAt,
            lat: -23.75,
            lon: -50.19,
            alt: 800,
            legIndex: 0,
            hasStarted: true,
            finished: false,
            taskPercent: 1,
            timeMs: exitAt.getTime(),
            displayAlt: 800,
            cumulativeDistanceM: 0,
            maxTaskPercentSoFar: 1,
            altAtMaxTaskPercentSoFar: 800,
          },
        ],
        landingTime: exitAt,
      },
    ];

    const marker = computeFleetSssExitTp1Marker(enriched, route, taskStart, []);
    expect(marker).not.toBeNull();
    expect(marker!.number).toBe(2);
    expect(marker!.index).toBe(0);
  });
});
