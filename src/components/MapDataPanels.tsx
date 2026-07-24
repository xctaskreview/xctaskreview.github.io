import { useState } from 'react';
import { ChevronDown, ChevronUp, Route, Trophy } from 'lucide-react';
import type { GlobalLegStatistics } from '../lib/legStatistics';
import type { AppPreferences } from '../lib/preferences';
import type { CompetitorSnapshot } from '../lib/types';
import { Icon } from './Icon';
import { LegStatisticsTable } from './LegStatisticsTable';
import { Scoreboard } from './Scoreboard';

type ActivePanel = 'leaderboard' | 'leg-statistics';

interface MapDataPanelsProps {
  competitors: CompetitorSnapshot[];
  leadPercentages: Map<string, number>;
  legs: GlobalLegStatistics[];
  preferences: AppPreferences;
  playing: boolean;
}

export function MapDataPanels({
  competitors,
  leadPercentages,
  legs,
  preferences,
  playing,
}: MapDataPanelsProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel | null>(null);

  const showLeaderboard = competitors.length > 0;
  const showLegStatistics = legs.length > 0;

  if (!showLeaderboard && !showLegStatistics) return null;

  const leaderboardExpanded = activePanel === 'leaderboard';
  const legStatisticsExpanded = activePanel === 'leg-statistics';

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  return (
    <div
      className={`map-data-panels${activePanel ? ` expanded expanded-${activePanel}` : ''}`}
    >
      <div className="map-data-panels-toggles" role="toolbar" aria-label="Map data panels">
        {showLeaderboard && (
          <button
            type="button"
            className={`map-data-panel-toggle${leaderboardExpanded ? ' active' : ''}`}
            aria-expanded={leaderboardExpanded}
            onClick={() => togglePanel('leaderboard')}
          >
            <span className="map-data-panel-toggle-text">
              <Icon icon={Trophy} size="sm" />
              Leaderboard
            </span>
            <span className="map-data-panel-toggle-icon" aria-hidden="true">
              <Icon icon={leaderboardExpanded ? ChevronUp : ChevronDown} size="sm" />
            </span>
          </button>
        )}
        {showLegStatistics && (
          <button
            type="button"
            className={`map-data-panel-toggle${legStatisticsExpanded ? ' active' : ''}`}
            aria-expanded={legStatisticsExpanded}
            onClick={() => togglePanel('leg-statistics')}
          >
            <span className="map-data-panel-toggle-text">
              <Icon icon={Route} size="sm" />
              Leg statistics
            </span>
            <span className="map-data-panel-toggle-icon" aria-hidden="true">
              <Icon icon={legStatisticsExpanded ? ChevronUp : ChevronDown} size="sm" />
            </span>
          </button>
        )}
      </div>

      <Scoreboard
        competitors={competitors}
        leadPercentages={leadPercentages}
        preferences={preferences}
        playing={playing}
        expanded={leaderboardExpanded}
      />
      <LegStatisticsTable
        legs={legs}
        preferences={preferences}
        expanded={legStatisticsExpanded}
      />
    </div>
  );
}
