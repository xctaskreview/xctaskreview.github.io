import { Flame, Wind } from 'lucide-react';
import type { AppPreferences } from '../lib/preferences';
import { IconButtonContent } from './Icon';

interface MapOverlayControlsProps {
  preferences: AppPreferences;
  onPreferencesChange: (preferences: AppPreferences) => void;
}

export function MapOverlayControls({ preferences, onPreferencesChange }: MapOverlayControlsProps) {
  const showThermalOverlay = preferences.showThermalOverlay ?? false;
  const showWindOverlay = preferences.showWindOverlay ?? false;

  return (
    <div className="map-overlay-controls">
      <button
        type="button"
        className={`map-overlay-toggle${showThermalOverlay ? ' active' : ''}`}
        aria-pressed={showThermalOverlay}
        onClick={() =>
          onPreferencesChange({ ...preferences, showThermalOverlay: !showThermalOverlay })
        }
      >
        <IconButtonContent icon={Flame}>Thermal</IconButtonContent>
      </button>
      <button
        type="button"
        className={`map-overlay-toggle${showWindOverlay ? ' active' : ''}`}
        aria-pressed={showWindOverlay}
        onClick={() => onPreferencesChange({ ...preferences, showWindOverlay: !showWindOverlay })}
      >
        <IconButtonContent icon={Wind}>Wind</IconButtonContent>
      </button>
    </div>
  );
}
