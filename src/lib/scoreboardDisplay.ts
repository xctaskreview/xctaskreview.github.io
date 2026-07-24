import { LANDED_COLOR } from './geo';
import { trophyIconHtml } from './trophyIcon';
import type { AppPreferences } from './preferences';
import {
  formatAltitudeValue,
  formatDistanceValue,
  formatGroundSpeedValue,
  formatVerticalSpeedValue,
  speedUnitLabel,
} from './preferences';
import type { CompetitorSnapshot } from './types';

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

export function sortScoreboardEntries(competitors: CompetitorSnapshot[]): ScoreboardEntry[] {
  return [...competitors]
    .sort((a, b) => {
      if (b.taskKm !== a.taskKm) return b.taskKm - a.taskKm;
      if (b.taskPercent !== a.taskPercent) return b.taskPercent - a.taskPercent;
      return a.pilotName.localeCompare(b.pilotName);
    })
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
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
  const varioClass =
    entry.verticalSpeedMps > 0.2
      ? ' climbing'
      : entry.verticalSpeedMps < -0.2
        ? ' sinking'
        : '';

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
    `<div><dt>Task (${distanceUnitLabel})</dt><dd>${formatDistanceValue(entry.taskKm, preferences.distanceUnit)}` +
    `<span class="competitor-popup-muted"> (${entry.taskPercent.toFixed(1)}%)</span></dd></div>` +
    `<div><dt>Lead (%)</dt><dd>${entry.leadPercent.toFixed(1)}</dd></div>` +
    `<div><dt>Alt (${altitudeUnitLabel})</dt><dd>${formatAltitudeValue(entry.alt, preferences.altitudeUnit)}</dd></div>` +
    `<div><dt>Speed (${speedUnit})</dt><dd>${formatGroundSpeedValue(entry.groundSpeedMps, preferences.speedUnit)}</dd></div>` +
    `<div><dt>V/S (${varioUnitLabel})</dt><dd class="competitor-popup-vario${varioClass}">${formatVerticalSpeedValue(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}</dd></div>` +
    `<div><dt>Next TP</dt><dd>${escapeHtml(entry.nextTurnpointName || '—')}</dd></div>` +
    `</dl>` +
    `</div>`
  );
}
