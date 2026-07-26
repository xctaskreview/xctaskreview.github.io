import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPilotDisplayName } from '../src/lib/igc';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { enrichTracksWithTaskProgress } from '../src/lib/tracks';
import { computePilotTaskSpeedKmh } from '../src/lib/taskVerification';
import {
  buildOptimizedRoute,
  getTaskScoringDistanceM,
  getTaskStartTime,
} from '../src/lib/xctask';

const OFFICIAL = [
  { name: 'Eyal Posener', taskTime: '01:37:54', essLocal: '15:07:54', kmh: 18.57 },
  { name: 'Casey Gerstle', taskTime: '01:37:10', essLocal: '15:07:10', kmh: 18.71 },
  { name: 'Walter Gutierrez', taskTime: '01:39:04', essLocal: '15:09:04', kmh: 18.36 },
  { name: 'Jeremy Bernstein', taskTime: '01:54:14', essLocal: '15:24:14', kmh: 15.92 },
  { name: 'Ulrike Egerer', taskTime: '01:55:15', essLocal: '15:25:15', kmh: 15.78 },
] as const;

const OFFICIAL_TASK_DISTANCE_KM = 30.307;

function parseHms(value: string): number {
  const [h, m, s] = value.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

describe('Potato Hill 680 official speed-section times', () => {
  it('matches published task distance', async () => {
    const buf = readFileSync('tests/fixtures/xcdemon-680-2026-07-19-review.zip');
    const { session } = await importSessionBundle(
      new File([buf], 'xcdemon-680-2026-07-19-review.zip', { type: 'application/zip' }),
    );
    const route = buildOptimizedRoute(session.task);
    expect(getTaskScoringDistanceM(route) / 1000).toBeCloseTo(OFFICIAL_TASK_DISTANCE_KM, 1);
  });

  it('matches ESS, task time, and speed for top finishers', async () => {
    const buf = readFileSync('tests/fixtures/xcdemon-680-2026-07-19-review.zip');
    const { session } = await importSessionBundle(
      new File([buf], 'xcdemon-680-2026-07-19-review.zip', { type: 'application/zip' }),
    );
    const task = session.task;
    const route = buildOptimizedRoute(task);
    const scoringDistanceM = getTaskScoringDistanceM(route);
    const referenceDate = session.tracks.find((t) => t.date)?.date ?? new Date();
    const taskStart = getTaskStartTime(task, referenceDate);
    const enriched = enrichTracksWithTaskProgress(session.tracks, task, route, taskStart);
    const timeZone = 'America/Los_Angeles';

    for (const row of OFFICIAL) {
      const track = enriched.find((t) => {
        const name = extractPilotDisplayName(t).toLowerCase();
        const first = row.name.split(' ')[0]!.toLowerCase();
        const last = row.name.split(' ').slice(-1)[0]!.toLowerCase();
        return name.includes(first) && name.replace(/é/g, 'e').includes(last);
      });
      expect(track, row.name).toBeTruthy();
      const v = track!.verification;
      expect(v.essCrossTime, `${row.name} ESS`).toBeTruthy();

      const essLocal = v.essCrossTime!.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone,
      });
      expect(Math.abs(parseHms(essLocal) - parseHms(row.essLocal)), `${row.name} ES clock`).toBeLessThanOrEqual(
        1,
      );

      const officialSec = parseHms(row.taskTime);
      expect(Math.abs(v.taskTimeSeconds! - officialSec), `${row.name} task time sec`).toBeLessThanOrEqual(1);

      const speedKmh = computePilotTaskSpeedKmh(v, scoringDistanceM);
      expect(speedKmh, `${row.name} km/h`).toBeCloseTo(row.kmh, 1);
    }
  });
});
