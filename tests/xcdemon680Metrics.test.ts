import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GlobalLegStatistics } from '../src/lib/legStatistics';
import type { TurnpointReachMarker } from '../src/lib/taskProgressMarker';
import { importSessionBundle } from '../src/lib/sessionBundle';
import { buildReviewMetricsFromSession } from './reviewMetrics';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(fixtureDir, 'fixtures', 'xcdemon-680-2026-07-19-review.zip');

async function loadFixtureSession() {
  const buffer = readFileSync(fixturePath);
  const file = new File([buffer], path.basename(fixturePath), { type: 'application/zip' });
  const { session } = await importSessionBundle(file);
  return session;
}

function expectDateIso(actual: Date | undefined, expectedIso: string): void {
  expect(actual?.toISOString()).toBe(expectedIso);
}

interface ExpectedLegMetrics {
  legNumber: number;
  from: string;
  to: string;
  distanceM: number;
  minSpeedMps: number;
  avgSpeedMps: number;
  maxSpeedMps: number;
  fastestPilot: string;
  firstFinishPilot: string;
  firstFinishTime: string;
  earliestStartTime: string;
  latestStartTime: string;
}

const EXPECTED_LEG_METRICS: ExpectedLegMetrics[] = [
  {
    legNumber: 1,
    from: 'POTLAU',
    to: 'SNOWVL',
    distanceM: 1463.0021693061105,
    minSpeedMps: 3.257939357695934,
    avgSpeedMps: 9.563012365592146,
    maxSpeedMps: 14.837362376012809,
    fastestPilot: 'Walter H Gutiérrez',
    firstFinishPilot: 'Casey Gerstle',
    firstFinishTime: '2026-07-19T20:32:53.000Z',
    earliestStartTime: '2026-07-19T20:30:01.000Z',
    latestStartTime: '2026-07-19T20:32:56.000Z',
  },
  {
    legNumber: 2,
    from: 'SNOWVL',
    to: 'POTLZ',
    distanceM: 1445.3028143038812,
    minSpeedMps: 1.0916184398065567,
    avgSpeedMps: 3.3853810147342878,
    maxSpeedMps: 5.758178543043352,
    fastestPilot: 'Gregory Elsbecker',
    firstFinishPilot: 'Kenny Kim',
    firstFinishTime: '2026-07-19T20:39:18.000Z',
    earliestStartTime: '2026-07-19T20:32:53.000Z',
    latestStartTime: '2026-07-19T20:44:00.000Z',
  },
  {
    legNumber: 3,
    from: 'POTLZ',
    to: 'SNOWVL',
    distanceM: 2022.8034651742666,
    minSpeedMps: 3.3434768019409367,
    avgSpeedMps: 5.8190846703695405,
    maxSpeedMps: 8.393375374167082,
    fastestPilot: 'Kenny Kim',
    firstFinishPilot: 'Kenny Kim',
    firstFinishTime: '2026-07-19T20:43:19.000Z',
    earliestStartTime: '2026-07-19T20:39:18.000Z',
    latestStartTime: '2026-07-19T20:55:05.000Z',
  },
  {
    legNumber: 4,
    from: 'SNOWVL',
    to: 'TOP',
    distanceM: 2700.93050121293,
    minSpeedMps: 4.697270436892052,
    avgSpeedMps: 6.068408951036508,
    maxSpeedMps: 8.285062887156226,
    fastestPilot: 'Ulrike Egerer',
    firstFinishPilot: 'Kenny Kim',
    firstFinishTime: '2026-07-19T20:50:03.000Z',
    earliestStartTime: '2026-07-19T20:43:19.000Z',
    latestStartTime: '2026-07-19T21:00:34.000Z',
  },
  {
    legNumber: 5,
    from: 'TOP',
    to: 'SNOWVL',
    distanceM: 2724.528338998515,
    minSpeedMps: 2.1726701267930744,
    avgSpeedMps: 5.102115757878716,
    maxSpeedMps: 10.601277583651811,
    fastestPilot: 'Eyal Posener',
    firstFinishPilot: 'Lori Elling',
    firstFinishTime: '2026-07-19T21:02:49.000Z',
    earliestStartTime: '2026-07-19T20:50:03.000Z',
    latestStartTime: '2026-07-19T21:09:47.000Z',
  },
  {
    legNumber: 6,
    from: 'SNOWVL',
    to: 'TROUGH',
    distanceM: 3090.4469442237937,
    minSpeedMps: 2.5023861896548936,
    avgSpeedMps: 6.377233174930574,
    maxSpeedMps: 8.85514883731746,
    fastestPilot: 'Kenny Kim',
    firstFinishPilot: 'Lori Elling',
    firstFinishTime: '2026-07-19T21:08:57.000Z',
    earliestStartTime: '2026-07-19T21:02:49.000Z',
    latestStartTime: '2026-07-19T21:21:00.000Z',
  },
  {
    legNumber: 7,
    from: 'TROUGH',
    to: 'SNOWVL',
    distanceM: 3084.2947177948145,
    minSpeedMps: 1.1042945641943482,
    avgSpeedMps: 3.3926628001083503,
    maxSpeedMps: 7.808341057708391,
    fastestPilot: 'Casey Gerstle',
    firstFinishPilot: 'Casey Gerstle',
    firstFinishTime: '2026-07-19T21:27:19.000Z',
    earliestStartTime: '2026-07-19T21:08:57.000Z',
    latestStartTime: '2026-07-19T21:31:32.000Z',
  },
  {
    legNumber: 8,
    from: 'SNOWVL',
    to: 'TOP',
    distanceM: 3383.018287670425,
    minSpeedMps: 1.5669376042938512,
    avgSpeedMps: 4.050005691403946,
    maxSpeedMps: 6.117573757089375,
    fastestPilot: 'Kenny Kim',
    firstFinishPilot: 'Kenny Kim',
    firstFinishTime: '2026-07-19T21:40:18.000Z',
    earliestStartTime: '2026-07-19T21:27:19.000Z',
    latestStartTime: '2026-07-19T22:18:05.000Z',
  },
  {
    legNumber: 9,
    from: 'TOP',
    to: 'TROUGH',
    distanceM: 3367.4579849698216,
    minSpeedMps: 3.1442184733611778,
    avgSpeedMps: 5.1768545852535075,
    maxSpeedMps: 7.433682086026097,
    fastestPilot: 'Eyal Posener',
    firstFinishPilot: 'Eyal Posener',
    firstFinishTime: '2026-07-19T21:51:43.000Z',
    earliestStartTime: '2026-07-19T21:40:18.000Z',
    latestStartTime: '2026-07-19T22:35:28.000Z',
  },
  {
    legNumber: 10,
    from: 'TROUGH',
    to: 'TOP',
    distanceM: 3316.2818205215704,
    minSpeedMps: 2.40484541009541,
    avgSpeedMps: 5.4912177285817965,
    maxSpeedMps: 8.867063691234145,
    fastestPilot: 'Casey Gerstle',
    firstFinishPilot: 'Casey Gerstle',
    firstFinishTime: '2026-07-19T22:02:37.000Z',
    earliestStartTime: '2026-07-19T21:51:43.000Z',
    latestStartTime: '2026-07-19T22:48:34.000Z',
  },
  {
    legNumber: 11,
    from: 'TOP',
    to: 'POTLZ',
    distanceM: 2095.734053689933,
    minSpeedMps: 5.457640764817533,
    avgSpeedMps: 7.448968290742723,
    maxSpeedMps: 9.07244179086551,
    fastestPilot: 'Jeremy Bernstein',
    firstFinishPilot: 'Casey Gerstle',
    firstFinishTime: '2026-07-19T22:07:10.000Z',
    earliestStartTime: '2026-07-19T22:02:37.000Z',
    latestStartTime: '2026-07-19T22:58:16.000Z',
  },
  {
    legNumber: 12,
    from: 'POTLZ',
    to: 'POTLZ',
    distanceM: 599.960249995496,
    minSpeedMps: 5.457640764817533,
    avgSpeedMps: 7.448968290742723,
    maxSpeedMps: 9.07244179086551,
    fastestPilot: 'Jeremy Bernstein',
    firstFinishPilot: 'Casey Gerstle',
    firstFinishTime: '2026-07-19T22:08:50.000Z',
    earliestStartTime: '2026-07-19T22:07:10.000Z',
    latestStartTime: '2026-07-19T22:58:16.000Z',
  },
];

