import { useEffect, useMemo, useRef, useState } from 'react';
import type { FlightTrack, XcTask } from '../lib/types';
import {
  ArrowRight,
  Clock,
  Download,
  FileUp,
  FolderUp,
  Gauge,
  Map,
  MapPinned,
  Mountain,
  Route,
  Ruler,
  Search,
  Settings2,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { extractGliderType, extractPilotDisplayName, extractPilotFileName } from '../lib/igc';
import type { XcdemonImportResult } from '../lib/xcdemon';
import { getTaskDisplayInfo } from '../lib/xctask';
import type { AppPreferences } from '../lib/preferences';
import { getMapTypeOptions, getSpeedUnitOptions, getTimezoneOptions, getVerticalSpeedUnitOptions, normalizePilotTrailLengthM } from '../lib/preferences';
import { AppHomeLink } from './AppHomeLink';
import { FileDropZone } from './FileDropZone';
import { Icon, IconButtonContent, IconLabel, XcdemonButtonContent } from './Icon';
import { TaskEditForm } from './TaskEditForm';
import { XcdemonImportDialog } from './XcdemonImportDialog';

function getDistanceUnitOptions() {
  return [
    { value: 'km' as const, label: 'Kilometers (km)' },
    { value: 'mi' as const, label: 'Miles (mi)' },
  ];
}

function getAltitudeUnitOptions() {
  return [
    { value: 'm' as const, label: 'Meters (m)' },
    { value: 'ft' as const, label: 'Feet (ft)' },
  ];
}

interface WelcomeScreenProps {
  task: XcTask | null;
  taskFileName: string;
  taskLocationLabel: string | null;
  taskLocationLoading: boolean;
  tracks: FlightTrack[];
  enabledTrackIds: Set<string>;
  trackColors: Record<string, string>;
  preferences: AppPreferences;
  error: string | null;
  canContinue: boolean;
  onDismissError: () => void;
  onTaskFile: (file: File) => void;
  onTrackFiles: (files: FileList | File[]) => void;
  onToggleTrack: (trackId: string, enabled: boolean) => void;
  onTrackColorChange: (trackId: string, color: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onRemoveAllTracks: () => void;
  onSetTracksEnabled: (trackIds: string[], enabled: boolean) => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onContinue: () => void;
  onXcdemonImport: (result: XcdemonImportResult) => void;
  onSessionBundleImport: (file: File) => void;
  onSessionBundleExport: () => void;
  onError: (message: string) => void;
  onTaskUpdate: (task: XcTask) => void;
  onClearTask: () => void;
}

export function WelcomeScreen({
  task,
  taskFileName,
  taskLocationLabel,
  taskLocationLoading,
  tracks,
  enabledTrackIds,
  trackColors,
  preferences,
  error,
  canContinue,
  onDismissError,
  onTaskFile,
  onTrackFiles,
  onToggleTrack,
  onTrackColorChange,
  onRemoveTrack,
  onRemoveAllTracks,
  onSetTracksEnabled,
  onPreferencesChange,
  onContinue,
  onXcdemonImport,
  onSessionBundleImport,
  onSessionBundleExport,
  onError,
  onTaskUpdate,
  onClearTask,
}: WelcomeScreenProps) {
  const [xcdemonOpen, setXcdemonOpen] = useState(false);
  const [pilotSearch, setPilotSearch] = useState('');
  const selectAllRef = useRef<HTMLInputElement>(null);

  const updatePreference = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  const taskDisplay = task ? getTaskDisplayInfo(task, taskFileName) : null;

  const filteredTracks = useMemo(() => {
    const query = pilotSearch.trim().toLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) => {
      const pilotName = extractPilotDisplayName(track).toLowerCase();
      const fileName = extractPilotFileName(track).toLowerCase();
      return pilotName.includes(query) || fileName.includes(query);
    });
  }, [tracks, pilotSearch]);

  const filteredTrackIds = useMemo(() => filteredTracks.map((track) => track.id), [filteredTracks]);
  const allFilteredSelected =
    filteredTrackIds.length > 0 && filteredTrackIds.every((id) => enabledTrackIds.has(id));
  const noneFilteredSelected =
    filteredTrackIds.length > 0 && filteredTrackIds.every((id) => !enabledTrackIds.has(id));
  const someFilteredSelected = !allFilteredSelected && !noneFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  return (
    <div className="welcome-screen">
      <div className="welcome-scroll">
        <div className="welcome-card">
        <h1 className="welcome-title">
          <AppHomeLink iconSize="md" />
        </h1>
        <p className="welcome-lead">
          Load a competition task and competitor tracklogs to replay the race on a shared timeline.
        </p>

        <div className="welcome-xcdemon-import">
          <div className="welcome-xcdemon-import-label">Import from</div>
          <div className="welcome-import-buttons">
            <label className="welcome-inline-button welcome-file-import-button">
              <IconButtonContent icon={FileUp}>File</IconButtonContent>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onSessionBundleImport(file);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              className="welcome-inline-button xcdemon-import-button"
              onClick={() => setXcdemonOpen(true)}
            >
              <XcdemonButtonContent>XCDemon</XcdemonButtonContent>
            </button>
          </div>
        </div>

        <section className="welcome-section">
          <div className="welcome-section-header">
            <h2 className="welcome-section-title">
              <Icon icon={MapPinned} size="sm" />
              Task
            </h2>
            <div className="welcome-section-actions">
              <label className="welcome-inline-button">
                <IconButtonContent icon={FileUp}>Load task</IconButtonContent>
                <input
                  type="file"
                  accept=".xctsk,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onTaskFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          <FileDropZone
            accept={['.xctsk', '.json']}
            className={`welcome-task-panel${task ? ' loaded' : ''}`}
            onFiles={(files) => onTaskFile(files[0])}
          >
            {task && taskDisplay ? (
              <>
                <div className="welcome-task-header">
                  <div className="welcome-task-name">{taskDisplay.name}</div>
                  <button type="button" className="welcome-text-button danger" onClick={onClearTask}>
                    <IconButtonContent icon={Trash2}>Clear task</IconButtonContent>
                  </button>
                </div>
                {taskLocationLoading ? (
                  <div className="welcome-task-meta">Looking up location…</div>
                ) : taskLocationLabel ? (
                  <div className="welcome-task-meta">{taskLocationLabel}</div>
                ) : null}
                {taskFileName && taskDisplay.name !== taskFileName.replace(/\.(xctsk|json)$/i, '') && (
                  <div className="welcome-task-file">{taskFileName}</div>
                )}
                <TaskEditForm task={task} onChange={onTaskUpdate} />
              </>
            ) : (
              <div className="welcome-task-empty">No task loaded yet — drop a .xctsk or .json file here</div>
            )}
          </FileDropZone>
        </section>

        <section className="welcome-section">
          <div className="welcome-section-header">
            <h2 className="welcome-section-title">
              <Icon icon={Users} size="sm" />
              Tracks
            </h2>
            <div className="welcome-section-actions">
              <label className={`welcome-inline-button${task ? '' : ' disabled'}`}>
                <IconButtonContent icon={FolderUp}>Add tracks</IconButtonContent>
                <input
                  type="file"
                  accept=".igc,.zip"
                  multiple
                  disabled={!task}
                  onChange={(e) => {
                    if (e.target.files) onTrackFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {!task && <p className="welcome-section-hint">Load a task before adding tracklogs.</p>}

          <FileDropZone
            accept={['.igc', '.zip']}
            disabled={!task}
            multiple
            className={`welcome-tracks-drop-zone${tracks.length > 0 ? ' has-tracks' : ''}`}
            onFiles={onTrackFiles}
          >
            {tracks.length > 0 ? (
              <div className="welcome-pilot-list-wrapper">
                <div className="welcome-pilot-list-toolbar">
                  <div className="welcome-pilot-list-toolbar-main">
                    <label className="welcome-pilot-select-all">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allFilteredSelected}
                        disabled={filteredTrackIds.length === 0}
                        aria-label="Select all visible pilots"
                        onChange={(e) => onSetTracksEnabled(filteredTrackIds, e.target.checked)}
                      />
                    </label>
                    <label className="welcome-pilot-search">
                      <Icon icon={Search} size="sm" />
                      <input
                        type="search"
                        value={pilotSearch}
                        placeholder="Search pilots"
                        aria-label="Search pilots by name"
                        onChange={(e) => setPilotSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <button type="button" className="welcome-text-button danger" onClick={onRemoveAllTracks}>
                    <IconButtonContent icon={Trash2}>Remove all</IconButtonContent>
                  </button>
                </div>
                {filteredTracks.length > 0 ? (
                  <ul className="welcome-pilot-list">
                    {filteredTracks.map((track) => {
                      const pilotName = extractPilotDisplayName(track);
                      const gliderType = extractGliderType(track);

                      return (
                        <li key={track.id}>
                          <label className="welcome-pilot-item">
                            <input
                              type="checkbox"
                              checked={enabledTrackIds.has(track.id)}
                              onChange={(e) => onToggleTrack(track.id, e.target.checked)}
                            />
                            <input
                              type="color"
                              className="welcome-pilot-color"
                              value={trackColors[track.id] ?? '#4363d8'}
                              aria-label={`Color for ${pilotName}`}
                              onChange={(e) => onTrackColorChange(track.id, e.target.value)}
                            />
                            <span className="welcome-pilot-name">
                              <span className="welcome-pilot-line">
                                {pilotName}
                                <span className="welcome-pilot-file"> ({extractPilotFileName(track)})</span>
                              </span>
                              {gliderType && <span className="welcome-pilot-glider">{gliderType}</span>}
                            </span>
                          </label>
                          <button
                            type="button"
                            className="welcome-icon-button"
                            aria-label={`Remove ${pilotName}`}
                            onClick={() => onRemoveTrack(track.id)}
                          >
                            <Icon icon={X} size="sm" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="welcome-tracks-empty welcome-pilot-list-empty">
                    No pilots match “{pilotSearch.trim()}”.
                  </div>
                )}
              </div>
            ) : (
              <div className="welcome-tracks-empty">
                {task
                  ? 'No tracklogs loaded yet — drop .igc files or a .zip archive here'
                  : 'No tracklogs loaded yet'}
              </div>
            )}
          </FileDropZone>
        </section>

        <div className="welcome-preferences">
          <h2 className="welcome-section-title">
            <Icon icon={Settings2} size="sm" />
            Preferences
          </h2>
          <div className="welcome-pref-grid">
            <label className="welcome-pref-field">
              <IconLabel icon={Ruler}>Distance units</IconLabel>
              <select
                value={preferences.distanceUnit}
                onChange={(e) => updatePreference('distanceUnit', e.target.value as AppPreferences['distanceUnit'])}
              >
                {getDistanceUnitOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="welcome-pref-field">
              <IconLabel icon={Mountain}>Altitude units</IconLabel>
              <select
                value={preferences.altitudeUnit}
                onChange={(e) => updatePreference('altitudeUnit', e.target.value as AppPreferences['altitudeUnit'])}
              >
                {getAltitudeUnitOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="welcome-pref-field">
              <IconLabel icon={Gauge}>Speed units</IconLabel>
              <select
                value={preferences.speedUnit}
                onChange={(e) => updatePreference('speedUnit', e.target.value as AppPreferences['speedUnit'])}
              >
                {getSpeedUnitOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="welcome-pref-field">
              <IconLabel icon={TrendingUp}>Vertical speed units</IconLabel>
              <select
                value={preferences.verticalSpeedUnit}
                onChange={(e) =>
                  updatePreference('verticalSpeedUnit', e.target.value as AppPreferences['verticalSpeedUnit'])
                }
              >
                {getVerticalSpeedUnitOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="welcome-pref-field">
              <IconLabel icon={Clock}>Timezone</IconLabel>
              <select
                value={preferences.timezone}
                onChange={(e) => updatePreference('timezone', e.target.value)}
              >
                {getTimezoneOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="welcome-pref-field">
              <IconLabel icon={Map}>Map type</IconLabel>
              <select
                value={preferences.mapType}
                onChange={(e) => updatePreference('mapType', e.target.value as AppPreferences['mapType'])}
              >
                {getMapTypeOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="welcome-pref-field">
              <IconLabel icon={Route}>Pilot trail length (m)</IconLabel>
              <input
                type="number"
                min={0}
                max={20000}
                step={100}
                value={preferences.pilotTrailLengthM}
                onChange={(e) =>
                  updatePreference('pilotTrailLengthM', normalizePilotTrailLengthM(Number(e.target.value)))
                }
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="welcome-error">
            <span className="error-message-text">{error}</span>
            <button
              type="button"
              className="error-dismiss"
              aria-label="Dismiss error"
              onClick={onDismissError}
            >
              <Icon icon={X} size="sm" />
            </button>
          </div>
        )}
        </div>
      </div>

      <div className="welcome-action-panel">
        {task && (
          <button type="button" className="welcome-export-button" onClick={onSessionBundleExport}>
            <IconButtonContent icon={Download}>Export task and tracks</IconButtonContent>
          </button>
        )}
        <button
          type="button"
          className="welcome-continue"
          disabled={!canContinue}
          onClick={onContinue}
        >
          <IconButtonContent icon={ArrowRight}>Continue to review</IconButtonContent>
        </button>
      </div>

      <XcdemonImportDialog
        open={xcdemonOpen}
        onClose={() => setXcdemonOpen(false)}
        onImported={onXcdemonImport}
        onError={onError}
      />
    </div>
  );
}
