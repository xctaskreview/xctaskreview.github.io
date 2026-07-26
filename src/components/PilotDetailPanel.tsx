import { formatDuration } from '../lib/geo';
import type { AppPreferences } from '../lib/preferences';
import {
  formatAltitude,
  formatDistance,
  formatGroundSpeed,
  formatVerticalSpeed,
} from '../lib/preferences';
import type { CompetitorSnapshot } from '../lib/types';
import { getTaskDistanceBehindLeaderKm, type ScoreboardEntry } from '../lib/scoreboardDisplay';
import { formatNextTurnpointDisplay } from '../lib/taskProgress';

interface PilotDetailPanelProps {
  entry: ScoreboardEntry | null;
  competitors: CompetitorSnapshot[];
  preferences: AppPreferences;
  sssCrossDelaySec: number | null;
  expanded: boolean;
}

export function PilotDetailPanel({
  entry,
  competitors,
  preferences,
  sssCrossDelaySec,
  expanded,
}: PilotDetailPanelProps) {
  if (!expanded || !entry) return null;

  const distanceBehindKm = getTaskDistanceBehindLeaderKm(entry, competitors);
  const varioClass =
    entry.verticalSpeedMps > 0.2 ? ' climbing' : entry.verticalSpeedMps < -0.2 ? ' sinking' : '';
  const isCircling = entry.flyingMode === 'circling';

  const formatGlideRatio = (ratio: number | null) =>
    ratio != null && Number.isFinite(ratio) && ratio > 0 ? `${ratio.toFixed(1)}:1` : '—';

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
            <dt>Dist</dt>
            <dd>
              {formatDistance(entry.taskKm, preferences.distanceUnit)}
              <span className="competitor-popup-muted"> ({Math.round(entry.taskPercent)}%)</span>
            </dd>
          </div>
          {distanceBehindKm != null && (
            <div>
              <dt>Behind</dt>
              <dd>{formatDistance(distanceBehindKm, preferences.distanceUnit)}</dd>
            </div>
          )}
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
            <dt>Vario</dt>
            <dd className={`competitor-popup-vario${varioClass}`}>
              {formatVerticalSpeed(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}
            </dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd className={isCircling ? 'pilot-detail-mode-circling' : 'pilot-detail-mode-glide'}>
              {isCircling ? 'Circling' : 'On glide'}
            </dd>
          </div>
          {isCircling ? (
            <>
              <div>
                <dt>Thermal gain</dt>
                <dd>
                  {entry.thermalGainM >= 0 ? '+' : ''}
                  {Math.round(entry.thermalGainM)} m
                </dd>
              </div>
              <div>
                <dt>Circle time</dt>
                <dd>{formatDuration(entry.circlingDurationSec * 1000)}</dd>
              </div>
              <div>
                <dt>Avg vario</dt>
                <dd>
                  {formatVerticalSpeed(entry.averageThermalVarioMps, preferences.verticalSpeedUnit)}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Glide</dt>
                <dd>{formatGlideRatio(entry.glideRatio)}</dd>
              </div>
              <div>
                <dt>Avg glide</dt>
                <dd>{formatGlideRatio(entry.averageGlideRatio)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Crossed SSS</dt>
            <dd>
              {sssCrossDelaySec !== null
                ? `-${formatDuration(sssCrossDelaySec * 1000)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Next TP</dt>
            <dd>
              {formatNextTurnpointDisplay(
                entry.nextTurnpointName,
                entry.nextTurnpointNumber,
                entry.nextTurnpointRadiusM,
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
