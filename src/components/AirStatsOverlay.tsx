import { Circle, Marker } from 'react-leaflet';
import L from 'leaflet';
import type { GeneralAirStats } from '../lib/airStats';

interface AirStatsOverlayProps {
  airStats: GeneralAirStats | null;
  showThermalOverlay: boolean;
  showWindOverlay: boolean;
}

function thermalColor(strengthMps: number): string {
  if (strengthMps < 1) return '#fb923c';
  if (strengthMps < 2) return '#f97316';
  return '#ea580c';
}

function thermalFillOpacity(strengthMps: number): number {
  return Math.min(0.45, 0.15 + strengthMps * 0.08);
}

function windArrowIcon(directionDeg: number, speedMps: number): L.DivIcon {
  const rotation = directionDeg + 180;
  const length = Math.min(48, Math.max(24, 20 + speedMps * 4));

  return L.divIcon({
    className: 'wind-arrow-marker',
    html: `<div class="wind-arrow" style="transform: rotate(${rotation}deg); width: ${length}px"><span class="wind-arrow-line"></span><span class="wind-arrow-head"></span></div>`,
    iconSize: [length, length],
    iconAnchor: [length / 2, length / 2],
  });
}

export function AirStatsOverlay({
  airStats,
  showThermalOverlay,
  showWindOverlay,
}: AirStatsOverlayProps) {
  if (!airStats) return null;

  return (
    <>
      {showThermalOverlay &&
        airStats.thermals.map((thermal, index) => (
          <Circle
            key={`thermal-${index}-${thermal.lat.toFixed(5)}-${thermal.lon.toFixed(5)}`}
            center={[thermal.lat, thermal.lon]}
            radius={thermal.radiusM}
            pathOptions={{
              color: thermalColor(thermal.strengthMps),
              fillColor: thermalColor(thermal.strengthMps),
              fillOpacity: thermalFillOpacity(thermal.strengthMps),
              weight: 1,
              opacity: 0.5,
              interactive: false,
            }}
          />
        ))}

      {showWindOverlay &&
        airStats.windArrows.map((arrow, index) => (
          <Marker
            key={`wind-${index}-${arrow.lat.toFixed(5)}-${arrow.lon.toFixed(5)}`}
            position={[arrow.lat, arrow.lon]}
            icon={windArrowIcon(arrow.directionDeg, arrow.speedMps)}
            interactive={false}
          />
        ))}
    </>
  );
}
