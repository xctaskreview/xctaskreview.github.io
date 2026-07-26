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

export function sortScoreboardEntries(competitors: CompetitorSnapshot[]): ScoreboardEntry[] {
  return [...competitors]
    .sort(compareScoreboardCompetitors)
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
}

/** Ranks visible pilots normally; hidden pilots follow at the bottom (no rank number). */
export function sortScoreboardEntriesForDisplay(
  competitors: CompetitorSnapshot[],
  visibleTrackIds: Set<string>,
): ScoreboardEntry[] {
  const visible = competitors.filter((entry) => visibleTrackIds.has(entry.id));
  const hidden = competitors.filter((entry) => !visibleTrackIds.has(entry.id));

  const visibleEntries = sortScoreboardEntries(visible);
  const hiddenEntries = [...hidden]
    .sort(compareScoreboardCompetitors)
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
  leadPercentages: Map<string, number>,
  visibleTrackIds: Set<string>,
): ScoreboardEntry | null {
  const withLead = competitors.map((entry) => ({
    ...entry,
    leadPercent: leadPercentages.get(entry.id) ?? 0,
  }));
  return sortScoreboardEntriesForDisplay(withLead, visibleTrackIds).find((entry) => entry.id === trackId) ?? null;
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
        ? `${trophyIconHtml(12)} ${escapeHtml(entry.pilotName)}`
        : `#${entry.position} ${escapeHtml(entry.pilotName)}`
    }</strong>` +
    gliderHtml +
    `</div>` +
    `</div>` +
    `<dl class="competitor-popup-stats">` +
    `<div>${metricDtHtml('task', `Task (${distanceUnitLabel})`)}<dd>${formatDistanceValue(entry.taskKm, preferences.distanceUnit)}` +
    `<span class="competitor-popup-muted"> (${Math.round(entry.taskPercent)}%)</span></dd></div>` +
    `<div>${metricDtHtml('lead', 'Lead (% time)')}<dd>${entry.leadPercent.toFixed(1)}</dd></div>` +
    `<div>${metricDtHtml('alt', `Alt (${altitudeUnitLabel})`)}<dd>${formatAltitudeValue(entry.alt, preferences.altitudeUnit)}</dd></div>` +
    `<div>${metricDtHtml('speed', `Speed (${speedUnit})`)}<dd>${formatGroundSpeedValue(entry.groundSpeedMps, preferences.speedUnit)}</dd></div>` +
    `<div>${metricDtHtml('vario', `Vario (${varioUnitLabel})`)}<dd class="competitor-popup-vario${varioClass}">${formatVerticalSpeedValue(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}</dd></div>` +
    `<div>${metricDtHtml('nextTp', 'Next TP')}<dd>${escapeHtml(formatNextTurnpointDisplay(entry.nextTurnpointName, entry.nextTurnpointNumber, entry.nextTurnpointRadiusM))}</dd></div>` +
    `</dl>` +
    `</div>`
  );
}
