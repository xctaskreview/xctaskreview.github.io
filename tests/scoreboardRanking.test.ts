import { describe, expect, it } from 'vitest';
import { compareCompetitorsForRanking, sortScoreboardEntries } from '../src/lib/scoreboardDisplay';
import type { CompetitorSnapshot } from '../src/lib/types';

function competitor(
  id: string,
  taskKm: number,
  speedSectionFinishMs: number | null,
): CompetitorSnapshot {
  return {
    id,
    pilotName: id,
    firstName: id,
    lat: 0,
    lon: 0,
    alt: 1500,
    taskPercent: taskKm * 10,
    taskKm,
    color: '#000',
    landed: false,
    groundSpeedMps: 0,
    verticalSpeedMps: 0,
    nextTurnpointName: '',
    nextTurnpointNumber: null,
    nextTurnpointRadiusM: null,
    speedSectionFinishMs,
    flyingMode: 'glide',
    thermalGainM: 0,
    circlingDurationSec: 0,
    glideDurationSec: 0,
    averageThermalVarioMps: 0,
    glideRatio: null,
    averageGlideRatio: null,
    glideDistanceM: 0,
    glideSpeedMps: 0,
  };
}

describe('compareCompetitorsForRanking', () => {
  it('ranks finishers by ESS time even when a later finisher has more task km on the goal leg', () => {
    const rankingTimeMs = 5000;
    const fastEss = competitor('fast', 30, 1000);
    const slowEss = competitor('slow', 30.5, 2000);

    expect(compareCompetitorsForRanking(fastEss, slowEss, rankingTimeMs)).toBeLessThan(0);

    const entries = sortScoreboardEntries([slowEss, fastEss], rankingTimeMs);
    expect(entries[0]!.id).toBe('fast');
    expect(entries[1]!.id).toBe('slow');
  });

  it('ranks pilots still racing by task km ahead of finishers not yet reached at playback time', () => {
    const rankingTimeMs = 1500;
    const finished = competitor('finished', 29, 1000);
    const racing = competitor('racing', 28, 2000);

    expect(compareCompetitorsForRanking(finished, racing, rankingTimeMs)).toBeLessThan(0);
    expect(compareCompetitorsForRanking(racing, finished, rankingTimeMs)).toBeGreaterThan(0);
  });

  it('keeps ESS order unchanged when scrubbing after both have crossed', () => {
    const early = competitor('early', 30, 1000);
    const late = competitor('late', 30.2, 2000);

    const atEss = sortScoreboardEntries([late, early], 2500);
    const afterGoal = sortScoreboardEntries([late, early], 50_000);

    expect(atEss.map((e) => e.id)).toEqual(['early', 'late']);
    expect(afterGoal.map((e) => e.id)).toEqual(['early', 'late']);
  });
});
