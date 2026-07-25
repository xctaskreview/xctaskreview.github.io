import { readFileSync, existsSync } from 'fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseIgc } from '../src/lib/igc';
import { computeTaskTiming, enrichTracksWithTaskProgress } from '../src/lib/tracks';
import {
  buildOptimizedRoute,
  getTaskStartTime,
  inferTaskTimeZone,
  parseXcTask,
} from '../src/lib/xctask';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);
const USER_ZIP = '/Users/eyal/Downloads/no-gps-task.zip';

describe('Japira CIVL task timezone', () => {
  it('infers America/Sao_Paulo and interprets 13:00 start as local time', () => {
    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    expect(task.timeZone).toBe('America/Sao_Paulo');
    expect(inferTaskTimeZone(task)).toBe('America/Sao_Paulo');

    const referenceDate = new Date('2026-03-21T12:00:00.000Z');
    const taskStart = getTaskStartTime(task, referenceDate);
    expect(taskStart).toBeDefined();
    expect(taskStart!.getUTCHours()).toBe(16);
    expect(taskStart!.getUTCMinutes()).toBe(0);
  });
});

describe('no-gps-task.zip timing', () => {
  it.skipIf(!existsSync(USER_ZIP))('aligns task start with pilot UTC track times', async () => {
    const zip = await JSZip.loadAsync(readFileSync(USER_ZIP));
    const taskPath = Object.keys(zip.files).find((p) => p.endsWith('.json') && p.includes('civl'));
    expect(taskPath).toBeTruthy();
    const task = parseXcTask(await zip.file(taskPath!).async('text'));
    const route = buildOptimizedRoute(task);
    const tracks = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.toLowerCase().endsWith('.igc')) continue;
      const name = path.split('/').pop() ?? path;
      tracks.push(parseIgc(await entry.async('text'), name));
    }

    const ref = tracks.find((t) => t.date)?.date ?? tracks[0].points[0].time;
    const taskStart = getTaskStartTime(task, ref)!;
    const minPilotStart = Math.min(...tracks.map((t) => t.points[0].time.getTime()));

    expect(taskStart.getUTCHours()).toBe(16);
    expect(taskStart.getTime()).toBeLessThan(minPilotStart + 60 * 60 * 1000);

    const enriched = enrichTracksWithTaskProgress(tracks, task, route, taskStart);
    const timing = computeTaskTiming(task, enriched);
    expect(timing.taskStart!.getTime()).toBe(taskStart.getTime());
  });
});
