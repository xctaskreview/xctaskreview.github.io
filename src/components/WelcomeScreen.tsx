import type { FlightTrack, XcTask } from '../lib/types';
import { extractGliderType, extractPilotDisplayName, extractPilotFileName } from '../lib/igc';
import { getTaskDisplayInfo } from '../lib/xctask';
import type { AppPreferences } from '../lib/preferences';
import { getMapTypeOptions, getSpeedUnitOptions, getTimezoneOptions, getVerticalSpeedUnitOptions } from '../lib/preferences';

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
  onTaskFile: (file: File) => void;
  onTrackFiles: (files: FileList | File[]) => void;
  onToggleTrack: (trackId: string, enabled: boolean) => void;
  onTrackColorChange: (trackId: string, color: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onRemoveAllTracks: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onContinue: () => void;
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
  onTaskFile,
  onTrackFiles,
  onToggleTrack,
  onTrackColorChange,
  onRemoveTrack,
  onRemoveAllTracks,
  onPreferencesChange,
  onContinue,
}: WelcomeScreenProps) {
  const updatePreference = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  const taskDisplay = task ? getTaskDisplayInfo(task, taskFileName) : null;

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <h1>XC Task Review</h1>
        <p className="welcome-lead">
          Load a competition task and competitor tracklogs to replay the race on a shared timeline.
        </p>

        <section className="welcome-section">
          <div className="welcome-section-header">
            <h2 className="welcome-section-title">Task</h2>
            <label className="welcome-inline-button">
              Load task
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

          <div className={`welcome-task-panel${task ? ' loaded' : ''}`}>
            {task && taskDisplay ? (
              <>
                <div className="welcome-task-name">{taskDisplay.name}</div>
                {taskLocationLoading ? (
                  <div className="welcome-task-meta">Looking up location…</div>
                ) : taskLocationLabel ? (
                  <div className="welcome-task-meta">{taskLocationLabel}</div>
                ) : null}
                {taskFileName && taskDisplay.name !== taskFileName.replace(/\.(xctsk|json)$/i, '') && (
                  <div className="welcome-task-file">{taskFileName}</div>
                )}
              </>
            ) : (
              <div className="welcome-task-empty">No task loaded yet</div>
            )}
          </div>
        </section>

        <section className="welcome-section">
          <div className="welcome-section-header">
            <h2 className="welcome-section-title">Tracks</h2>
            <div className="welcome-section-actions">
              <label className={`welcome-inline-button${task ? '' : ' disabled'}`}>
                Add tracks
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
              {tracks.length > 0 && (
                <button type="button" className="welcome-text-button danger" onClick={onRemoveAllTracks}>
                  Remove all
                </button>
              )}
            </div>
          </div>

          {!task && <p className="welcome-section-hint">Load a task before adding tracklogs.</p>}

          {tracks.length > 0 ? (
            <>
              <p className="welcome-section-hint">Uncheck pilots to hide them in the review.</p>
              <ul className="welcome-pilot-list">
                {tracks.map((track) => {
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
                      ×
                    </button>
                  </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="welcome-tracks-empty">No tracklogs loaded yet</div>
          )}
        </section>

        <div className="welcome-preferences">
          <h2 className="welcome-section-title">Preferences</h2>
          <div className="welcome-pref-grid">
            <label className="welcome-pref-field">
              Distance units
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
              Altitude units
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
              Speed units
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
              Vertical speed units
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
              Timezone
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
              Map type
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
          </div>
        </div>

        {canContinue && (
          <button type="button" className="welcome-continue" onClick={onContinue}>
            Continue to review
          </button>
        )}

        {error && <div className="welcome-error">{error}</div>}
      </div>
    </div>
  );
}
