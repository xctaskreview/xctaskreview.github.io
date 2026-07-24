import type { AppPreferences } from '../lib/preferences';
import {
  formatAltitude,
  formatDistance,
  formatGroundSpeed,
  formatVerticalSpeed,
} from '../lib/preferences';
import type { CompetitorSnapshot } from '../lib/types';
import { getTaskDistanceBehindLeaderKm, type ScoreboardEntry } from '../lib/scoreboardDisplay';
import { formatNextTurnpointLabel } from '../lib/taskProgress';

interface PilotDetailPanelProps {
  entry: ScoreboardEntry | null;
  competitors: CompetitorSnapshot[];
  preferences: AppPreferences;
  expanded: boolean;
}

export function PilotDetailPanel({ entry, competitors, preferences, expanded }: PilotDetailPanelProps) {
  if (!expanded || !entry) return null;

  const distanceBehindKm = getTaskDistanceBehindLeaderKm(entry, competitors);
  const varioClass =
    entry.verticalSpeedMps > 0.2 ? ' climbing' : entry.verticalSpeedMps < -0.2 ? ' sinking' : '';

  return (
    <div className="pilot-detail-panel">
      <div className="pilot-detail-card competitor-popup">
        <dl className="competitor-popup-stats pilot-detail-stats">
          {entry.gliderType && (
            <div>
              <dt>Wing</dt>
              <dd>{entry.gliderType}</dd>
            </div>
          )}
          <div>
            <dt>Task</dt>
            <dd>
              {formatDistance(entry.taskKm, preferences.distanceUnit)}
              {distanceBehindKm != null && (
                <span className="competitor-popup-muted">
                  {' '}
                  · {formatDistance(distanceBehindKm, preferences.distanceUnit)} behind
                </span>
              )}
              <span className="competitor-popup-muted"> ({Math.round(entry.taskPercent)}%)</span>
            </dd>
          </div>
          <div>
            <dt>Lead</dt>
            <dd>{entry.leadPercent.toFixed(1)} %</dd>
          </div>
          <div>
            <dt>Alt</dt>
            <dd>{formatAltitude(entry.alt, preferences.altitudeUnit)}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{formatGroundSpeed(entry.groundSpeedMps, preferences.speedUnit)}</dd>
          </div>
          <div>
            <dt>V/S</dt>
            <dd className={`competitor-popup-vario${varioClass}`}>
              {formatVerticalSpeed(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}
            </dd>
          </div>
          <div>
            <dt>Next TP</dt>
            <dd>{formatNextTurnpointLabel(entry.nextTurnpointName, entry.nextTurnpointNumber)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
