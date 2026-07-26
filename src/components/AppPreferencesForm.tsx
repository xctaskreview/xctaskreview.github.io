import { Eye, Gauge, Map, Mountain, RotateCw, Route, Ruler, Settings2, TrendingUp } from 'lucide-react';
import type { AppPreferences } from '../lib/preferences';
import {
  createDefaultPreferences,
  getMapTypeOptions,
  getSpeedUnitOptions,
  getVerticalSpeedUnitOptions,
  normalizeCirclingDetectionSampleSec,
  normalizeCirclingTurnRateDegPerS,
  normalizePilotTrailLengthM,
} from '../lib/preferences';
import { Icon, IconLabel } from './Icon';

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

interface AppPreferencesFormProps {
  preferences: AppPreferences;
  onPreferencesChange: (preferences: AppPreferences) => void;
  showHeading?: boolean;
  circlingDetectionDirty?: boolean;
  onRecomputeCirclingDetection?: () => void;
  onRestoreCirclingDefaults?: () => void;
}

export function AppPreferencesForm({
  preferences,
  onPreferencesChange,
  showHeading = true,
  circlingDetectionDirty = false,
  onRecomputeCirclingDetection,
  onRestoreCirclingDefaults,
}: AppPreferencesFormProps) {
  const updatePreference = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  const defaultCirclingPreferences = createDefaultPreferences();
  const circlingAtDefaults =
    preferences.circlingDetectionSampleSec === defaultCirclingPreferences.circlingDetectionSampleSec &&
    preferences.circlingTurnRateDegPerS === defaultCirclingPreferences.circlingTurnRateDegPerS;

  const restoreCirclingDefaults = () => {
    if (onRestoreCirclingDefaults) {
      onRestoreCirclingDefaults();
      return;
    }
    onPreferencesChange({
      ...preferences,
      circlingDetectionSampleSec: defaultCirclingPreferences.circlingDetectionSampleSec,
      circlingTurnRateDegPerS: defaultCirclingPreferences.circlingTurnRateDegPerS,
    });
  };

  return (
    <section className="app-preferences-form" aria-labelledby={showHeading ? 'app-preferences-heading' : undefined}>
      {showHeading && (
        <h2 id="app-preferences-heading" className="app-menu-section-title">
          <Icon icon={Settings2} size="sm" />
          Preferences
        </h2>
      )}
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

        <label className="welcome-pref-field welcome-pref-field--checkbox">
          <input
            type="checkbox"
            checked={preferences.showFutureTrail}
            onChange={(e) => updatePreference('showFutureTrail', e.target.checked)}
          />
          <IconLabel icon={Eye}>Full pilot path</IconLabel>
        </label>

        <div className="welcome-pref-circling-row">
          <div className="welcome-pref-circling-title">
            <IconLabel icon={RotateCw}>Circling</IconLabel>
            {!circlingAtDefaults && (
              <button
                type="button"
                className="welcome-pref-circling-restore"
                onClick={restoreCirclingDefaults}
              >
                Restore defaults
              </button>
            )}
          </div>
          <div className="welcome-pref-circling-fields">
            <label className="welcome-pref-field">
              <span>Sample window (s)</span>
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                value={preferences.circlingDetectionSampleSec}
                onChange={(e) =>
                  updatePreference(
                    'circlingDetectionSampleSec',
                    normalizeCirclingDetectionSampleSec(Number(e.target.value)),
                  )
                }
              />
            </label>
            <label className="welcome-pref-field">
              <span>Turn rate (°/s)</span>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={preferences.circlingTurnRateDegPerS}
                onChange={(e) =>
                  updatePreference(
                    'circlingTurnRateDegPerS',
                    normalizeCirclingTurnRateDegPerS(Number(e.target.value)),
                  )
                }
              />
            </label>
          </div>
          {circlingDetectionDirty && onRecomputeCirclingDetection && (
            <button
              type="button"
              className="welcome-pref-circling-recompute"
              onClick={onRecomputeCirclingDetection}
            >
              Recompute circling detection
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
