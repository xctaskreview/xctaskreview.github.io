import { ChevronDown, ChevronUp, Route, Trophy, X } from 'lucide-react';
import { LANDED_COLOR } from '../lib/geo';
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
  selectedPilotTrackId: string | null;
  onSelectPilot: (trackId: string) => void;
  onClosePilotDetail: () => void;
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
  selectedPilotTrackId,
  onSelectPilot,
  onClosePilotDetail,
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

  const pilotMarkerColor = selectedPilotEntry
    ? selectedPilotEntry.landed
      ? LANDED_COLOR
      : selectedPilotEntry.color
    : null;

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
        {showPilotDetail && selectedPilotEntry && pilotMarkerColor && (
          <div
            className={`map-data-panel-pilot-tab${pilotDetailExpanded ? ' active' : ''}`}
          >
            <button
              type="button"
              className={`map-data-panel-toggle map-data-panel-toggle-pilot${pilotDetailExpanded ? ' active' : ''}`}
              aria-expanded={pilotDetailExpanded}
              onClick={() => togglePanel('pilot-detail')}
            >
              <span className="map-data-panel-toggle-text">
                <span
                  className="scoreboard-color map-data-panel-pilot-color"
                  style={{ background: pilotMarkerColor }}
                  aria-hidden="true"
                />
                <span className="map-data-panel-pilot-title">
                  {selectedPilotEntry.position === 1 ? (
                    <>
                      <Icon icon={Trophy} size="xs" className="scoreboard-leader-trophy" />
                      {selectedPilotEntry.pilotName}
                    </>
                  ) : selectedPilotEntry.position > 0 ? (
                    `#${selectedPilotEntry.position} ${selectedPilotEntry.pilotName}`
                  ) : (
                    selectedPilotEntry.pilotName
                  )}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="pilot-detail-close map-data-panel-pilot-close"
              aria-label="Close pilot stats and show overall task progress"
              onClick={onClosePilotDetail}
            >
              <Icon icon={X} size="sm" />
            </button>
          </div>
        )}
      </div>

      <Scoreboard
        competitors={competitors}
        leadPercentages={leadPercentages}
        enabledTrackIds={enabledTrackIds}
        onToggleTrack={onToggleTrack}
        progressFocusTrackId={progressFocusTrackId}
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
