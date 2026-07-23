import { useEffect, useRef, type RefObject } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { clampDisplayAltitudeMeters, LANDED_COLOR } from '../lib/geo';
import { pilotFirstName } from '../lib/igc';
import { formatAltitude, formatDistance, type AppPreferences } from '../lib/preferences';
import { colorForIndex, getTrackSnapshotAtTime } from '../lib/tracks';
import type { EnrichedFlightTrack } from '../lib/taskProgress';
import type { OptimizedRoute } from '../lib/types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createCompetitorIcon(
  color: string,
  firstName: string,
  altitudeLabel: string,
  landed: boolean,
): L.DivIcon {
  const markerColor = landed ? LANDED_COLOR : color;
  const labelBoxClass = landed ? 'competitor-label-box landed' : 'competitor-label-box';

  return L.divIcon({
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

interface MarkerEntry {
  marker: L.Marker;
  altEl: HTMLSpanElement | null;
  markerEl: HTMLDivElement | null;
  columnEl: HTMLDivElement | null;
  color: string;
  firstName: string;
  landed: boolean;
}

interface LiveCompetitorLayerProps {
  tracks: EnrichedFlightTrack[];
  route: OptimizedRoute;
  trackColors: Record<string, string>;
  currentTimeRef: RefObject<Date>;
  preferences: AppPreferences;
  playing: boolean;
  pausedTime: Date;
}

export function LiveCompetitorLayer({
  tracks,
  route,
  trackColors,
  currentTimeRef,
  preferences,
  playing,
  pausedTime,
}: LiveCompetitorLayerProps) {
  const map = useMap();
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const tracksRef = useRef(tracks);
  const routeRef = useRef(route);
  const trackColorsRef = useRef(trackColors);
  const preferencesRef = useRef(preferences);

  tracksRef.current = tracks;
  routeRef.current = route;
  trackColorsRef.current = trackColors;
  preferencesRef.current = preferences;

  useEffect(() => {
    const markers = markersRef.current;
    const activeIds = new Set(tracks.map((track) => track.id));

    for (const id of [...markers.keys()]) {
      if (!activeIds.has(id)) {
        markers.get(id)?.marker.remove();
        markers.delete(id);
      }
    }

    for (const track of tracks) {
      if (markers.has(track.id)) continue;

      const color = trackColors[track.id] ?? colorForIndex(0);
      const firstName = pilotFirstName(track.pilotName);
      const icon = createCompetitorIcon(color, firstName, '—', false);
      const marker = L.marker([0, 0], { icon, zIndexOffset: 1000 });
      marker.bindPopup('');
      marker.addTo(map);

      const element = marker.getElement();
      const columnEl = element?.querySelector<HTMLDivElement>('.competitor-marker-column') ?? null;
      const markerEl = element?.querySelector<HTMLDivElement>('.competitor-marker') ?? null;
      const altEl = element?.querySelector<HTMLSpanElement>('.competitor-alt') ?? null;

      markers.set(track.id, {
        marker,
        altEl,
        markerEl,
        columnEl,
        color,
        firstName,
        landed: false,
      });
    }
  }, [tracks, trackColors, map]);

  useEffect(() => {
    return () => {
      for (const entry of markersRef.current.values()) {
        entry.marker.remove();
      }
      markersRef.current.clear();
    };
  }, [map]);

  useEffect(() => {
    const taskDistanceKm = route.progressTotalDistance / 1000;

    const syncMarker = (track: EnrichedFlightTrack, time: Date) => {
      const entry = markersRef.current.get(track.id);
      if (!entry) return;

      const snapshot = getTrackSnapshotAtTime(track, time, routeRef.current);
      if (!snapshot) {
        entry.marker.setOpacity(0);
        return;
      }

      entry.marker.setOpacity(1);
      entry.marker.setLatLng([snapshot.lat, snapshot.lon]);
      entry.marker.setZIndexOffset(snapshot.landed ? 900 : 1000);

      const prefs = preferencesRef.current;
      const altLabel = formatAltitude(clampDisplayAltitudeMeters(snapshot.alt), prefs.altitudeUnit);
      const taskKm = (snapshot.taskPercent / 100) * taskDistanceKm;

      if (entry.altEl) {
        entry.altEl.textContent = altLabel;
      }

      if (entry.landed !== snapshot.landed || entry.color !== (trackColorsRef.current[track.id] ?? entry.color)) {
        entry.landed = snapshot.landed;
        entry.color = trackColorsRef.current[track.id] ?? entry.color;
        const markerColor = snapshot.landed ? LANDED_COLOR : entry.color;
        if (entry.markerEl) {
          entry.markerEl.style.background = markerColor;
        }
        if (entry.columnEl) {
          entry.columnEl.classList.toggle('landed', snapshot.landed);
        }
      }

      entry.marker.setPopupContent(
        `<strong>${escapeHtml(track.pilotName)}</strong><br>` +
          `${formatDistance(taskKm, prefs.distanceUnit)} / ${snapshot.taskPercent.toFixed(1)}%<br>` +
          `${altLabel}`,
      );
    };

    const syncAll = (time: Date) => {
      for (const track of tracksRef.current) {
        syncMarker(track, time);
      }
    };

    if (!playing) {
      syncAll(pausedTime);
      return;
    }

    let rafId = 0;
    const loop = () => {
      syncAll(currentTimeRef.current);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [playing, pausedTime, currentTimeRef, route]);

  return null;
}