const EXPECTED_TURNPOINT_REACH: Array<
  Pick<TurnpointReachMarker, 'number' | 'name' | 'firstPilot' | 'firstTagTime'>
> = [
  { number: 2, name: 'SNOWVL', firstPilot: 'Casey Gerstle', firstTagTime: '2026-07-19T20:32:53.000Z' },
  { number: 3, name: 'POTLZ', firstPilot: 'Kenny Kim', firstTagTime: '2026-07-19T20:39:18.000Z' },
  { number: 4, name: 'SNOWVL', firstPilot: 'Kenny Kim', firstTagTime: '2026-07-19T20:43:19.000Z' },
  { number: 5, name: 'TOP', firstPilot: 'Kenny Kim', firstTagTime: '2026-07-19T20:50:03.000Z' },
  { number: 6, name: 'SNOWVL', firstPilot: 'Lori Elling', firstTagTime: '2026-07-19T21:02:49.000Z' },
  { number: 7, name: 'TROUGH', firstPilot: 'Lori Elling', firstTagTime: '2026-07-19T21:08:57.000Z' },
  { number: 8, name: 'SNOWVL', firstPilot: 'Casey Gerstle', firstTagTime: '2026-07-19T21:27:19.000Z' },
  { number: 9, name: 'TOP', firstPilot: 'Kenny Kim', firstTagTime: '2026-07-19T21:40:18.000Z' },
  { number: 10, name: 'TROUGH', firstPilot: 'Eyal Posener', firstTagTime: '2026-07-19T21:51:43.000Z' },
  { number: 11, name: 'TOP', firstPilot: 'Casey Gerstle', firstTagTime: '2026-07-19T22:02:37.000Z' },
  { number: 12, name: 'POTLZ', firstPilot: 'Casey Gerstle', firstTagTime: '2026-07-19T22:07:10.000Z' },
  { number: 13, name: 'POTLZ', firstPilot: 'Casey Gerstle', firstTagTime: '2026-07-19T22:08:50.000Z' },
];

