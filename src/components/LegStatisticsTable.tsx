import { ArrowRight, Clock, Gauge, Hash, MapPin, Route, Trophy, User } from 'lucide-react';
import { formatTime } from '../lib/geo';
import type { GlobalLegStatistics } from '../lib/legStatistics';
import type { AppPreferences } from '../lib/preferences';
import { formatDistanceValue, formatGroundSpeedValue } from '../lib/preferences';
import { formatProgressTurnpointLabel } from '../lib/taskMapStyle';
import { Icon } from './Icon';

interface LegStatisticsTableProps {
  legs: GlobalLegStatistics[];
  preferences: AppPreferences;
}

function formatSpeedRange(
  minMps: number | undefined,
  avgMps: number | undefined,
  maxMps: number | undefined,
  speedUnit: AppPreferences['speedUnit'],
): { min: string; avg: string; max: string } {
  return {
    min: minMps !== undefined ? formatGroundSpeedValue(minMps, speedUnit) : '—',
    avg: avgMps !== undefined ? formatGroundSpeedValue(avgMps, speedUnit) : '—',
    max: maxMps !== undefined ? formatGroundSpeedValue(maxMps, speedUnit) : '—',
  };
}

function formatTimestamp(date: Date | undefined, timezone: string): string {
  return date ? formatTime(date, timezone) : '—';
}

export function LegStatisticsTable({ legs, preferences }: LegStatisticsTableProps) {
  if (legs.length === 0) return null;

  const distanceUnitLabel = preferences.distanceUnit === 'mi' ? 'mi' : 'km';
  const speedUnitLabel = preferences.speedUnit;

  return (
    <section className="leg-statistics" aria-label="Leg statistics">
      <div className="leg-statistics-header">
        <span className="leg-statistics-title">
          <Icon icon={Route} size="sm" />
          Leg statistics
        </span>
      </div>

      <div className="leg-statistics-table-scroll">
        <div className="leg-statistics-table" role="table">
          <div className="leg-statistics-header-row" role="row">
            <span className="leg-statistics-cell leg-statistics-leg" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Hash} size="xs" />
                  Leg
                </span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-turnpoints" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={MapPin} size="xs" />
                  Turnpoints
                </span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-distance" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Route} size="xs" />
                  Distance
                </span>
                <span className="leg-statistics-header-unit">{distanceUnitLabel}</span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-speed" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Gauge} size="xs" />
                  Min
                </span>
                <span className="leg-statistics-header-unit">{speedUnitLabel}</span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-speed" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Gauge} size="xs" />
                  Avg
                </span>
                <span className="leg-statistics-header-unit">{speedUnitLabel}</span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-speed" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Gauge} size="xs" />
                  Max
                </span>
                <span className="leg-statistics-header-unit">{speedUnitLabel}</span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-time" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Clock} size="xs" />
                  Earliest start
                </span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-time" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Clock} size="xs" />
                  Latest start
                </span>
              </span>
            </span>
            <span className="leg-statistics-cell leg-statistics-first-finish" role="columnheader">
              <span className="leg-statistics-header-stack">
                <span className="leg-statistics-header-label">
                  <Icon icon={Trophy} size="xs" />
                  First finish
                </span>
              </span>
            </span>
          </div>

          <div className="leg-statistics-body" role="rowgroup">
            {legs.map((leg) => {
              const speeds = formatSpeedRange(
                leg.minSpeedMps,
                leg.avgSpeedMps,
                leg.maxSpeedMps,
                preferences.speedUnit,
              );
              const distanceKm = leg.distanceM / 1000;

              return (
                <div key={leg.legNumber} className="leg-statistics-row" role="row">
                  <span className="leg-statistics-cell leg-statistics-leg" role="cell">
                    {leg.legNumber}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-turnpoints" role="cell">
                    <span className="leg-statistics-turnpoint-route">
                      <span className="leg-statistics-turnpoint-name">
                        {formatProgressTurnpointLabel(leg.fromTurnpoint)}
                      </span>
                      <Icon icon={ArrowRight} size="xs" className="leg-statistics-turnpoint-arrow" />
                      <span className="leg-statistics-turnpoint-name">
                        {formatProgressTurnpointLabel(leg.toTurnpoint)}
                      </span>
                    </span>
                  </span>
                  <span className="leg-statistics-cell leg-statistics-distance" role="cell">
                    {formatDistanceValue(distanceKm, preferences.distanceUnit)}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-speed" role="cell">
                    {speeds.min}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-speed" role="cell">
                    {speeds.avg}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-speed" role="cell">
                    {speeds.max}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-time" role="cell">
                    {formatTimestamp(leg.earliestStartTime, preferences.timezone)}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-time" role="cell">
                    {formatTimestamp(leg.latestStartTime, preferences.timezone)}
                  </span>
                  <span className="leg-statistics-cell leg-statistics-first-finish" role="cell">
                    {leg.firstFinishPilot ? (
                      <span className="leg-statistics-first-finish-inner">
                        <span className="leg-statistics-first-finish-pilot">
                          <Icon icon={User} size="xs" />
                          {leg.firstFinishPilot}
                        </span>
                        {leg.firstFinishTime && (
                          <span className="leg-statistics-muted">
                            {formatTimestamp(leg.firstFinishTime, preferences.timezone)}
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
