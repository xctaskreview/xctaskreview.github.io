import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseIgc } from '../src/lib/igc';
import { enrichTrackWithTaskProgress } from '../src/lib/taskProgress';
import { buildOptimizedRoute, getTaskStartTime, parseXcTask } from '../src/lib/xctask';

const JAPIRA_FIXTURE = new URL('./fixtures/japira-2026-03-21.json', import.meta.url);
const TRACKS_DIR = new URL('../tmp/civl-japira/tracks/', import.meta.url);

describe('Japira fleet started state', () => {
  it('pilots with in-sequence SSS exit show as started after the gate', () => {
    const dirPath = fileURLToPath(TRACKS_DIR);
    if (!existsSync(dirPath)) return;

    const task = parseXcTask(readFileSync(JAPIRA_FIXTURE, 'utf8'));
    const route = buildOptimizedRoute(task);
    const taskStart = getTaskStartTime(task, new Date('2026-03-21T12:00:00.000Z'))!;
    const taskStartMs = taskStart.getTime();

    const notStarted: string[] = [];
    for (const file of readdirSync(dirPath).filter((f) => /\.igc$/i.test(f))) {
      const track = parseIgc(readFileSync(join(dirPath, file), 'utf8'), file);
      const enriched = enrichTrackWithTaskProgress(track, task, route, taskStart);
      const last = enriched.points.at(-1);
      const inSeqSss = enriched.verification.crossings.some(
        (c) => c.role === 'SSS' && c.inSequence,
      );
      if (inSeqSss && !last?.hasStarted) {
        notStarted.push(file);
      }
      if (inSeqSss && enriched.verification.earlyStart) {
        const afterGate = enriched.points.find((p) => p.timeMs >= taskStartMs);
        expect(afterGate?.hasStarted).toBe(true);
      }
    }

    expect(notStarted).toEqual([]);
  });
});