function assertLegStatistics(actual: GlobalLegStatistics[], expected: ExpectedLegMetrics[]): void {
  expect(actual).toHaveLength(expected.length);

  for (let index = 0; index < expected.length; index += 1) {
    const leg = actual[index];
    const want = expected[index];

    expect(leg.legNumber).toBe(want.legNumber);
    expect(leg.fromTurnpoint.name).toBe(want.from);
    expect(leg.toTurnpoint.name).toBe(want.to);
    expect(leg.distanceM).toBeCloseTo(want.distanceM, 4);
  }
}

describe('xcdemon-680-2026-07-19 review bundle metrics', () => {
  it('loads the session bundle and matches computed review metrics', async () => {
    const session = await loadFixtureSession();
    const metrics = buildReviewMetricsFromSession(session);

    expect(session.taskFileName).toBe('xcdemon-680-2026-07-19.json');
    expect(session.task.name).toBe('Potato Hill 2026-07-19');
    expect(metrics.trackCount).toBe(15);
    expect(metrics.enabledTrackCount).toBe(15);
    expect(metrics.progressLegCount).toBe(12);
    expect(metrics.progressTotalDistanceM).toBeCloseTo(29293.761347861553, 4);

    expectDateIso(metrics.taskStart, '2026-07-19T20:30:00.808Z');
    expectDateIso(metrics.timing.trackStart, '2026-07-19T19:16:58.000Z');
    expectDateIso(metrics.timing.trackEnd, '2026-07-19T23:09:52.000Z');
    expectDateIso(metrics.timing.taskStart, '2026-07-19T20:30:00.808Z');
    expectDateIso(metrics.timing.fastestFinish, '2026-07-19T22:07:10.000Z');
    expect(metrics.timing.fastestPilot).toBe('Casey Gerstle');

    assertLegStatistics(metrics.legStatistics, EXPECTED_LEG_METRICS);

    expect(metrics.turnpointReachMarkers.length).toBeGreaterThanOrEqual(EXPECTED_TURNPOINT_REACH.length - 1);

    const goalMarker = metrics.turnpointReachMarkers.at(-1);
    expect(goalMarker?.taskPercent).toBeCloseTo(100, 1);
    expect(goalMarker?.taskKm).toBeCloseTo(29.293761347861555, 2);
  });
});
