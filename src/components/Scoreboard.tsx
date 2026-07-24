import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crown,
  Gauge,
  Hash,
  MapPin,
  Mountain,
  Route,
  TrendingUp,
  User,
} from 'lucide-react';
import { LANDED_COLOR } from '../lib/geo';
import type { AppPreferences } from '../lib/preferences';
import {
  formatAltitudeValue,
  formatDistanceValue,
  formatGroundSpeedValue,
  formatVerticalSpeedValue,
} from '../lib/preferences';
import type { CompetitorSnapshot } from '../lib/types';
import { Icon } from './Icon';
import { sortScoreboardEntries, type ScoreboardEntry } from '../lib/scoreboardDisplay';

const UPDATE_INTERVAL_MS = 1000;
const ROW_HEIGHT = 56;

interface ScoreboardProps {
  competitors: CompetitorSnapshot[];
  leadPercentages: Map<string, number>;
  preferences: AppPreferences;
  playing: boolean;
  expanded: boolean;
}

function useThrottledCompetitors(
  competitors: CompetitorSnapshot[],
  playing: boolean,
  intervalMs: number,
): CompetitorSnapshot[] {
  const [displayed, setDisplayed] = useState(competitors);
  const lastUpdateRef = useRef(0);
  const pendingRef = useRef(competitors);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    pendingRef.current = competitors;

    if (!playing) {
      window.clearTimeout(timeoutRef.current);
      lastUpdateRef.current = 0;
      setDisplayed(competitors);
      return;
    }

    const now = Date.now();
    const elapsed = lastUpdateRef.current === 0 ? intervalMs : now - lastUpdateRef.current;

    const commit = () => {
      lastUpdateRef.current = Date.now();
      setDisplayed(pendingRef.current);
    };

    if (elapsed >= intervalMs) {
      window.clearTimeout(timeoutRef.current);
      commit();
      return;
    }

    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(commit, intervalMs - elapsed);

    return () => window.clearTimeout(timeoutRef.current);
  }, [competitors, playing, intervalMs]);

  return displayed;
}

function buildScoreboardLayout(entries: ScoreboardEntry[]) {
  const rankById = new Map(entries.map((entry, index) => [entry.id, index]));
  const renderEntries = [...entries].sort((a, b) => a.id.localeCompare(b.id));

  return { rankById, renderEntries };
}

