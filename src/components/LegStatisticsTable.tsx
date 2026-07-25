import {
  Clock,
  Gauge,
  MapPin,
  Route,
  Trophy,
  User,
} from 'lucide-react';
import type { GlobalLegStatistics } from '../lib/legStatistics';
import {
  formatLegStatisticsSpeedRange,
  formatLegStatisticsTimestamp,
  legStatisticsFirstName,
} from '../lib/legStatisticsDisplay';
import type { AppPreferences } from '../lib/preferences';
import { formatDistanceValue } from '../lib/preferences';
import { Icon } from './Icon';

interface LegStatisticsTableProps {
  legs: GlobalLegStatistics[];
  preferences: AppPreferences;
  timeZone: string;
  expanded: boolean;
}

export function LegStatisticsTable({ legs, preferences, timeZone, expanded }: LegStatisticsTableProps) {
  if (!expanded || legs.length === 0) return null;

  const distanceUnitLabel = preferences.distanceUnit === 'mi' ? 'mi' : 'km';
  const speedUnitLabel = preferences.speedUnit;

  return (
    <div className="leg-statistics-table-scroll">
      <div className="leg-statistics-table" role="table" aria-label="Legs stats">
        <div className="leg-statistics-header-row" role="row">
          <span className="leg-statistics-cell leg-statistics-leg" role="columnheader">
            <span className="leg-statistics-header-stack">
              <span className="leg-statistics-header-label">#</span>
            </span>
          </span>
          <span className="leg-statistics-cell leg-statistics-turnpoint" role="columnheader">
            <span className="leg-statistics-header-stack">
              <span className="leg-statistics-header-label">
                <Icon icon={MapPin} size="xs" />
                From
              </span>
            </span>
          </span>
          <span className="leg-statistics-cell leg-statistics-turnpoint" role="columnheader">
            <span className="leg-statistics-header-stack">
              <span className="leg-statistics-header-label">
                <Icon icon={MapPin} size="xs" />
                To
              </span>
            </span>
          </span>
          <span className="leg-statistics-cell leg-statistics-distance" role="columnheader">
            <span className="leg-statistics-header-stack">
              <span className="leg-statistics-header-label">
                <Icon icon={Route} size="xs" />
                Dist
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
          <span className="leg-statistics-cell leg-statistics-speed leg-statistics-fastest" role="columnheader">
            <span className="leg-statistics-header-stack">
              <span className="leg-statistics-header-label">
                <Icon icon={Gauge} size="xs" />
                Fastest
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
            const speeds = formatLegStatisticsSpeedRange(
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
                <span className="leg-statistics-cell leg-statistics-turnpoint" role="cell">
                  <span className="leg-statistics-turnpoint-name">{leg.fromTurnpoint.name}</span>
                </span>
                <span className="leg-statistics-cell leg-statistics-turnpoint" role="cell">
                  <span className="leg-statistics-turnpoint-name">{leg.toTurnpoint.name}</span>
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
                <span className="leg-statistics-cell leg-statistics-speed leg-statistics-fastest" role="cell">
                  {leg.maxSpeedMps !== undefined ? (
                    <span className="leg-statistics-fastest-inner">
                      <span>{speeds.max}</span>
                      {leg.fastestPilot && (
                        <span className="leg-statistics-fastest-pilot">
                          <Icon icon={User} size="xs" />
                          {legStatisticsFirstName(leg.fastestPilot)}
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="leg-statistics-cell leg-statistics-time" role="cell">
                  {formatLegStatisticsTimestamp(leg.earliestStartTime, timeZone)}
                </span>
                <span className="leg-statistics-cell leg-statistics-time" role="cell">
                  {formatLegStatisticsTimestamp(leg.latestStartTime, timeZone)}
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
                          {formatLegStatisticsTimestamp(leg.firstFinishTime, timeZone)}
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
  );
}
