// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseIgc } from '../src/lib/igc';
import {
  buildTaskNextTurnpointTimeline,
  isProgressTurnpointTagged,
  resolveNextTurnpointTarget,
  resolvePlaybackNextProgressIndex,
  resolvePlaybackTaggingTrack,
} from '../src/lib/nextTurnpoint';
import { getProgressIndexForCircle } from '../src/lib/taskMapStyle';
import { enrichTracksWithTaskProgress } from '../src/lib/taskProgress';
import { computeTurnpointReachTimes } from '../src/lib/taskProgressMarker';
import { buildTaskFieldTimeline, findFirstTimeFieldReachedPercent } from '../src/lib/taskTimeline';
import { computeTaskTiming } from '../src/lib/tracks';
import { parseXcdemonTaskPage } from '../src/lib/xcdemon';
import {
  buildOptimizedRoute,
  getTaskStartTime,
  getUniqueTurnpointCircles,
} from '../src/lib/xctask';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('X Red Rocks 643 Gregor Haas TP2 timing', () => {
  it('slider markers and playback tagging follow cylinder enter, not legIndex lag or field geo', async () => {
    const html = readFileSync(path.join(fixtureDir, 'x-red-rocks-643-task-snippet.html'), 'utf8');
    const task = parseXcdemonTaskPage(html, {
      location: 'X Red Rocks',
      date: '2025-09-27',
      taskId: '643',
    });
    const route = buildOptimizedRoute(task);
    const circles = getUniqueTurnpointCircles(task);

    const zipBuffer = readFileSync(path.join(fixtureDir, 'x-red-rocks-643-igcs.zip'));
    const zip = await JSZip.loadAsync(zipBuffer);
    const tracks = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => name.toLowerCase().endsWith('.igc'))
        .map(async (name) => parseIgc(await zip.file(name)!.async('string'), name)),
    );
    const referenceDate = tracks[0]?.date ?? tracks[0]?.points[0]?.time ?? new Date('2025-09-27T12:00:00Z');
    const taskStart = getTaskStartTime(task, referenceDate)!;
    const enriched = enrichTracksWithTaskProgress(tracks, task, route, taskStart);
    const timing = computeTaskTiming(task, enriched);
    const fieldTimeline = buildTaskFieldTimeline(enriched, timing.taskStart, timing.trackEnd);

    const gregor = enriched.find((t) => t.pilotName.toLowerCase().includes('gregor'));
    expect(gregor).toBeTruthy();

    const mantiEnter = gregor!.verification.crossings.find(
      (c) => c.inSequence && c.name.includes('Manti') && c.direction === 'ENTER',
    );
    expect(mantiEnter).toBeTruthy();

    const fleetTimeline = buildTaskNextTurnpointTimeline(enriched, route, taskStart);
    const fleetTp2Ms = fleetTimeline.milestones.find((m) => m.nextProgressIndex === 2)!.timeMs;

    const markers = computeTurnpointReachTimes(
      enriched,
      route,
      taskStart,
      timing.trackEnd,
      circles,
      fieldTimeline,
    );
    const tp2Marker = markers.find((m) => m.number === 2);
    expect(tp2Marker?.time.getTime()).toBe(fleetTp2Ms);

    const tp2 = route.progressTurnpoints[1]!;
    const geoReach = findFirstTimeFieldReachedPercent(fieldTimeline, tp2.taskPercent)!;
    const gregorEnterMs = mantiEnter!.time.getTime();

    const atGregorEnter = gregorEnterMs + 500;
    expect(resolvePlaybackNextProgressIndex(fleetTimeline, gregor!, atGregorEnter)).toBeGreaterThanOrEqual(2);

    if (geoReach.getTime() > gregorEnterMs + 60_000) {
      const betweenMs = gregorEnterMs + Math.floor((geoReach.getTime() - gregorEnterMs) / 2);
      expect(resolvePlaybackNextProgressIndex(fleetTimeline, gregor!, betweenMs)).toBeGreaterThanOrEqual(
        2,
      );
      expect(resolvePlaybackNextProgressIndex(fleetTimeline, null, betweenMs)).toBeLessThan(2);
    }

    const focus = resolvePlaybackTaggingTrack(enriched, null, gregor!.id);
    const npi = resolvePlaybackNextProgressIndex(fleetTimeline, focus, atGregorEnter);
    expect(npi).toBeGreaterThanOrEqual(2);
    const nextTarget = resolveNextTurnpointTarget(route, npi);
    expect(nextTarget?.number).toBe(route.progressTurnpoints[2]?.number);

    const tp2Circle = circles.find((c) => getProgressIndexForCircle(c, route) === 1);
    expect(tp2Circle).toBeTruthy();
    expect(isProgressTurnpointTagged(getProgressIndexForCircle(tp2Circle!, route), npi)).toBe(true);
  });
});