export function Scoreboard({
  competitors,
  leadPercentages,
  preferences,
  playing,
  expanded,
}: ScoreboardProps) {
  const displayedCompetitors = useThrottledCompetitors(competitors, playing, UPDATE_INTERVAL_MS);
  const entries = useMemo(
    () =>
      sortScoreboardEntries(
        displayedCompetitors.map((entry) => ({
          ...entry,
          leadPercent: leadPercentages.get(entry.id) ?? 0,
        })),
      ),
    [displayedCompetitors, leadPercentages],
  );
  const { rankById, renderEntries } = useMemo(() => buildScoreboardLayout(entries), [entries]);

  if (!expanded || entries.length === 0) return null;

  const distanceUnitLabel = preferences.distanceUnit === 'mi' ? 'mi' : 'km';
  const speedUnitLabel = preferences.speedUnit;
  const altitudeUnitLabel = preferences.altitudeUnit === 'ft' ? 'ft' : 'm';
  const varioUnitLabel = preferences.verticalSpeedUnit;

  return (
    <div className="scoreboard-table-scroll">
      <div className="scoreboard-table" role="table" aria-label="Pilot leaderboard">
        <div className="scoreboard-header-row" role="row">
          <span className="scoreboard-cell scoreboard-pos" role="columnheader">
            <Icon icon={Hash} size="xs" />
          </span>
          <span className="scoreboard-cell scoreboard-pilot" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={User} size="xs" />
                Pilot
              </span>
            </span>
          </span>
          <span className="scoreboard-cell scoreboard-task" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={Route} size="xs" />
                Task
              </span>
              <span className="scoreboard-header-unit">{distanceUnitLabel}</span>
            </span>
          </span>
          <span className="scoreboard-cell scoreboard-lead" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={Crown} size="xs" />
                Lead
              </span>
              <span className="scoreboard-header-unit">%</span>
            </span>
          </span>
          <span className="scoreboard-cell scoreboard-alt" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={Mountain} size="xs" />
                Alt
              </span>
              <span className="scoreboard-header-unit">{altitudeUnitLabel}</span>
            </span>
          </span>
          <span className="scoreboard-cell scoreboard-speed" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={Gauge} size="xs" />
                Speed
              </span>
              <span className="scoreboard-header-unit">{speedUnitLabel}</span>
            </span>
          </span>
          <span className="scoreboard-cell scoreboard-vario" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={TrendingUp} size="xs" />
                V/S
              </span>
              <span className="scoreboard-header-unit">{varioUnitLabel}</span>
            </span>
          </span>
          <span className="scoreboard-cell scoreboard-next-tp" role="columnheader">
            <span className="scoreboard-header-stack">
              <span className="scoreboard-header-label">
                <Icon icon={MapPin} size="xs" />
                Next TP
              </span>
            </span>
          </span>
        </div>

        <div
          className="scoreboard-body"
          style={{ height: entries.length * ROW_HEIGHT }}
          role="rowgroup"
        >
          {renderEntries.map((entry) => {
            const markerColor = entry.landed ? LANDED_COLOR : entry.color;
            const rank = rankById.get(entry.id) ?? 0;

            return (
              <div
                key={entry.id}
                className={`scoreboard-row${entry.landed ? ' landed' : ''}`}
                style={{
                  transform: `translateY(${rank * ROW_HEIGHT}px)`,
                  zIndex: entries.length - rank,
                }}
                role="row"
              >
                <span className="scoreboard-cell scoreboard-pos" role="cell">
                  {entry.position}
                </span>
                <span className="scoreboard-cell scoreboard-pilot" role="cell">
                  <span className="scoreboard-pilot-inner">
                    <span className="scoreboard-color" style={{ background: markerColor }} />
                    <span className="scoreboard-pilot-text">
                      <span className="scoreboard-name">{entry.pilotName}</span>
                      {entry.gliderType && (
                        <span className="scoreboard-glider">{entry.gliderType}</span>
                      )}
                    </span>
                  </span>
                </span>
                <span className="scoreboard-cell scoreboard-task" role="cell">
                  <span className="scoreboard-task-inner">
                    <span>{formatDistanceValue(entry.taskKm, preferences.distanceUnit)}</span>
                    <span className="scoreboard-muted">{entry.taskPercent.toFixed(1)}%</span>
                  </span>
                </span>
                <span className="scoreboard-cell scoreboard-lead" role="cell">
                  {entry.leadPercent.toFixed(1)}%
                </span>
                <span className="scoreboard-cell scoreboard-alt" role="cell">
                  {formatAltitudeValue(entry.alt, preferences.altitudeUnit)}
                </span>
                <span className="scoreboard-cell scoreboard-speed" role="cell">
                  {formatGroundSpeedValue(entry.groundSpeedMps, preferences.speedUnit)}
                </span>
                <span
                  className={`scoreboard-cell scoreboard-vario${
                    entry.verticalSpeedMps > 0.2
                      ? ' climbing'
                      : entry.verticalSpeedMps < -0.2
                        ? ' sinking'
                        : ''
                  }`}
                  role="cell"
                >
                  {formatVerticalSpeedValue(entry.verticalSpeedMps, preferences.verticalSpeedUnit)}
                </span>
                <span className="scoreboard-cell scoreboard-next-tp" role="cell">
                  <span className="scoreboard-next-tp-name">
                    {entry.nextTurnpointName ?? '—'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
