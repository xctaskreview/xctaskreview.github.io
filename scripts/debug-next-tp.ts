import { readFileSync } from 'fs';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { buildOptimizedRoute, getTaskStartTime } from '../src/lib/xctask';
import {
  buildTaskNextTurnpointTimeline,
  lookupFleetNextTurnpointTarget,
  resolveNextTurnpointTarget,
  resolvePlaybackNextProgressIndex,
} from '../src/lib/nextTurnpoint';
import { computeTaskTiming } from '../src/lib/tracks';

async function main() {
  const zipPath = process.argv[2] ?? 'tests/fixtures/xcdemon-680-2026-07-19-review.zip';
  const zip = readFileSync(zipPath);
  const file = new File([zip], 'x.zip', { type: 'application/zip' });
  const { session } = await importSessionBundle(file);
  const route = buildOptimizedRoute(session.task);
  const ref = session.tracks[0]?.points[0]?.time ?? new Date();
  const taskStart = getTaskStartTime(session.task, ref)!;
  const enriched = enrichTracksWithTaskProgress(session.tracks, session.task, route, taskStart);
  const timing = computeTaskTiming(session.task, enriched);
  const fleet = buildTaskNextTurnpointTimeline(enriched, route, timing.taskStart);

  console.log('task', session.taskFileName);
  console.log('taskStart', timing.taskStart.toISOString());
  console.log('progressTurnpoints[0]', route.progressTurnpoints[0]);
  console.log(
    'fleet milestones',
    fleet.milestones.map((m) => ({ i: m.nextProgressIndex, t: new Date(m.timeMs).toISOString() })),
  );

  const nameFilter = (process.argv[3] ?? 'ruy').toLowerCase();
  for (const t of enriched.filter(
    (e) =>
      e.pilotName.toLowerCase().includes(nameFilter) ||
      e.compactName.toLowerCase().includes(nameFilter),
  )) {
    console.log('\npilot', t.compactName);
    console.log('  sssCrossTime', t.verification.sssCrossTime?.toISOString());
    console.log(
      '  milestones',
      t.nextTurnpointMilestones.map((m) => ({
        i: m.nextProgressIndex,
        t: new Date(m.timeMs).toISOString(),
      })),
    );
    const exits = t.verification.crossings.filter((c) => c.role === 'SSS' && c.direction === 'EXIT');
    console.log(
      '  sss exits',
      exits.map((e) => ({ seq: e.inSequence, t: e.time.toISOString() })),
    );
    const tp2Enter = t.verification.crossings.find(
      (c) => c.inSequence && c.role === 'TURN' && c.direction === 'ENTER',
    );
    console.log('  first TP enter', tp2Enter?.time.toISOString(), tp2Enter?.name);

    const t0 = timing.taskStart.getTime();
    for (const sec of [0, 5, 13, 23, 36, 60]) {
      const ms = t0 + sec * 1000;
      const idx = resolvePlaybackNextProgressIndex(fleet, t, ms);
      const target = idx >= 0 ? resolveNextTurnpointTarget(route, idx) : null;
      console.log(`  next at +${sec}s`, idx, target?.name, target?.number);
    }
  }

  const t0 = timing.taskStart.getTime();
  console.log('\nfleet next (no focus):');
  for (const sec of [0, 5, 13, 23, 36]) {
    const ms = t0 + sec * 1000;
    const target = lookupFleetNextTurnpointTarget(fleet, route, ms);
    console.log(`  +${sec}s`, target?.progressIndex, target?.name, target?.number);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
