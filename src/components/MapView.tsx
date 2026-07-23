import { memo, useEffect, useMemo, type RefObject } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { AppPreferences } from '../lib/preferences';
import { MAP_TILES } from '../lib/preferences';
import { getUniqueTurnpointMarkers } from '../lib/xctask';
import { LiveCompetitorLayer } from './LiveCompetitorLayer';
import { Scoreboard } from './Scoreboard';
import type { TaskProgressMarker } from '../lib/taskProgressMarker';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
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

function formatTurnpointPopup(circle: RoutePoint) {
  const name = circle.name ?? 'Turnpoint';
  const title = circle.number !== undefined ? `#${circle.number} ${name}` : name;

  return (
    <>
      {title}
      <br />
      Radius: {circle.radius} m
    </>
  );
}

function FitBounds({ bounds, fitKey }: { bounds: [[number, number], [number, number]]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [0, 0], maxZoom: 15 });
  }, [map, bounds, fitKey]);
  return null;
}

const MapTaskOverlay = memo(function MapTaskOverlay({
  circles,
  optimizedRoute,
}: {
  circles: RoutePoint[];
  optimizedRoute: OptimizedRoute;
}) {
  const turnpointMarkers = useMemo(() => getUniqueTurnpointMarkers(circles), [circles]);

  return (
    <>
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
          <Popup>{formatTurnpointPopup(circle)}</Popup>
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
          <Popup>{formatTurnpointPopup(circle)}</Popup>
        </Marker>
      ))}
    </>
  );
});

interface MapViewProps {
  bounds: [[number, number], [number, number]];
  circles: RoutePoint[];
  optimizedRoute: OptimizedRoute;
  enrichedTracks: EnrichedFlightTrack[];
  trackColors: Record<string, string>;
  currentTimeRef: RefObject<Date>;
  leadPercentages: Map<string, number>;
  fitKey: string;
  preferences: AppPreferences;
  playing: boolean;
  pausedTime: Date;
  scoreboardCompetitors: CompetitorSnapshot[];
  taskStart?: Date;
  trackKey: string;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
}

export function MapView({
  bounds,
  circles,
  optimizedRoute,
  enrichedTracks,
  trackColors,
  currentTimeRef,
  leadPercentages,
  fitKey,
  preferences,
  playing,
  pausedTime,
  scoreboardCompetitors,
  taskStart,
  trackKey,
  taskProgressMarkerRef,
}: MapViewProps) {
  const tile = MAP_TILES[preferences.mapType];

  return (
    <div className="map-panel">
      <MapContainer bounds={bounds} scrollWheelZoom className="task-map" key={`${fitKey}-${preferences.mapType}`}>
        <TileLayer attribution={tile.attribution} url={tile.url} />
        <FitBounds bounds={bounds} fitKey={fitKey} />
        <MapTaskOverlay circles={circles} optimizedRoute={optimizedRoute} />
        <LiveCompetitorLayer
          tracks={enrichedTracks}
          route={optimizedRoute}
          trackColors={trackColors}
          currentTimeRef={currentTimeRef}
          preferences={preferences}
          playing={playing}
          pausedTime={pausedTime}
          taskStart={taskStart}
          trackKey={trackKey}
          taskProgressMarkerRef={taskProgressMarkerRef}
        />
      </MapContainer>
      <Scoreboard
        competitors={scoreboardCompetitors}
        leadPercentages={leadPercentages}
        preferences={preferences}
        playing={playing}
      />
    </div>
  );
}
