import { ChevronDown, ChevronUp, Route, Trophy, User } from 'lucide-react';
import type { GlobalLegStatistics } from '../lib/legStatistics';
import type { AppPreferences } from '../lib/preferences';
import type { CompetitorSnapshot } from '../lib/types';
import type { ScoreboardEntry } from '../lib/scoreboardDisplay';
import { Icon } from './Icon';
import { LegStatisticsTable } from './LegStatisticsTable';
import { PilotDetailPanel } from './PilotDetailPanel';
import { Scoreboard } from './Scoreboard';

type ActivePanel = 'leaderboard' | 'leg-statistics' | 'pilot-detail';

export type MapDataActivePanel = ActivePanel;

interface MapDataPanelsProps {
  competitors: CompetitorSnapshot[];
  leadPercentages: Map<string, number>;
  enabledTrackIds: Set<string>;
  onToggleTrack: (trackId: string, enabled: boolean) => void;
  progressFocusTrackId: string | null;
  onProgressFocusTrack: (trackId: string) => void;
  selectedPilotTrackId: string | null;
  onSelectPilot: (trackId: string) => void;
  selectedPilotEntry: ScoreboardEntry | null;
  activePanel: ActivePanel | null;
  onActivePanelChange: (panel: ActivePanel | null) => void;
  legs: GlobalLegStatistics[];
  preferences: AppPreferences;
  playing: boolean;
}

export function MapDataPanels({
  competitors,
  leadPercentages,
  enabledTrackIds,
  onToggleTrack,
  progressFocusTrackId,
  onProgressFocusTrack,
  selectedPilotTrackId,
  onSelectPilot,
  selectedPilotEntry,
  activePanel,
  onActivePanelChange,
  legs,
  preferences,
  playing,
}: MapDataPanelsProps) {
  const showLeaderboard = competitors.length > 0;
  const showLegStatistics = legs.length > 0;
  const showPilotDetail = selectedPilotTrackId !== null;

  const pilotTabLabel = selectedPilotEntry?.pilotName ?? 'Pilot';

  if (!showLeaderboard && !showLegStatistics && !showPilotDetail) return null;

  const leaderboardExpanded = activePanel === 'leaderboard';
  const legStatisticsExpanded = activePanel === 'leg-statistics';
  const pilotDetailExpanded = activePanel === 'pilot-detail';

  const togglePanel = (panel: ActivePanel) => {
    onActivePanelChange(activePanel === panel ? null : panel);
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
              Legs stats
            </span>
            <span className="map-data-panel-toggle-icon" aria-hidden="true">
              <Icon icon={legStatisticsExpanded ? ChevronUp : ChevronDown} size="sm" />
            </span>
          </button>
        )}
        {showPilotDetail && (
          <button
            type="button"
            className={`map-data-panel-toggle map-data-panel-toggle-pilot${pilotDetailExpanded ? ' active' : ''}`}
            aria-expanded={pilotDetailExpanded}
            onClick={() => togglePanel('pilot-detail')}
          >
            <span className="map-data-panel-toggle-text">
              <Icon icon={User} size="sm" />
              <span className="map-data-panel-pilot-name">{pilotTabLabel}</span>
            </span>
            <span className="map-data-panel-toggle-icon" aria-hidden="true">
              <Icon icon={pilotDetailExpanded ? ChevronUp : ChevronDown} size="sm" />
            </span>
          </button>
        )}
      </div>

      <Scoreboard
        competitors={competitors}
        leadPercentages={leadPercentages}
        enabledTrackIds={enabledTrackIds}
        onToggleTrack={onToggleTrack}
        progressFocusTrackId={progressFocusTrackId}
        onProgressFocusTrack={onProgressFocusTrack}
        selectedPilotTrackId={selectedPilotTrackId}
        onSelectPilot={onSelectPilot}
        preferences={preferences}
        playing={playing}
        expanded={leaderboardExpanded}
      />
      <LegStatisticsTable
        legs={legs}
        preferences={preferences}
        expanded={legStatisticsExpanded}
      />
      <PilotDetailPanel
        entry={selectedPilotEntry}
        competitors={competitors}
        preferences={preferences}
        expanded={pilotDetailExpanded}
      />
    </div>
  );
}
