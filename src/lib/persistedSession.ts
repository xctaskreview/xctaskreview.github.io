import { getTrackEndTime, sanitizeTrackPointAltitudes } from './geo';
import { parseGliderTypeFromHeader } from './igc';
import type { AppPreferences } from './preferences';
import { createDefaultPreferences } from './preferences';
import type { FlightTrack, XcTask } from './types';

const DB_NAME = 'xc-task-review';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const SESSION_ID = 'current';
const LEGACY_STORAGE_KEY = 'xc-task-review-session';
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

function deserializeSession(payload: StoredSessionPayload): PersistedSession {
  const tracks = payload.tracks.map(deserializeTrack);
  const trackIds = new Set(tracks.map((track) => track.id));
  const enabledTrackIds = payload.enabledTrackIds.filter((id) => trackIds.has(id));

  return {
    task: payload.task,
    taskFileName: payload.taskFileName,
    tracks,
    enabledTrackIds:
      tracks.length === 0
        ? []
        : enabledTrackIds.length > 0
          ? enabledTrackIds
          : tracks.map((track) => track.id),
    trackColors: payload.trackColors,
    preferences: { ...createDefaultPreferences(), ...payload.preferences },
  };
}

function loadLegacyLocalStorageSession(): StoredSessionPayload | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredSession(parsed)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);

        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error ?? new Error('Failed to read session'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Failed to save session'));
        };
      }),
  );
}

function idbDelete(key: string): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Failed to clear session'));
        };
      }),
  );
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  try {
    const stored = await idbGet<StoredSessionPayload>(SESSION_ID);
    if (stored && isValidStoredSession(stored)) {
      return deserializeSession(stored);
    }

    const legacy = loadLegacyLocalStorageSession();
    if (!legacy) return null;

    const session = deserializeSession(legacy);
    await savePersistedSession(session);
    return session;
  } catch {
    const legacy = loadLegacyLocalStorageSession();
    return legacy ? deserializeSession(legacy) : null;
  }
}

export async function savePersistedSession(session: PersistedSession | null): Promise<boolean> {
  try {
    if (!session) {
      await idbDelete(SESSION_ID);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
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

    await idbSet(SESSION_ID, payload);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function clearPersistedSession(): Promise<void> {
  try {
    await idbDelete(SESSION_ID);
  } catch {
    // Ignore storage cleanup failures.
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
