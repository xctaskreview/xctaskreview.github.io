import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { AppPreferences } from '../lib/preferences';
import { formatAltitude, formatDistance, MAP_TILES } from '../lib/preferences';
import { LANDED_COLOR } from '../lib/geo';
import { getUniqueTurnpointMarkers } from '../lib/xctask';
import { Scoreboard } from './Scoreboard';
import type { CompetitorSnapshot, OptimizedRoute, RoutePoint } from '../lib/types';

const GOAL_COLOR = '#dc2626';

function turnpointIcon(color: string, name: string): L.DivIcon {
  return new L.DivIcon({
    className: 'turnpoint-marker-container',
    html: `<div class="turnpoint-marker-column">
      <div class="turnpoint-cross" style="color:${color}"></div>
      <span class="turnpoint-label">${escapeHtml(name)}</span>
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function matchesGoal(circle: RoutePoint, route: OptimizedRoute): boolean {
  return (
    circle.lat === route.goalCenter.lat &&
    circle.lon === route.goalCenter.lon &&
    circle.radius === route.goalRadius
  );
}

function getCircleColor(circle: RoutePoint, route: OptimizedRoute): string {
  if (matchesGoal(circle, route)) return GOAL_COLOR;
  if (circle.type === 'SSS') return '#2563eb';
  if (circle.type === 'ESS') return GOAL_COLOR;
  return '#64748b';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function competitorIcon(
  color: string,
  firstName: string,
  altitudeLabel: string,
  landed: boolean,
): L.DivIcon {
  const markerColor = landed ? LANDED_COLOR : color;
  const labelBoxClass = landed ? 'competitor-label-box landed' : 'competitor-label-box';

  return new L.DivIcon({
    className: 'competitor-marker-container',
    html: `<div class="competitor-marker-column${landed ? ' landed' : ''}">
      <div class="competitor-marker" style="background:${markerColor}"></div>
      <div class="${labelBoxClass}">
        <span class="competitor-label">${escapeHtml(firstName)}</span>
        <span class="competitor-alt">${escapeHtml(altitudeLabel)}</span>
      </div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ bounds, fitKey }: { bounds: [[number, number], [number, number]]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [0, 0], maxZoom: 15 });
  }, [map, bounds, fitKey]);
  return null;
}

interface MapViewProps {
  bounds: [[number, number], [number, number]];
  circles: RoutePoint[];
  optimizedRoute: OptimizedRoute;
  competitors: CompetitorSnapshot[];
  fitKey: string;
  preferences: AppPreferences;
  playing: boolean;
}

export function MapView({
  bounds,
  circles,
  optimizedRoute,
  competitors,
  fitKey,
  preferences,
  playing,
}: MapViewProps) {
  const tile = MAP_TILES[preferences.mapType];
  const turnpointMarkers = useMemo(() => getUniqueTurnpointMarkers(circles), [circles]);

  return (
    <div className="map-panel">
      <MapContainer bounds={bounds} scrollWheelZoom className="task-map" key={`${fitKey}-${preferences.mapType}`}>
        <TileLayer attribution={tile.attribution} url={tile.url} />
        <FitBounds bounds={bounds} fitKey={fitKey} />

        {circles.map((circle) => (
          <Circle
            key={`${circle.name}-${circle.radius}-${circle.lat}`}
            center={[circle.lat, circle.lon]}
            radius={circle.radius}
            pathOptions={{
              color: getCircleColor(circle, optimizedRoute),
              weight: 2,
              fillOpacity: 0.08,
            }}
          >
            <Popup>
              {circle.name} ({circle.radius}m)
            </Popup>
          </Circle>
        ))}

        {optimizedRoute.points.length > 1 && (
          <Polyline
            positions={optimizedRoute.points.map((p) => [p.lat, p.lon])}
            pathOptions={{ color: '#111827', weight: 1.5, dashArray: '6 5' }}
          />
        )}

        {turnpointMarkers.map((circle) => (
          <Marker
            key={`marker-${circle.name}-${circle.lat}-${circle.lon}`}
            position={[circle.lat, circle.lon]}
            zIndexOffset={100}
            icon={turnpointIcon(getCircleColor(circle, optimizedRoute), circle.name ?? 'TP')}
          >
            <Popup>
              {circle.name} ({circle.radius}m)
            </Popup>
          </Marker>
        ))}

        {competitors.map((competitor) => (
          <Marker
            key={competitor.id}
            position={[competitor.lat, competitor.lon]}
            zIndexOffset={competitor.landed ? 900 : 1000}
            icon={competitorIcon(
              competitor.color,
              competitor.firstName,
              formatAltitude(competitor.alt, preferences.altitudeUnit),
              competitor.landed,
            )}
          >
            <Popup>
              <strong>{competitor.pilotName}</strong>
              <br />
              {formatDistance(competitor.taskKm, preferences.distanceUnit)} / {competitor.taskPercent.toFixed(1)}%
              <br />
              {formatAltitude(competitor.alt, preferences.altitudeUnit)}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <Scoreboard competitors={competitors} preferences={preferences} playing={playing} />
    </div>
  );
}
