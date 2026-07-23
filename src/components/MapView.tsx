import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { AppPreferences } from '../lib/preferences';
import { MAP_TILES } from '../lib/preferences';
import {
  circleKey,
  getDefaultTurnpointColor,
  turnpointIcon,
  type TaskMapLayerRefs,
} from '../lib/taskMapStyle';
import { getUniqueTurnpointMarkers } from '../lib/xctask';
import { LiveCompetitorLayer } from './LiveCompetitorLayer';
import { Scoreboard } from './Scoreboard';
import type { TaskProgressMarker } from '../lib/taskProgressMarker';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
import type { CompetitorSnapshot, OptimizedRoute, RoutePoint } from '../lib/types';

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

function TurnpointCircle({
  circle,
  route,
  layerRefs,
}: {
  circle: RoutePoint;
  route: OptimizedRoute;
  layerRefs: RefObject<TaskMapLayerRefs>;
}) {
  const circleRef = useRef<L.Circle>(null);
  const key = circleKey(circle);
  const color = getDefaultTurnpointColor(circle, route);

  useEffect(() => {
    const layer = circleRef.current;
    if (!layer || !layerRefs.current) return;

    layerRefs.current.circles.set(key, layer);
    return () => {
      layerRefs.current?.circles.delete(key);
    };
  }, [key, layerRefs]);

  return (
    <Circle
      ref={circleRef}
      center={[circle.lat, circle.lon]}
      radius={circle.radius}
      pathOptions={{
        color,
        weight: 2,
        fillOpacity: 0.08,
      }}
    >
      <Popup>{formatTurnpointPopup(circle)}</Popup>
    </Circle>
  );
}

function TurnpointMarker({
  circle,
  route,
  layerRefs,
}: {
  circle: RoutePoint;
  route: OptimizedRoute;
  layerRefs: RefObject<TaskMapLayerRefs>;
}) {
  const markerRef = useRef<L.Marker>(null);
  const key = `${circleKey(circle)}-marker`;
  const color = getDefaultTurnpointColor(circle, route);

  useEffect(() => {
    const layer = markerRef.current;
    if (!layer || !layerRefs.current) return;

    layerRefs.current.markers.set(key, layer);
    return () => {
      layerRefs.current?.markers.delete(key);
    };
  }, [key, layerRefs]);

  return (
    <Marker
      ref={markerRef}
      position={[circle.lat, circle.lon]}
      zIndexOffset={100}
      icon={turnpointIcon(color, circle.name ?? 'TP')}
    >
      <Popup>{formatTurnpointPopup(circle)}</Popup>
    </Marker>
  );
}

const MapTaskOverlay = memo(function MapTaskOverlay({
  circles,
  optimizedRoute,
  layerRefs,
}: {
  circles: RoutePoint[];
  optimizedRoute: OptimizedRoute;
  layerRefs: RefObject<TaskMapLayerRefs>;
}) {
  const turnpointMarkers = useMemo(() => getUniqueTurnpointMarkers(circles), [circles]);

  return (
    <>
      {circles.map((circle) => (
        <TurnpointCircle
          key={circleKey(circle)}
          circle={circle}
          route={optimizedRoute}
          layerRefs={layerRefs}
        />
      ))}

      {optimizedRoute.points.length > 1 && (
        <Polyline
          positions={optimizedRoute.points.map((p) => [p.lat, p.lon])}
          pathOptions={{ color: '#111827', weight: 1.5, dashArray: '6 5' }}
        />
      )}

      {turnpointMarkers.map((circle) => (
        <TurnpointMarker
          key={`marker-${circleKey(circle)}`}
          circle={circle}
          route={optimizedRoute}
          layerRefs={layerRefs}
        />
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
  const layerRefs = useRef<TaskMapLayerRefs>({
    circles: new Map(),
    markers: new Map(),
  });

  return (
    <div className="map-panel">
      <MapContainer bounds={bounds} scrollWheelZoom className="task-map" key={`${fitKey}-${preferences.mapType}`}>
        <TileLayer attribution={tile.attribution} url={tile.url} />
        <FitBounds bounds={bounds} fitKey={fitKey} />
        <MapTaskOverlay circles={circles} optimizedRoute={optimizedRoute} layerRefs={layerRefs} />
        <LiveCompetitorLayer
          tracks={enrichedTracks}
          route={optimizedRoute}
          circles={circles}
          layerRefs={layerRefs}
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
