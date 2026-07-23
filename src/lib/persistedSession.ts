import { getTrackEndTime, sanitizeTrackPointAltitudes } from './geo';
import { parseGliderTypeFromHeader } from './igc';
import type { AppPreferences } from './preferences';
import { createDefaultPreferences } from './preferences';
import type { FlightTrack, XcTask } from './types';

const STORAGE_KEY = 'xc-task-review-session';
const STORAGE_VERSION = 1;

interface StoredTrackPoint {
  time: string;
  lat: number;
  lon: number;
  alt: number;
}

interface StoredFlightTrack {
  id: string;
  pilotName: string;
  fileName: string;
  points: StoredTrackPoint[];
  date?: string;
  finishTime?: string;
  landingTime?: string;
  gliderType?: string;
  igcHeader?: string;
}

export interface PersistedSession {
  task: XcTask;
  taskFileName?: string;
  tracks: FlightTrack[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
}

interface StoredSessionPayload {
  version: number;
  task: XcTask;
  taskFileName?: string;
  tracks: StoredFlightTrack[];
  enabledTrackIds: string[];
  trackColors: Record<string, string>;
  preferences: AppPreferences;
}

function serializeTrack(track: FlightTrack): StoredFlightTrack {
  return {
    id: track.id,
    pilotName: track.pilotName,
    fileName: track.fileName,
    points: track.points.map((point) => ({
      time: point.time.toISOString(),
      lat: point.lat,
      lon: point.lon,
      alt: point.alt,
    })),
    date: track.date?.toISOString(),
    finishTime: track.finishTime?.toISOString(),
    landingTime: track.landingTime?.toISOString(),
    gliderType: track.gliderType,
    igcHeader: track.igcHeader,
  };
}

function deserializeTrack(track: StoredFlightTrack): FlightTrack {
  const points = sanitizeTrackPointAltitudes(
    track.points.map((point) => ({
      time: new Date(point.time),
      lat: point.lat,
      lon: point.lon,
      alt: point.alt,
    })),
  );

  return {
    id: track.id,
    pilotName: track.pilotName,
    fileName: track.fileName,
    points,
    date: track.date ? new Date(track.date) : undefined,
    finishTime: track.finishTime ? new Date(track.finishTime) : undefined,
    landingTime: getTrackEndTime(points),
    igcHeader: track.igcHeader,
    gliderType: track.gliderType ?? parseGliderTypeFromHeader(track.igcHeader ?? ''),
  };
}

function isValidTask(task: unknown): task is XcTask {
  if (!task || typeof task !== 'object') return false;
  const candidate = task as XcTask;
  return Array.isArray(candidate.turnpoints) && candidate.turnpoints.length > 0;
}

function isValidStoredSession(value: unknown): value is StoredSessionPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StoredSessionPayload;
  if (candidate.version !== STORAGE_VERSION) return false;
  if (!isValidTask(candidate.task)) return false;
  if (!Array.isArray(candidate.tracks)) return false;
  if (!Array.isArray(candidate.enabledTrackIds)) return false;
  if (!candidate.trackColors || typeof candidate.trackColors !== 'object') return false;
  if (!candidate.preferences || typeof candidate.preferences !== 'object') return false;
  return candidate.tracks.every(
    (track) =>
      typeof track.id === 'string' &&
      typeof track.pilotName === 'string' &&
      Array.isArray(track.points) &&
      track.points.length > 0,
  );
}

export function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredSession(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const tracks = parsed.tracks.map(deserializeTrack);
    const trackIds = new Set(tracks.map((track) => track.id));
    const enabledTrackIds = parsed.enabledTrackIds.filter((id) => trackIds.has(id));

    return {
      task: parsed.task,
      taskFileName: parsed.taskFileName,
      tracks,
      enabledTrackIds:
        tracks.length === 0
          ? []
          : enabledTrackIds.length > 0
            ? enabledTrackIds
            : tracks.map((track) => track.id),
      trackColors: parsed.trackColors,
      preferences: { ...createDefaultPreferences(), ...parsed.preferences },
    };
  } catch {
    return null;
  }
}

export function savePersistedSession(session: PersistedSession | null): boolean {
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    }

    const payload: StoredSessionPayload = {
      version: STORAGE_VERSION,
      task: session.task,
      taskFileName: session.taskFileName,
      tracks: session.tracks.map(serializeTrack),
      enabledTrackIds: session.enabledTrackIds,
      trackColors: session.trackColors,
      preferences: session.preferences,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
