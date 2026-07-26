import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  lookupPilotNextTurnpointTarget,
  resolveMapNextTurnpointCircle,
} from '../src/lib/nextTurnpoint';
import { enrichTracksWithTaskProgress } from '../src/lib/taskProgress';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { buildOptimizedRoute, getTaskStartTime, getUniqueTurnpointCircles } from '../src/lib/xctask';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'xcdemon-680-2026-07-19-review.zip',
);

describe('duplicate turnpoint cylinders', () => {
  it('resolves next TP 6 SNOWVL to the shared circle after Kenny tags TP 5', async () => {
    const buffer = readFileSync(fixturePath);
    const file = new File([buffer], path.basename(fixturePath), { type: 'application/zip' });
    const { session } = await importSessionBundle(file);
    const route = buildOptimizedRoute(session.task);
    const circles = getUniqueTurnpointCircles(session.task);
    const ref = session.tracks[0]?.points[0]?.time ?? new Date();
    const taskStart = getTaskStartTime(session.task, ref)!;
    const enriched = enrichTracksWithTaskProgress(session.tracks, session.task, route, taskStart);
    const kenny = enriched.find((t) => t.pilotName.includes('Kenny'));
    expect(kenny).toBeTruthy();

    const snowvlCircles = circles.filter((c) => c.name === 'SNOWVL');
    expect(snowvlCircles.length).toBeGreaterThan(0);

    const afterTp5Ms = new Date('2026-07-19T20:51:00.000Z').getTime();
    const target = lookupPilotNextTurnpointTarget(
      kenny!.nextTurnpointMilestones,
      route,
      kenny!.taskStartMs!,
      afterTp5Ms,
    );
    expect(target?.number).toBe(6);
    expect(target?.name).toBe('SNOWVL');

    const mapCircle = resolveMapNextTurnpointCircle(route, circles, target);
    expect(mapCircle).toBeDefined();
    expect(mapCircle?.name).toBe('SNOWVL');
    expect(mapCircle?.radius).toBe(target?.radiusM);
  });
});
