import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { AppPreferences } from '../lib/preferences';
import { MAP_TILES } from '../lib/preferences';
import {
  circleKey,
  formatProgressTurnpointLabel,
  getDefaultTurnpointColor,
  getPostGoalRouteSegments,
  getProgressRouteLegs,
  getTurnpointCirclePathOptions,
  LANDING_COLOR,
  ROUTE_DASH_ARRAY,
  turnpointIcon,
  type TaskMapLayerRefs,
} from '../lib/taskMapStyle';
import { getUniqueTurnpointMarkers } from '../lib/xctask';
import { LiveCompetitorLayer } from './LiveCompetitorLayer';
import { LegStatisticsPopupContent } from './LegStatisticsPopupContent';
import { MapDataPanels } from './MapDataPanels';
import { MapLegend } from './MapLegend';
import type { GlobalLegStatistics } from '../lib/legStatistics';
import type { TaskProgressMarker, TurnpointReachMarker } from '../lib/taskProgressMarker';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
import { buildReachMarkerMap, buildTurnpointTooltipFromCircle } from '../lib/turnpointTooltip';
import { TurnpointPopupContent } from './TurnpointHoverTooltip';
import type { CompetitorSnapshot, OptimizedRoute, RoutePoint } from '../lib/types';
import type { DistanceUnit } from '../lib/preferences';

function formatTurnpointPopup(
  circle: RoutePoint,
  route: OptimizedRoute,
  reachMarker: TurnpointReachMarker | undefined,
  taskStart: Date | undefined,
  distanceUnit: DistanceUnit,
) {
  const tooltip = buildTurnpointTooltipFromCircle(circle, route, reachMarker, {
    distanceUnit,
    taskStart,
  });
  return <TurnpointPopupContent tooltip={tooltip} />;
}

function formatRouteLegPopup(legNumber: number, fromLabel: string, toLabel: string) {
  return (
    <>
      Leg {legNumber}
      <br />
      From: {fromLabel}
      <br />
      To: {toLabel}
    </>
  );
}

function RouteLegPolyline({
  legNumber,
  fromLabel,
  toLabel,
  positions,
  leg,
  preferences,
}: {
  legNumber: number;
  fromLabel: string;
  toLabel: string;
  positions: [[number, number], [number, number]];
  leg?: GlobalLegStatistics;
  preferences: AppPreferences;
}) {
  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#111827',
          weight: 1.5,
          dashArray: ROUTE_DASH_ARRAY,
          interactive: false,
        }}
      />
      <Polyline
        positions={positions}
        className="route-leg-hit-area"
        pathOptions={{
          color: '#111827',
          weight: 12,
          opacity: 0.01,
        }}
      >
        <Popup>
          {leg ? (
            <LegStatisticsPopupContent leg={leg} preferences={preferences} />
          ) : (
            formatRouteLegPopup(legNumber, fromLabel, toLabel)
          )}
        </Popup>
      </Polyline>
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
  reachMarker,
  taskStart,
  distanceUnit,
}: {
  circle: RoutePoint;
  route: OptimizedRoute;
  layerRefs: RefObject<TaskMapLayerRefs>;
  reachMarker?: TurnpointReachMarker;
  taskStart?: Date;
  distanceUnit: DistanceUnit;
}) {
  const circleRef = useRef<L.Circle>(null);
  const key = circleKey(circle);

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
      pathOptions={getTurnpointCirclePathOptions(circle, route, false)}
    >
      <Popup>{formatTurnpointPopup(circle, route, reachMarker, taskStart, distanceUnit)}</Popup>
    </Circle>
  );
}

function TurnpointMarker({
  circle,
  route,
  layerRefs,
  reachMarker,
  taskStart,
  distanceUnit,
}: {
  circle: RoutePoint;
  route: OptimizedRoute;
  layerRefs: RefObject<TaskMapLayerRefs>;
  reachMarker?: TurnpointReachMarker;
  taskStart?: Date;
  distanceUnit: DistanceUnit;
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
      <Popup>{formatTurnpointPopup(circle, route, reachMarker, taskStart, distanceUnit)}</Popup>
    </Marker>
  );
}

