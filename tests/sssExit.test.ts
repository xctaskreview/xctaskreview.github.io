import { readFileSync, existsSync } from 'fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseIgc } from '../src/lib/igc';
import { enrichTracksWithTaskProgress, getPilotSssCrossDelaySec } from '../src/lib/taskProgress';
import {
  computeFleetSssExitTp1Marker,
  SSS_EXIT_TP1_MIN_DELAY_MS,
} from '../src/lib/taskProgressMarker';
import { buildOptimizedRoute, getTaskStartTime, parseXcTask } from '../src/lib/xctask';
import { getUniqueTurnpointCircles } from '../src/lib/xctask';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);
const USER_ZIP = '/Users/eyal/Downloads/no-gps-task.zip';

describe('SSS exit timing', () => {
  it('computes per-pilot delay and fleet TP1 marker for Japira fixture zip', async () => {
    if (!existsSync(USER_ZIP)) return;

    const zip = await JSZip.loadAsync(readFileSync(USER_ZIP));
    const taskPath = Object.keys(zip.files).find((p) => p.endsWith('.json') && p.includes('civl'));
    const task = parseXcTask(await zip.file(taskPath!).async('text'));
    const route = buildOptimizedRoute(task);
    const circles = getUniqueTurnpointCircles(task);
    const tracks = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.toLowerCase().endsWith('.igc')) continue;
      tracks.push(parseIgc(await entry.async('text'), path.split('/').pop()!));
    }
    const ref = tracks.find((t) => t.date)?.date ?? tracks[0].points[0].time;
    const taskStart = getTaskStartTime(task, ref)!;
    const enriched = enrichTracksWithTaskProgress(tracks, task, route, taskStart);

    const marker = computeFleetSssExitTp1Marker(enriched, route, taskStart, circles);
    expect(marker).not.toBeNull();
    expect(marker!.number).toBe(route.progressTurnpoints[0]?.number ?? 1);
    expect(marker!.index).toBe(0);
    expect(marker!.time.getTime() - taskStart.getTime()).toBeGreaterThan(SSS_EXIT_TP1_MIN_DELAY_MS);

    const wilson = enriched.find((t) => t.pilotName.toLowerCase().includes('wilson'));
    expect(wilson).toBeTruthy();
    expect(getPilotSssCrossDelaySec(wilson!, taskStart)).toBe(-885);
  });

  it('hides TP1 marker when fleet exits within 10s of gate', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const circles = getUniqueTurnpointCircles(task);
    const taskStart = new Date('2026-03-21T16:00:00.000Z');
    const exitAt = new Date(taskStart.getTime() + 5_000);

    const enriched = [
      {
        id: 'a',
        pilotName: 'Test',
        firstName: 'Test',
        compactName: 'Test',
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

    expect(computeFleetSssExitTp1Marker(enriched, route, taskStart, circles)).toBeNull();
  });
});
