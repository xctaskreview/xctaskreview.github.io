import { LANDED_COLOR } from './geo';
import { trophyIconHtml } from './trophyIcon';
import type { AppPreferences } from './preferences';
import {
  formatAltitudeValue,
  formatDistanceValue,
  formatGroundSpeedValue,
  formatVerticalSpeedValue,
  speedUnitLabel,
  varioToneClass,
} from './preferences';
import type { CompetitorSnapshot } from './types';
import { formatNextTurnpointDisplay } from './taskProgress';
import { metricDtHtml } from './metricIconHtml';

export interface ScoreboardEntry extends CompetitorSnapshot {
  position: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compareScoreboardCompetitors(a: CompetitorSnapshot, b: CompetitorSnapshot): number {
  if (b.taskKm !== a.taskKm) return b.taskKm - a.taskKm;
  if (b.taskPercent !== a.taskPercent) return b.taskPercent - a.taskPercent;
  return a.pilotName.localeCompare(b.pilotName);
}

type RankingFields = Pick<
  CompetitorSnapshot,
  'taskKm' | 'taskPercent' | 'pilotName' | 'speedSectionFinishMs'
>;

function hasFinishedSpeedSectionAtTime(entry: RankingFields, rankingTimeMs: number): boolean {
  return entry.speedSectionFinishMs !== null && entry.speedSectionFinishMs <= rankingTimeMs;
}

/** Finishers by ESS time (earlier first); others by task progress. */
export function compareCompetitorsForRanking(
  a: RankingFields,
  b: RankingFields,
  rankingTimeMs: number,
): number {
  const aFinished = hasFinishedSpeedSectionAtTime(a, rankingTimeMs);
  const bFinished = hasFinishedSpeedSectionAtTime(b, rankingTimeMs);

  if (aFinished && bFinished) {
    const byEss = a.speedSectionFinishMs! - b.speedSectionFinishMs!;
    if (byEss !== 0) return byEss;
    return a.pilotName.localeCompare(b.pilotName);
  }
  if (aFinished !== bFinished) return aFinished ? -1 : 1;

  return compareScoreboardCompetitors(a as CompetitorSnapshot, b as CompetitorSnapshot);
}

export function sortScoreboardEntries(
  competitors: CompetitorSnapshot[],
  rankingTimeMs: number,
): ScoreboardEntry[] {
  return [...competitors]
    .sort((a, b) => compareCompetitorsForRanking(a, b, rankingTimeMs))
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
}

/** Ranks visible pilots normally; hidden pilots follow at the bottom (no rank number). */
export function sortScoreboardEntriesForDisplay(
  competitors: CompetitorSnapshot[],
  visibleTrackIds: Set<string>,
  rankingTimeMs: number,
): ScoreboardEntry[] {
  const visible = competitors.filter((entry) => visibleTrackIds.has(entry.id));
  const hidden = competitors.filter((entry) => !visibleTrackIds.has(entry.id));

  const visibleEntries = sortScoreboardEntries(visible, rankingTimeMs);
  const hiddenEntries = [...hidden]
    .sort((a, b) => compareCompetitorsForRanking(a, b, rankingTimeMs))
    .map((entry) => ({ ...entry, position: 0 }));

  return [...visibleEntries, ...hiddenEntries];
}

/** Task distance gap to the current leader (max task km among competitors). */
export function getTaskDistanceBehindLeaderKm(
  entry: Pick<ScoreboardEntry, 'taskKm'>,
  competitors: CompetitorSnapshot[],
): number | null {
  if (competitors.length === 0) return null;
  const leaderKm = Math.max(...competitors.map((candidate) => candidate.taskKm));
  const behindKm = leaderKm - entry.taskKm;
  if (behindKm <= 0.001) return null;
  return behindKm;
}

export function getScoreboardEntryForTrack(
  trackId: string,
  competitors: CompetitorSnapshot[],
  visibleTrackIds: Set<string>,
  rankingTimeMs: number,
): ScoreboardEntry | null {
  return (
    sortScoreboardEntriesForDisplay(competitors, visibleTrackIds, rankingTimeMs).find(
      (entry) => entry.id === trackId,
    ) ?? null
  );
}

export function formatCompetitorLeaderboardPopupHtml(
  entry: ScoreboardEntry,
  preferences: AppPreferences,
): string {
  const markerColor = entry.landed ? LANDED_COLOR : entry.color;
  const distanceUnitLabel = preferences.distanceUnit === 'mi' ? 'mi' : 'km';
  const altitudeUnitLabel = preferences.altitudeUnit === 'ft' ? 'ft' : 'm';
  const speedUnit = speedUnitLabel(preferences.speedUnit);
  const varioUnitLabel = preferences.verticalSpeedUnit === 'ft/min' ? 'ft/min' : 'm/s';
  const varioClass = varioToneClass(entry.verticalSpeedMps);

  const gliderHtml = entry.gliderType
    ? `<div class="competitor-popup-glider">${escapeHtml(entry.gliderType)}</div>`
    : '';

  return (
    `<div class="competitor-popup">` +
    `<div class="competitor-popup-header">` +
    `<span class="competitor-popup-color" style="background:${markerColor}"></span>` +
    `<div>` +
    `<strong>${
      entry.position === 1
        ? `${trophyIconHtml(12)} ${escapeHtml(entry.compactName)}`
        : `#${entry.position} ${escapeHtml(entry.compactName)}`
    }</strong>` +
    gliderHtml +
    `</div>` +
    `</div>` +
    `<dl class="competitor-popup-stats">` +
    `<div>${metricDtHtml('task', `Task (${distanceUnitLabel})`)}<dd>${formatDistanceValue(entry.taskKm, preferences.distanceUnit)}` +
    `<span class="competitor-popup-muted"> (${Math.round(entry.taskPercent)}%)</span></dd></div>` +
    `<div>${metricDtHtml('alt', `Alt (${altitudeUnitLabel})`)}<dd>${formatAltitudeValue(entry.alt, preferences.altitudeUnit)}</dd></div>` +
    `<div>${metricDtHtml('speed', `Speed (${speedUnit})`)}<dd>${formatGroundSpeedValue(entry.groundSpeedMps, preferences.speedUnit)}</dd></div>` +
    `<div>${metricDtHtml('vario', `Vario (${varioUnitLabel})`)}<dd class="competitor-popup-vario${varioClass}">${formatVerticalSpeedValue(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}</dd></div>` +
    `<div>${metricDtHtml('nextTp', 'Next TP')}<dd>${escapeHtml(formatNextTurnpointDisplay(entry.nextTurnpointName, entry.nextTurnpointNumber, entry.nextTurnpointRadiusM))}</dd></div>` +
    `</dl>` +
    `</div>`
  );
}