const MapTaskOverlay = memo(function MapTaskOverlay({
  circles,
  optimizedRoute,
  layerRefs,
  reachMarkerByNumber,
  taskStart,
  distanceUnit,
  legStatistics,
  preferences,
}: {
  circles: RoutePoint[];
  optimizedRoute: OptimizedRoute;
  layerRefs: RefObject<TaskMapLayerRefs>;
  reachMarkerByNumber: Map<number, TurnpointReachMarker>;
  taskStart?: Date;
  distanceUnit: DistanceUnit;
  legStatistics: GlobalLegStatistics[];
  preferences: AppPreferences;
}) {
  const turnpointMarkers = useMemo(() => getUniqueTurnpointMarkers(circles), [circles]);
  const routeLegs = useMemo(() => getProgressRouteLegs(optimizedRoute), [optimizedRoute]);
  const legStatsByNumber = useMemo(
    () => new Map(legStatistics.map((leg) => [leg.legNumber, leg])),
    [legStatistics],
  );
  const postGoalLegs = useMemo(() => getPostGoalRouteSegments(optimizedRoute), [optimizedRoute]);
  const preRacePoints =
    optimizedRoute.sssIndex > 0 ? optimizedRoute.points.slice(0, optimizedRoute.sssIndex + 1) : [];

  return (
    <>
      {circles.map((circle) => (
        <TurnpointCircle
          key={circleKey(circle)}
          circle={circle}
          route={optimizedRoute}
          layerRefs={layerRefs}
          reachMarker={circle.number !== undefined ? reachMarkerByNumber.get(circle.number) : undefined}
          taskStart={taskStart}
          distanceUnit={distanceUnit}
        />
      ))}

      {preRacePoints.length > 1 && (
        <Polyline
          positions={preRacePoints.map((p) => [p.lat, p.lon])}
          pathOptions={{
            color: LANDING_COLOR,
            weight: 1.5,
            dashArray: ROUTE_DASH_ARRAY,
            interactive: false,
          }}
        />
      )}

      {routeLegs.map((leg) => (
        <RouteLegPolyline
          key={leg.legNumber}
          legNumber={leg.legNumber}
          fromLabel={formatProgressTurnpointLabel(leg.from)}
          toLabel={formatProgressTurnpointLabel(leg.to)}
          leg={legStatsByNumber.get(leg.legNumber)}
          preferences={preferences}
          positions={[
            [leg.points[0].lat, leg.points[0].lon],
            [leg.points[1].lat, leg.points[1].lon],
          ]}
        />
      ))}

      {postGoalLegs.map((segment, index) => (
        <Polyline
          key={`post-goal-${index}`}
          positions={[
            [segment[0].lat, segment[0].lon],
            [segment[1].lat, segment[1].lon],
          ]}
          pathOptions={{
            color: LANDING_COLOR,
            weight: 1.5,
            dashArray: ROUTE_DASH_ARRAY,
            interactive: false,
          }}
        />
      ))}

      {turnpointMarkers.map((circle) => (
        <TurnpointMarker
          key={`marker-${circleKey(circle)}`}
          circle={circle}
          route={optimizedRoute}
          layerRefs={layerRefs}
          reachMarker={circle.number !== undefined ? reachMarkerByNumber.get(circle.number) : undefined}
          taskStart={taskStart}
          distanceUnit={distanceUnit}
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
  legStatistics: GlobalLegStatistics[];
  taskStart?: Date;
  trackKey: string;
  taskProgressMarkerRef: RefObject<TaskProgressMarker | null>;
  turnpointReachMarkers: TurnpointReachMarker[];
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
  legStatistics,
  taskStart,
  trackKey,
  taskProgressMarkerRef,
  turnpointReachMarkers,
}: MapViewProps) {
  const tile = MAP_TILES[preferences.mapType];
  const layerRefs = useRef<TaskMapLayerRefs>({
    circles: new Map(),
    markers: new Map(),
  });
  const reachMarkerByNumber = useMemo(
    () => buildReachMarkerMap(turnpointReachMarkers),
    [turnpointReachMarkers],
  );

  return (
    <div className="map-panel">
      <MapContainer bounds={bounds} scrollWheelZoom className="task-map" key={`${fitKey}-${preferences.mapType}`}>
        <TileLayer attribution={tile.attribution} url={tile.url} />
        <FitBounds bounds={bounds} fitKey={fitKey} />
        <MapTaskOverlay
          circles={circles}
          optimizedRoute={optimizedRoute}
          layerRefs={layerRefs}
          reachMarkerByNumber={reachMarkerByNumber}
          taskStart={taskStart}
          distanceUnit={preferences.distanceUnit}
          legStatistics={legStatistics}
          preferences={preferences}
        />
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
          leadPercentages={leadPercentages}
        />
      </MapContainer>
      <MapLegend />
      <MapDataPanels
        competitors={scoreboardCompetitors}
        leadPercentages={leadPercentages}
        legs={legStatistics}
        preferences={preferences}
        playing={playing}
      />
    </div>
  );
}
