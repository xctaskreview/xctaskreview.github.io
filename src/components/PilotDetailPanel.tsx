import { Trophy } from 'lucide-react';
import { LANDED_COLOR } from '../lib/geo';
import type { AppPreferences } from '../lib/preferences';
import {
  formatAltitudeValue,
  formatDistanceValue,
  formatGroundSpeedValue,
  formatVerticalSpeedValue,
  speedUnitLabel,
} from '../lib/preferences';
import type { CompetitorSnapshot } from '../lib/types';
import { getTaskDistanceBehindLeaderKm, type ScoreboardEntry } from '../lib/scoreboardDisplay';
import { Icon } from './Icon';

interface PilotDetailPanelProps {
  entry: ScoreboardEntry | null;
  competitors: CompetitorSnapshot[];
  preferences: AppPreferences;
  expanded: boolean;
}

export function PilotDetailPanel({ entry, competitors, preferences, expanded }: PilotDetailPanelProps) {
  if (!expanded || !entry) return null;

  const distanceBehindKm = getTaskDistanceBehindLeaderKm(entry, competitors);
  const markerColor = entry.landed ? LANDED_COLOR : entry.color;
  const distanceUnitLabel = preferences.distanceUnit === 'mi' ? 'mi' : 'km';
  const altitudeUnitLabel = preferences.altitudeUnit === 'ft' ? 'ft' : 'm';
  const speedUnit = speedUnitLabel(preferences.speedUnit);
  const varioUnitLabel = preferences.verticalSpeedUnit;
  const varioClass =
    entry.verticalSpeedMps > 0.2 ? ' climbing' : entry.verticalSpeedMps < -0.2 ? ' sinking' : '';

  return (
    <div className="pilot-detail-panel">
      <div className="pilot-detail-card competitor-popup">
        <div className="competitor-popup-header">
          <span className="competitor-popup-color" style={{ background: markerColor }} />
          <div>
            <strong className="pilot-detail-card-title">
              {entry.position === 1 ? (
                <>
                  <Icon icon={Trophy} size="xs" className="scoreboard-leader-trophy" />
                  {entry.pilotName}
                </>
              ) : entry.position > 0 ? (
                `#${entry.position} ${entry.pilotName}`
              ) : (
                entry.pilotName
              )}
            </strong>
            {entry.gliderType && <div className="competitor-popup-glider">{entry.gliderType}</div>}
          </div>
        </div>
        <dl className="competitor-popup-stats">
          <div>
            <dt>Task ({distanceUnitLabel})</dt>
            <dd>
              {formatDistanceValue(entry.taskKm, preferences.distanceUnit)}
              {distanceBehindKm != null && (
                <span className="competitor-popup-muted">
                  {' '}
                  · {formatDistanceValue(distanceBehindKm, preferences.distanceUnit)} behind
                </span>
              )}
              <span className="competitor-popup-muted"> ({Math.round(entry.taskPercent)}%)</span>
            </dd>
          </div>
          <div>
            <dt>Lead (%)</dt>
            <dd>{entry.leadPercent.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Alt ({altitudeUnitLabel})</dt>
            <dd>{formatAltitudeValue(entry.alt, preferences.altitudeUnit)}</dd>
          </div>
          <div>
            <dt>Speed ({speedUnit})</dt>
            <dd>{formatGroundSpeedValue(entry.groundSpeedMps, preferences.speedUnit)}</dd>
          </div>
          <div>
            <dt>V/S ({varioUnitLabel})</dt>
            <dd className={`competitor-popup-vario${varioClass}`}>
              {formatVerticalSpeedValue(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}
            </dd>
          </div>
          <div>
            <dt>Next TP</dt>
            <dd>{entry.nextTurnpointName || '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
